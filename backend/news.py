"""Pemuatan data berita untuk /api/berita.

Sumber (dipilih di main.py):
  * CSV  : berita.csv lama atau berita_pipeline.csv hasil news_pipeline (kolom tambahan: ringkasan, wilayah, url,
           summary_model; ner_results boleh memuat start/end/field untuk sorotan berbasis offset).
  * Supabase (opsional): tabel news_articles, dibaca server-side dengan service key lewat REST (tanpa dependensi baru).
"""
from __future__ import annotations

import csv
import json
import logging
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

log = logging.getLogger("temutani.news")


def _entities(raw) -> list:
    try:
        ents = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    return ents if isinstance(ents, list) else []


def _wilayah(row: dict) -> list[str]:
    w = (row.get("wilayah") or "").strip()
    if w:
        return [x.strip() for x in w.split("|") if x.strip()]
    k = (row.get("kabupaten") or "").strip()
    return [x.strip() for x in k.split(",") if x.strip()]


def _item(row: dict, i: int) -> dict:
    return {
        "id": row.get("id") or str(i + 1),
        "tanggal": (row.get("tanggal") or "")[:10],
        "kabupaten": row.get("kabupaten", ""),
        "wilayah": _wilayah(row),
        "sumber": row.get("sumber", ""),
        "kategori": row.get("kategori", ""),
        "judul": row.get("judul", ""),
        "isi": row.get("isi", ""),
        "ringkasan": row.get("ringkasan", ""),
        "url": row.get("url", ""),
        "summary_model": row.get("summary_model", ""),
        "status_data": row.get("status_data", ""),
        "ner_results": _entities(row.get("ner_results") or "[]"),
    }


@lru_cache(maxsize=4)
def _load(path: str, mtime: float) -> tuple[dict, ...]:
    items = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            # judul/isi TIDAK di-strip: offset entitas (start/end) mengacu ke teks apa adanya
            row = {(k or "").strip(): (v or "") if (k or "").strip() in ("judul", "isi") else (v or "").strip()
                   for k, v in row.items()}
            item = _item(row, i)
            if item["tanggal"] and item["judul"]:
                items.append(item)
    return tuple(items)


def load_news(path: Path) -> list[dict]:
    """Cache ikut berganti otomatis bila file CSV diperbarui."""
    return list(_load(str(path), path.stat().st_mtime))


def load_news_supabase(url: str, key: str, dari: str | None, sampai: str | None, wilayah: list[str] | None = None,
                       limit: int = 1000) -> list[dict]:
    params = [("select", "id,url,media_name,title,publish_date,wilayah,kategori,article_clean,entities,summary,"
                         "summary_model"), ("order", "publish_date.desc"), ("limit", str(limit))]
    if dari:
        params.append(("publish_date", f"gte.{dari}"))
    if sampai:
        params.append(("publish_date", f"lte.{sampai}"))
    if wilayah:                                            # filter di DB sebelum limit (operator overlap PostgREST)
        params.append(("wilayah", "ov.{" + ",".join(w.replace(",", "").replace("}", "") for w in wilayah) + "}"))
    req = urllib.request.Request(f"{url.rstrip('/')}/rest/v1/news_articles?{urllib.parse.urlencode(params)}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:      # noqa: S310 - URL dari env server, bukan input pengguna
        rows = json.loads(r.read().decode())
    out = []
    for i, r in enumerate(rows):
        w = r.get("wilayah") or []
        out.append(_item({
            "id": str(r.get("id")), "tanggal": r.get("publish_date") or "", "kabupaten": ", ".join(w),
            "wilayah": "|".join(w), "sumber": r.get("media_name") or "", "kategori": r.get("kategori") or "",
            "judul": r.get("title") or "", "isi": r.get("article_clean") or "", "ringkasan": r.get("summary") or "",
            "url": r.get("url") or "", "summary_model": r.get("summary_model") or "", "status_data": "Otomatis",
            "ner_results": r.get("entities") or [],
        }, i))
    return [x for x in out if x["tanggal"] and x["judul"]]
