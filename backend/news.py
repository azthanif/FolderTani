"""Pemuatan data berita (dulu: fetch('./berita.csv') di browser)."""
from __future__ import annotations

import csv
import json
import logging
from functools import lru_cache
from pathlib import Path

log = logging.getLogger("temutani.news")


@lru_cache(maxsize=4)
def _load(path: str, mtime: float) -> tuple[dict, ...]:
    items = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
            try:
                entities = json.loads(row.get("ner_results") or "[]")
                if not isinstance(entities, list):
                    entities = []
            except json.JSONDecodeError:
                log.warning("ner_results tidak valid pada baris %s", i + 2)
                entities = []
            item = {
                "id": row.get("id") or str(i + 1),
                "tanggal": (row.get("tanggal") or "")[:10],
                "kabupaten": row.get("kabupaten", ""),
                "sumber": row.get("sumber", ""),
                "kategori": row.get("kategori", ""),
                "judul": row.get("judul", ""),
                "isi": row.get("isi", ""),
                "status_data": row.get("status_data", ""),
                "ner_results": entities,
            }
            if item["tanggal"] and item["judul"]:
                items.append(item)
    return tuple(items)


def load_news(path: Path) -> list[dict]:
    """Cache ikut berganti otomatis bila file CSV diperbarui."""
    return list(_load(str(path), path.stat().st_mtime))
