"""Langkah 8: kirim digest ke petani via WAHA -> 08_delivery.jsonl.

Hanya penerima ber-role 'petani' (view v_news_recipients) yang kabupatennya sama dengan digest.
Idempoten: kiriman yang sudah tercatat (lokal state/sent.jsonl atau tabel news_deliveries) tidak diulang.
notify.enabled=false atau --dry-run => tidak ada pesan terkirim, hanya dicatat DRY_RUN.
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
import time

import requests

from .config import today_wib
from .storage import read_csv, read_jsonl, supabase_from_ctx, write_jsonl

log = logging.getLogger("news.notify")


def normalize_phone(raw: str) -> str | None:
    """Nomor HP Indonesia -> format WhatsApp 628xxxxxxxxx; selain itu None."""
    d = re.sub(r"\D", "", str(raw or ""))
    if d.startswith("620"):
        d = "62" + d[3:]
    elif d.startswith("0"):
        d = "62" + d[1:]
    elif d.startswith("8"):
        d = "62" + d
    return d if re.fullmatch(r"628\d{8,12}", d) else None


def _norm_kab(s: str) -> str:
    return re.sub(r"^(kabupaten|kab\.?)\s+", "", (s or "").strip(), flags=re.I).casefold()


def load_recipients(ctx, sb) -> list[dict]:
    nc = ctx.cfg["notify"]
    if nc["recipients_source"] == "csv":
        rows = read_csv(ctx.resolve(nc["recipients_csv"]))
        if rows and "role" not in rows[0]:
            raise ValueError("recipients_csv wajib punya kolom role (hanya role=petani yang dikirimi)")
        rows = [r for r in rows if (r.get("role") or "").strip().lower() == "petani"]   # role kosong = bukan petani
    else:
        if sb is None:
            raise RuntimeError("recipients_source=supabase tetapi storage.supabase.enabled=false")
        rows = sb.select("v_news_recipients", {"select": "user_id,phone,name,kabupaten"})
    return [r for r in rows if r.get("user_id") and r.get("phone")]


def send_waha(nc: dict, api_key: str, phone: str, text: str) -> str | None:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-Api-Key"] = api_key
    r = requests.post(nc["waha_url"].rstrip("/") + "/api/sendText", headers=headers, timeout=30,
                      json={"session": nc["session"], "chatId": f"{phone}@c.us", "text": text})
    if r.status_code >= 400:
        raise RuntimeError(f"WAHA {r.status_code}: {r.text[:200]}")
    try:
        body = r.json()
        return str(body.get("id") or body.get("key", {}).get("id") or "") or None
    except ValueError:
        return None


def run(ctx) -> int:
    nc = ctx.cfg["notify"]
    digests = json.loads(ctx.path("07_digest.json").read_text(encoding="utf-8"))
    ready = [d for d in digests if d["status"] == "READY" and d["content"]]
    if not ready:
        log.info("Tidak ada digest untuk dikirim")
        write_jsonl(ctx.path("08_delivery.jsonl"), [])
        return 0
    live = bool(nc["enabled"]) and not ctx.dry_run
    if live and ctx.run_date != today_wib() and not ctx.extras.get("allow_backdated_send"):
        raise RuntimeError(f"Menolak kirim WA untuk tanggal {ctx.run_date} (bukan hari ini). "
                           "Pakai --dry-run untuk backfill, atau --allow-backdated-send bila memang disengaja.")
    lock = ctx.state_dir / "notify.lock"
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)   # cegah dua proses kirim bersamaan
    except FileExistsError:
        raise RuntimeError(f"Proses notify lain sedang berjalan ({lock}). Hapus file ini bila yakin tidak ada.")
    try:
        os.write(fd, str(os.getpid()).encode())
        return _send_all(ctx, nc, ready, live)
    finally:
        os.close(fd)
        lock.unlink(missing_ok=True)


def _send_all(ctx, nc: dict, ready: list[dict], live: bool) -> int:
    sb = supabase_from_ctx(ctx)
    recipients = load_recipients(ctx, sb)
    api_key = ctx.secret(nc["api_key_env"])

    sent_path = ctx.state_dir / "sent.jsonl"
    sent: set[tuple] = set()
    for r in read_jsonl(sent_path):
        if r.get("status") == "SENT":
            sent.add((r["digest_date"], r["kabupaten"], r["user_id"]))
            if r.get("phone_key"):
                sent.add((r["digest_date"], r["kabupaten"], r["phone_key"]))
    log_rows, n_sent = [], 0
    for d in ready:
        targets = [r for r in recipients if _norm_kab(r.get("kabupaten")) == _norm_kab(d["kabupaten"])]
        already_db = set()
        if sb is not None and d.get("db_id"):
            already_db = {x["user_id"] for x in sb.select("news_deliveries", {"select": "user_id",
                          "digest_id": f"eq.{d['db_id']}", "status": "eq.SENT"})}
        log.info("Digest %s: %d penerima petani (%s)", d["kabupaten"], len(targets), "KIRIM" if live else "DRY-RUN")
        phones_done: set[str] = set()                      # satu nomor = satu pesan per digest, walau akun ganda
        for r in targets:
            key = (d["digest_date"], d["kabupaten"], r["user_id"])
            phone = normalize_phone(r["phone"])
            pkey = (d["digest_date"], d["kabupaten"], "phone:" + (phone or ""))
            rec = {"digest_date": d["digest_date"], "kabupaten": d["kabupaten"], "user_id": r["user_id"],
                   "phone_masked": (phone or "")[:5] + "****" + (phone or "")[-3:], "status": "", "error": ""}
            if key in sent or pkey in sent or r["user_id"] in already_db or (phone and phone in phones_done):
                rec["status"] = "ALREADY_SENT"
            elif not phone:
                rec["status"], rec["error"] = "FAILED", "nomor tidak valid"
            elif not live:
                rec["status"] = "DRY_RUN"
            else:
                try:
                    rec["wa_message_id"] = send_waha(nc, api_key, phone, d["content"])
                    rec["status"] = "SENT"
                    n_sent += 1
                    sent |= {key, pkey}
                    with open(sent_path, "a", encoding="utf-8") as f:
                        f.write(json.dumps({**rec, "phone_key": pkey[2]}) + "\n")
                    time.sleep(random.uniform(*map(float, nc["delay_sec"])))   # jeda acak: kurangi risiko diblokir
                except Exception as e:  # noqa: BLE001
                    rec["status"], rec["error"] = "FAILED", str(e)[:300]
            if phone and rec["status"] in ("SENT", "DRY_RUN"):
                phones_done.add(phone)
            log_rows.append(rec)
            if sb is not None and d.get("db_id") and rec["status"] in ("SENT", "FAILED"):
                sb.upsert("news_deliveries", [{"digest_id": d["db_id"], "user_id": r["user_id"],
                                               "status": rec["status"]}], on_conflict="digest_id,user_id")
    write_jsonl(ctx.path("08_delivery.jsonl"), log_rows)
    from collections import Counter
    log.info("08_delivery.jsonl: %s", dict(Counter(r["status"] for r in log_rows)))
    return n_sent
