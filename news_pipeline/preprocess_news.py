"""Langkah 3: pilih teks terbaik, buang boilerplate, deduplikasi (juga terhadap hari-hari sebelumnya) -> 03_clean.jsonl."""
from __future__ import annotations

import json
import logging

import pandas as pd

from .news_cleaner import clean_corpus
from .storage import read_jsonl, write_jsonl

log = logging.getLogger("news.preprocess")


def _load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
    except json.JSONDecodeError:
        log.warning("%s rusak, mulai dari kosong", path.name)
        return default


def run(ctx) -> int:
    out = ctx.path("03_clean.jsonl")
    if out.exists() and not ctx.force:
        log.info("03_clean.jsonl sudah ada, dilewati")
        return len(read_jsonl(out))

    urls = pd.read_csv(ctx.path("01_urls.csv"), dtype=str).fillna("")
    raw = pd.DataFrame(read_jsonl(ctx.path("02_raw.jsonl")))
    if raw.empty:
        write_jsonl(out, [])
        log.warning("Tidak ada teks mentah")
        return 0
    cols = [c for c in ("full_text_trafilatura", "full_text", "full_text_selenium") if c in raw.columns]
    df = urls.merge(raw[["id", "status", "source"] + cols], on="id", how="left")
    for c in cols:
        df[c] = df[c].fillna("")

    bp_path = ctx.state_dir / "boilerplate.json"
    bp = _load_json(bp_path, {})                       # baris -> jumlah hari terdeteksi
    clean, rep = clean_corpus(df, min_words=int(ctx.cfg["preprocess"]["min_words"]), extra_boilerplate=set(bp))
    for line in rep.pop("_boilerplate_batch"):
        bp[line] = bp.get(line, 0) + 1
    bp_path.write_text(json.dumps(bp, ensure_ascii=False), encoding="utf-8")

    # deduplikasi lintas hari: artikel yang sudah diproses di run sebelumnya tidak dikirim ulang
    seen_path = ctx.state_dir / "seen_hashes.json"
    seen = _load_json(seen_path, {})
    import hashlib
    import re
    clean["content_hash"] = clean.article_clean.map(lambda t: hashlib.md5(re.sub(r"\W+", "", t.lower()).encode()).hexdigest())
    today = ctx.run_date.isoformat()
    is_old = clean.content_hash.map(lambda h: h in seen and seen[h] != today)
    clean.loc[(clean.status == "OK") & is_old, "status"] = "SUDAH_DIPROSES"
    ok = clean[clean.status == "OK"]
    for h in ok.content_hash:
        seen.setdefault(h, today)
    seen_path.write_text(json.dumps(seen), encoding="utf-8")

    keep = ["id", "url", "title", "media_name", "publish_date", "query_label", "source_used", "n_words",
            "article_clean", "content_hash"]
    n = write_jsonl(out, ok[keep].to_dict("records"))
    log.info("03_clean.jsonl: %d artikel | %s | sudah diproses sebelumnya: %d",
             n, {k: v for k, v in rep.items() if k != "sumber_dipakai"}, int(is_old.sum()))
    return n
