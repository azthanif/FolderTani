"""Langkah 7: gabungkan hasil per artikel (07_items.jsonl) & susun digest WhatsApp per kabupaten (07_digest.json).

Digest = template deterministik (judul, sumber, ringkasan, tautan). LLM lokal (Ollama) opsional hanya untuk
paragraf "Sorotan hari ini"; paragraf ditolak bila memuat angka yang tidak ada di ringkasan sumber.
Isi digest kabupaten X = berita wilayah X + berita Nasional.
"""
from __future__ import annotations

import json
import logging
import re

import requests

from .ner_rules import DOMAIN_ORG_NORMS
from .storage import read_jsonl, write_jsonl

log = logging.getLogger("news.digest")
HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober",
         "November", "Desember"]
RX_NUM = re.compile(r"\d+(?:[.,]\d+)*")
RX_WORD = re.compile(r"[a-z0-9]{4,}")


def _words(t: str) -> set[str]:
    return set(RX_WORD.findall(t.casefold()))


def _jac(a: set, b: set) -> float:
    return len(a & b) / max(1, len(a | b))


def is_same_story(a: dict, b: dict) -> bool:
    """Berita sama dari media berbeda. Diukur di data uji: kemiripan kata saja tidak cukup membedakan
    (duplikat 0,19 vs bukan-duplikat p99 0,24), jadi dipakai tokoh (PER) yang sama + judul mirip + tanggal dekat."""
    from datetime import date
    try:
        if abs((date.fromisoformat(a["publish_date"]) - date.fromisoformat(b["publish_date"])).days) > 1:
            return False
    except (ValueError, KeyError, TypeError):
        pass
    per = lambda it: {e["norm"].casefold() for e in it.get("entities", []) if e["label"] == "PER" and " " in e["norm"]}
    org = lambda it: {e["norm"].casefold() for e in it.get("entities", []) if e["label"] in ("ORG", "NOR", "EVT")
                      and e["norm"].casefold() not in DOMAIN_ORG_NORMS}
    nums = lambda it: {n for n in RX_NUM.findall(f"{it['title']} {it['summary']}")
                       if len(n.replace(".", "").replace(",", "")) >= 2 and not re.fullmatch(r"(19|20)\d\d", n)}
    title_j = _jac(_words(a["title"]), _words(b["title"]))
    text_j = _jac(_words(a["title"] + " " + a["summary"]), _words(b["title"] + " " + b["summary"]))
    return ((bool(per(a) & per(b)) and title_j >= 0.2)          # tokoh sama + judul mirip
            or (bool(org(a) & org(b)) and bool(nums(a) & nums(b)))  # lembaga sama + angka spesifik sama
            or text_j >= 0.45)


def dedupe(items: list[dict], also_exclude: list[dict] = ()) -> list[dict]:
    """Simpan satu berita per peristiwa (yang paling relevan), urutan asli dipertahankan."""
    kept: list[dict] = []
    for it in sorted(items, key=lambda x: x["relevance"], reverse=True):
        if not any(is_same_story(it, k) for k in list(kept) + list(also_exclude)):
            kept.append(it)
    order = {id(it): i for i, it in enumerate(items)}
    return sorted(kept, key=lambda x: order[id(x)])


def tanggal_id(d) -> str:
    return f"{HARI[d.weekday()]}, {d.day} {BULAN[d.month - 1]} {d.year}"


def build_items(ctx) -> list[dict]:
    arts = {a["id"]: a for a in read_jsonl(ctx.path("03_clean.jsonl"))}
    ner = {r["id"]: r for r in read_jsonl(ctx.path("04_ner.jsonl"))}
    cls = {r["id"]: r for r in read_jsonl(ctx.path("05_classified.jsonl"))}
    summ = {r["id"]: r for r in read_jsonl(ctx.path("06_summary.jsonl"))}
    items = []
    for i, a in arts.items():
        c = cls.get(i, {})
        if not c.get("wilayah"):
            continue
        s = summ.get(i, {})
        items.append({
            "id": i, "url": a["url"], "title": a["title"], "media_name": a.get("media_name", ""),
            "publish_date": (a.get("publish_date") or "")[:10], "article_clean": a["article_clean"],
            "content_hash": a.get("content_hash"), "wilayah": c["wilayah"], "kategori": c["kategori"],
            "relevance": c["relevance"], "summary": s.get("summary", ""), "summary_model": s.get("summary_model", ""),
            "entities": ner.get(i, {}).get("entities", []), "title_entities": ner.get(i, {}).get("title_entities", []),
        })
    items.sort(key=lambda x: (x["publish_date"], x["relevance"]), reverse=True)
    write_jsonl(ctx.path("07_items.jsonl"), items)
    return items


def _llm_sorotan(items: list[dict], kab: str, lc: dict) -> str | None:
    if not lc.get("enabled") or not items:
        return None
    bahan = "\n".join(f"- {it['title']}: {it['summary']}" for it in items)
    prompt = (f"Berikut ringkasan berita pertanian untuk petani di Kabupaten {kab}.\n{bahan}\n\n"
              "Tulis 2-3 kalimat 'Sorotan hari ini' dalam bahasa Indonesia sederhana untuk petani. "
              "Hanya gunakan fakta dari ringkasan di atas. Jangan menambah angka, nama, atau saran yang tidak ada. "
              "Tanpa salam, tanpa emoji, tanpa tautan.")
    try:
        r = requests.post(lc["ollama_url"].rstrip("/") + "/api/chat", timeout=int(lc["timeout_sec"]),
                          json={"model": lc["model"], "stream": False, "options": {"temperature": 0.2},
                                "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        text = r.json()["message"]["content"].strip()
    except Exception as e:  # noqa: BLE001
        log.warning("LLM tidak tersedia (%s): digest tanpa sorotan", e)
        return None
    src_nums = set(RX_NUM.findall(bahan))
    bad = [n for n in RX_NUM.findall(text) if n not in src_nums]
    if bad or "http" in text or len(text) > 700:
        log.warning("Sorotan LLM ditolak (angka asing %s / terlalu panjang)", bad[:5])
        return None
    return text


def _compose(kab: str, run_date, local: list[dict], national: list[dict], dc: dict, sorotan: str | None) -> str:
    lines = ["*Kabar Tani Terkini*", tanggal_id(run_date), ""]
    if sorotan:
        lines += ["*Sorotan hari ini*", sorotan, ""]
    for title, rows in ((f"Berita {kab}", local), ("Berita Nasional", national)):
        if rows:
            lines.append(f"*{title}*")
            for i, it in enumerate(rows, 1):
                lines += [f"{i}. *{it['title']}* ({it['media_name']})", it["summary"], it["url"], ""]
    website_url = dc.get("website_url", "https://temutani.web.id/berita")
    lines += [f"📰 Baca selengkapnya: {website_url}", "", f"_{dc['footer']}_"]
    return "\n".join(lines)


def render(kab: str, run_date, local: list[dict], national: list[dict], dc: dict, sorotan: str | None,
           used: dict | None = None) -> str:
    """Pangkas item paling bawah sampai teks muat batas max_chars. `used` diisi item yang benar-benar tampil."""
    local, national = list(local), list(national)
    while True:
        text = _compose(kab, run_date, local, national, dc, sorotan)
        if len(text) <= int(dc["max_chars"]) or not (local or national):
            if used is not None:
                used.update(local=local, national=national)
            return text
        (national if national and len(national) >= len(local) else local).pop()


def run(ctx) -> int:
    out = ctx.path("07_digest.json")
    if out.exists() and not ctx.force:
        log.info("07_digest.json sudah ada, dilewati")
        return len(json.loads(out.read_text(encoding="utf-8")))
    dc = ctx.cfg["digest"]
    items = build_items(ctx)
    digests = []
    for kab in dc["kabupaten"]:
        max_total = int(dc.get("max_total", int(dc["max_local"]) + int(dc["max_national"])))
        local = dedupe([it for it in items if kab in it["wilayah"]])[: int(dc["max_local"])]
        local_ids = {it["id"] for it in local}
        national = dedupe([it for it in items if "Nasional" in it["wilayah"] and it["id"] not in local_ids],
                          also_exclude=local)[: max(0, max_total - len(local))]
        if not local and not national and dc["skip_if_empty"]:
            digests.append({"kabupaten": kab, "digest_date": ctx.run_date.isoformat(), "status": "SKIPPED",
                            "content": "", "article_ids": []})
            log.info("Digest %s: tidak ada berita, dilewati", kab)
            continue
        used: dict = {}
        content = render(kab, ctx.run_date, local, national, dc, None, used)
        sorotan = _llm_sorotan(used["local"] + used["national"], kab, dc["llm"])   # hanya dari berita yang tampil
        if sorotan:
            content = render(kab, ctx.run_date, used["local"], used["national"], dc, sorotan, used)
        shown = used["local"] + used["national"]
        digests.append({"kabupaten": kab, "digest_date": ctx.run_date.isoformat(), "status": "READY",
                        "content": content, "article_ids": [it["id"] for it in shown],
                        "model": dc["llm"]["model"] if sorotan else "template"})
        (ctx.run_dir / f"07_digest_{kab}.txt").write_text(content, encoding="utf-8")
        log.info("Digest %s: %d lokal + %d nasional tampil, %d karakter",
                 kab, len(used["local"]), len(used["national"]), len(content))
    out.write_text(json.dumps(digests, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(digests)
