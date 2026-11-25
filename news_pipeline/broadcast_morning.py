"""Siaran pagi harian 07:00 WIB: sapaan + prakiraan harga (hari ini & besok) + digest berita.

Dijalankan terpisah dari pipeline berita sehingga bisa dijadwalkan setelah
prakiraan harga selesai (05:00 WIB, cron 22 UTC) dan dikirim tepat 07:00 WIB (cron 00 UTC).

Urutan pesan:
  1. Sapaan + tanggal
  2. Prakiraan harga GKP hari ini dan besok (dari price_forecasts, horizon 1 & 2)
  3. Digest berita (dari news_digests; lokal utama, nasional bila lokal kosong)

Butuh:
  - storage.supabase.enabled: true
  - notify.enabled: true  (false = dry-run)
  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WAHA_API_KEY di env
"""
from __future__ import annotations

import logging
import os
import re
from datetime import date, timedelta

import requests

log = logging.getLogger("news.broadcast")

HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
         "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def _tanggal(d: date) -> str:
    return f"{HARI[d.weekday()]}, {d.day} {BULAN[d.month - 1]} {d.year}"


def _fmt_price(p: int) -> str:
    return f"Rp{p:,.0f}".replace(",", ".")


def _normalize_phone(raw: str) -> str | None:
    """Nomor HP Indonesia -> format WhatsApp 628xxxxxxxxx; selain itu None."""
    d = re.sub(r"\D", "", str(raw or ""))
    if d.startswith("620"):
        d = "62" + d[3:]
    elif d.startswith("0"):
        d = "62" + d[1:]
    elif d.startswith("8"):
        d = "62" + d
    return d if re.fullmatch(r"628\d{8,12}", d) else None


def _strip_digest_header(content: str) -> str:
    """Hapus baris header digest (Kabar Tani + tanggal) agar tidak dobel dengan header siaran."""
    lines = content.split("\n")
    # Lewati baris pertama (*Kabar Tani …*), tanggal, dan baris kosong setelahnya
    skip = 0
    for line in lines:
        if line.startswith("*Kabar Tani") or not line.strip() and skip < 3:
            skip += 1
        elif skip > 0 and line and not line[0].isdigit() and not line.startswith("*Berita") \
                and not line.startswith("*Sorotan") and skip < 4:
            skip += 1  # baris tanggal (mis. "Selasa, 24 November 2026")
        else:
            break
    return "\n".join(lines[skip:]).lstrip("\n")


def build_message(nama: str, kab: str, today: date, digest_content: str,
                  forecasts: list[dict]) -> str:
    lines: list[str] = []

    # 1. Sapaan + tanggal
    lines.append(f"Selamat pagi, {nama}! 🌾")
    lines.append(f"*{_tanggal(today)}*")
    lines.append("")

    # 2. Prakiraan harga (horizon 1 = hari ini, horizon 2 = besok)
    h1 = next((f for f in forecasts if f["horizon"] == 1), None)
    h2 = next((f for f in forecasts if f["horizon"] == 2), None)
    if h1 or h2:
        lines.append("*Prakiraan AI Harga GKP*")
        if h1:
            sim = " _(simulasi)_" if h1.get("is_simulation") else ""
            lines.append(f"Hari ini: *{_fmt_price(h1['price_per_kg'])}/kg*{sim}")
        if h2:
            sim = " _(simulasi)_" if h2.get("is_simulation") else ""
            lines.append(f"Besok: *{_fmt_price(h2['price_per_kg'])}/kg*{sim}")
        lines.append("")

    # 3. Digest berita (lokal utama; nasional sebagai fallback sudah ada di content)
    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"*Kabar Tani Terkini*")
    lines.append("")
    lines.append(_strip_digest_header(digest_content))

    return "\n".join(lines)


def send_waha(nc: dict, api_key: str, phone: str, text: str) -> str | None:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-Api-Key"] = api_key
    r = requests.post(nc["waha_url"].rstrip("/") + "/api/sendText", headers=headers, timeout=30,
                      json={"session": nc.get("session", "default"), "chatId": f"{phone}@c.us", "text": text})
    if r.status_code >= 400:
        raise RuntimeError(f"WAHA {r.status_code}: {r.text[:200]}")
    try:
        body = r.json()
        return str(body.get("id") or body.get("key", {}).get("id") or "") or None
    except ValueError:
        return None


def run(ctx) -> int:
    nc = ctx.cfg["notify"]
    sc = ctx.cfg["storage"]["supabase"]
    if not sc.get("enabled"):
        raise RuntimeError("broadcast_morning butuh storage.supabase.enabled: true")

    from .storage import Supabase
    sb = Supabase(ctx.secret(sc["url_env"]), ctx.secret(sc["key_env"]))

    today = ctx.run_date
    live = bool(nc.get("enabled")) and not ctx.dry_run
    api_key = ctx.secret(nc.get("api_key_env", "WAHA_API_KEY"))

    # Digest hari ini per kabupaten
    digests = sb.select("news_digests", {"select": "id,kabupaten,content",
                                         "digest_date": f"eq.{today}"})
    if not digests:
        log.info("Tidak ada digest untuk %s — siaran tidak dikirim", today)
        return 0
    digest_map = {d["kabupaten"]: d for d in digests}

    # Prakiraan harga: hanya horizon 1 (hari ini) dan 2 (besok)
    forecasts_raw = sb.select("price_forecasts",
                              {"select": "kabupaten,horizon,price_per_kg,is_simulation",
                               "run_date": f"eq.{today}",
                               "horizon": "in.(1,2)",
                               "order": "kabupaten,horizon.asc"})
    forecasts_map: dict[str, list] = {}
    for f in forecasts_raw:
        forecasts_map.setdefault(f["kabupaten"], []).append(f)

    # Penerima
    recipients = sb.select("v_news_recipients",
                            {"select": "user_id,phone,name,kabupaten"})
    if not recipients:
        log.info("Tidak ada penerima terdaftar")
        return 0

    # Siapa yang sudah terkirim hari ini
    digest_ids = ",".join(str(d["id"]) for d in digests)
    sent_rows = sb.select("news_deliveries",
                          {"select": "digest_id,user_id",
                           "digest_id": f"in.({digest_ids})",
                           "status": "eq.SENT"})
    already_sent: set[tuple] = {(r["digest_id"], r["user_id"]) for r in sent_rows}

    sent_count = 0
    phones_done: set[str] = set()

    for r in recipients:
        kab = r["kabupaten"]
        digest = digest_map.get(kab)
        if not digest:
            log.debug("Tidak ada digest untuk kabupaten %s", kab)
            continue

        key = (digest["id"], r["user_id"])
        if key in already_sent:
            log.debug("Sudah terkirim ke %s (%s)", r["name"], kab)
            continue

        phone = _normalize_phone(r.get("phone", ""))
        if not phone:
            log.warning("Nomor tidak valid, dilewati: %s (%s)", r["name"], r.get("phone", ""))
            continue
        pkey = "phone:" + phone
        if pkey in phones_done:
            log.debug("Nomor %s sudah dikirimi (akun ganda)", phone)
            continue

        msg = build_message(r["name"], kab, today, digest["content"], forecasts_map.get(kab, []))

        status = "DRY_RUN"
        if live:
            try:
                send_waha(nc, api_key, phone, msg)
                status = "SENT"
                phones_done.add(pkey)
                sent_count += 1
                log.info("Terkirim → %s (%s) %s", r["name"], kab, phone)
            except Exception as exc:
                status = "ERROR"
                log.error("Gagal kirim ke %s: %s", r["name"], exc)
        else:
            log.info("DRY_RUN → %s (%s) [%d karakter]", r["name"], kab, len(msg))

        try:
            sb.insert_ignore("news_deliveries",
                             [{"digest_id": digest["id"], "user_id": r["user_id"], "status": status}],
                             on_conflict="digest_id,user_id")
        except Exception as exc:
            log.warning("Gagal catat delivery: %s", exc)

    if live:
        log.info("Siaran selesai: %d pesan terkirim", sent_count)
    else:
        log.info("Dry-run selesai: %d penerima (tidak benar-benar terkirim)", len(recipients))
    return sent_count
