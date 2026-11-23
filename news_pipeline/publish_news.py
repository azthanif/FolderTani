"""Publikasi hasil: (a) CSV untuk web Temu Tani (backend/news.py), (b) Supabase (news_articles, news_digests).

Format CSV web kompatibel dengan berita.csv lama, ditambah kolom ringkasan, wilayah, url, summary_model.
ner_results: [{word, entity, score, start, end, field}] dengan offset 0-based ke judul/isi.
"""
from __future__ import annotations

import csv
import json
import logging
from datetime import timedelta

import pandas as pd

from .storage import read_jsonl, supabase_from_ctx

log = logging.getLogger("news.publish")
WEB_COLS = ["id", "tanggal", "kabupaten", "sumber", "kategori", "judul", "isi", "status_data", "ner_results",
            "ringkasan", "wilayah", "url", "summary_model"]


def _web_entities(it: dict) -> list[dict]:
    out = [{"word": e["text"], "entity": e["label"], "score": e["score"], "start": e["start"], "end": e["end"],
            "field": "judul"} for e in it.get("title_entities", [])]
    out += [{"word": e["text"], "entity": e["label"], "score": e["score"], "start": e["start"], "end": e["end"],
             "field": "isi"} for e in it.get("entities", [])]
    return out


def export_web_csv(ctx, items: list[dict], run_ids: set[str] | None = None) -> int:
    """run_ids: semua artikel yang diproses run ini. Baris lama untuk id tsb diganti (artikel yang kini dinilai
    tidak relevan ikut hilang dari web, bukan tertinggal)."""
    path = ctx.resolve(ctx.cfg["export"]["web_csv"])
    path.parent.mkdir(parents=True, exist_ok=True)
    new = pd.DataFrame([{
        "id": it["id"], "tanggal": it["publish_date"] or ctx.run_date.isoformat(),
        "kabupaten": ", ".join(it["wilayah"]), "sumber": it["media_name"], "kategori": it["kategori"],
        "judul": it["title"], "isi": it["article_clean"], "status_data": "Otomatis",
        "ner_results": json.dumps(_web_entities(it), ensure_ascii=False), "ringkasan": it["summary"],
        "wilayah": "|".join(it["wilayah"]), "url": it["url"], "summary_model": it["summary_model"],
    } for it in items], columns=WEB_COLS)
    old = pd.read_csv(path, dtype=str).fillna("") if path.exists() else pd.DataFrame(columns=WEB_COLS)
    old = old[[c for c in WEB_COLS if c in old.columns]]
    if run_ids:
        old = old[~old.id.isin(run_ids)]
    # Batas keep_days hanya memangkas baris LAMA; artikel run ini selalu masuk (termasuk backfill data historis).
    cutoff = (ctx.run_date - timedelta(days=int(ctx.cfg["export"]["keep_days"]))).isoformat()
    old = old[old.tanggal.astype(str) >= cutoff]
    df = pd.concat([new, old], ignore_index=True).drop_duplicates("id", keep="first")
    df = df.sort_values("tanggal", ascending=False)
    tmp = path.with_suffix(".tmp")
    df.to_csv(tmp, index=False, quoting=csv.QUOTE_MINIMAL)
    tmp.replace(path)
    log.info("CSV web %s: %d berita (baru %d)", path, len(df), len(new))
    return len(new)


def sync_supabase(ctx, items: list[dict]) -> None:
    sb = supabase_from_ctx(ctx)
    if sb is None:
        log.info("Supabase nonaktif: lewati sinkronisasi")
        return
    rows = [{"url": it["url"], "media_name": it["media_name"], "title": it["title"],
             "publish_date": it["publish_date"] or ctx.run_date.isoformat(), "wilayah": it["wilayah"],
             "kategori": it["kategori"],
             "article_clean": it["article_clean"], "entities": _web_entities(it), "summary": it["summary"],
             "summary_model": it["summary_model"]} for it in items]
    if rows:
        sb.upsert("news_articles", rows, on_conflict="url")
    dpath = ctx.path("07_digest.json")
    digests = json.loads(dpath.read_text(encoding="utf-8"))
    ready = [d for d in digests if d["status"] == "READY"]
    if ready:
        saved = sb.upsert("news_digests", [{"kabupaten": d["kabupaten"], "digest_date": d["digest_date"],
                                            "content": d["content"]} for d in ready], on_conflict="kabupaten,digest_date")
        ids = {(s["kabupaten"], s["digest_date"]): s["id"] for s in saved}
        for d in digests:
            d["db_id"] = ids.get((d["kabupaten"], d["digest_date"]))
        dpath.write_text(json.dumps(digests, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("Supabase: %d artikel, %d digest disinkronkan", len(rows), len(ready))


def run(ctx) -> int:
    items = read_jsonl(ctx.path("07_items.jsonl"))
    run_ids = {a["id"] for a in read_jsonl(ctx.path("03_clean.jsonl"))}
    n = export_web_csv(ctx, items, run_ids) if ctx.cfg["export"].get("web_csv") else 0
    sync_supabase(ctx, items)
    return n