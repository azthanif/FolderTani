"""Langkah 1: ambil daftar URL berita dari Media Cloud -> 01_urls.csv.

Bisa juga memakai CSV ekspor Media Cloud yang sudah ada (--input-csv), untuk uji/backfill.
"""
from __future__ import annotations

import csv
import logging
from datetime import timedelta

import pandas as pd

log = logging.getLogger("news.geturl")
COLUMNS = ["id", "url", "title", "media_name", "publish_date", "indexed_date", "query_label"]


def _write(ctx, rows: list[dict]) -> int:
    df = pd.DataFrame(rows, columns=COLUMNS)
    df = df[df.url.fillna("").str.startswith("http")]
    # artikel yang sama bisa muncul di beberapa query: gabungkan labelnya
    df = (df.groupby("url", as_index=False)
            .agg({**{c: "first" for c in COLUMNS if c not in ("url", "query_label")},
                  "query_label": lambda s: "|".join(sorted(set("|".join(s.fillna("")).split("|")) - {""}))}))
    df = df[COLUMNS].drop_duplicates("id")
    df.to_csv(ctx.path("01_urls.csv"), index=False, quoting=csv.QUOTE_MINIMAL)
    log.info("01_urls.csv: %d URL unik", len(df))
    return len(df)


def from_mediacloud(ctx) -> int:
    import mediacloud.api  # impor di sini: modul lain tetap bisa dipakai tanpa paket ini

    mc = ctx.cfg["mediacloud"]
    key = ctx.secret(mc["api_key_env"])
    if not key:
        raise RuntimeError(f"Env {mc['api_key_env']} kosong: isi API key Media Cloud atau pakai --input-csv")
    if not mc["queries"]:
        raise RuntimeError("mediacloud.queries kosong di config")
    api = mediacloud.api.SearchApi(key)
    end = ctx.run_date
    start = end - timedelta(days=int(ctx.cfg["run"]["lookback_days"]))
    rows: list[dict] = []
    for label, query in mc["queries"].items():
        token, n = None, 0
        while True:
            stories, token = api.story_list(query, start, end, collection_ids=mc["collection_ids"],
                                            pagination_token=token)
            for s in stories:
                rows.append({"id": s.get("id"), "url": s.get("url"), "title": s.get("title"),
                             "media_name": s.get("media_name"), "publish_date": s.get("publish_date"),
                             "indexed_date": s.get("indexed_date"), "query_label": label})
            n += len(stories)
            if not token or n >= mc["max_per_query"]:
                break
        log.info("Query %-10s %s s/d %s: %d cerita", label, start, end, n)
    return _write(ctx, rows)


def from_csv(ctx, paths: list[str], label: str = "") -> int:
    rows: list[dict] = []
    for p in paths:
        d = pd.read_csv(p, dtype=str).fillna("")
        missing = {"id", "url", "title"} - set(d.columns)
        if missing:
            raise ValueError(f"{p}: kolom wajib tidak ada {missing}")
        for r in d.to_dict("records"):
            rows.append({c: r.get(c, "") for c in COLUMNS} | {"query_label": label or r.get("query_label", "")})
    return _write(ctx, rows)


def run(ctx) -> int:
    out = ctx.path("01_urls.csv")
    if out.exists() and not ctx.force:
        log.info("01_urls.csv sudah ada, dilewati (pakai --force untuk ulang)")
        return len(pd.read_csv(out))
    if ctx.extras.get("input_csv"):
        return from_csv(ctx, ctx.extras["input_csv"], ctx.extras.get("label", ""))
    if ctx.extras.get("input_extracted"):  # CSV hasil ekstraksi juga memuat id/url/title
        log.info("Daftar URL diambil dari --input-extracted (tanpa Media Cloud)")
        return from_csv(ctx, ctx.extras["input_extracted"], ctx.extras.get("label", ""))
    return from_mediacloud(ctx)
