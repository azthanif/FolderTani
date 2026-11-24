"""Orkestrator harian. Contoh:

  python -m news_pipeline.run_daily --config news_pipeline/config.yaml                 # semua langkah, hari ini
  python -m news_pipeline.run_daily --config ... --date 2026-11-22 --from-step ner --force   # ulang dari NER
  python -m news_pipeline.run_daily --config ... --input-csv MC_garut.csv --label Garut  # tanpa API Media Cloud
  python -m news_pipeline.run_daily --config ... --dry-run                               # jangan kirim WA

Setiap langkah membaca output langkah sebelumnya di data/runs/<tanggal>/ dan dilewati bila outputnya sudah ada
(kecuali --force). Jadi bila satu langkah gagal, cukup jalankan ulang: langkah yang sudah selesai tidak diulang.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import traceback
from datetime import date
from pathlib import Path

if __package__ in (None, ""):  # dijalankan sebagai `python run_daily.py` dari dalam folder news_pipeline
    from pathlib import Path as _P
    sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
    __package__ = "news_pipeline"
    import news_pipeline  # noqa: F401

from . import (broadcast_morning, classifier_news, digest_news, geturl_news, gettext_news, ner_news,
               notify_news, preprocess_news, publish_news, summary_news)
from .config import Context, load_config, today_wib

log = logging.getLogger("news.run")
STEPS = [
    ("geturl", geturl_news.run), ("gettext", gettext_news.run), ("preprocess", preprocess_news.run),
    ("ner", ner_news.run), ("classifier", classifier_news.run), ("summary", summary_news.run),
    ("digest", digest_news.run), ("publish", publish_news.run), ("notify", notify_news.run),
    ("broadcast", broadcast_morning.run),
]
NAMES = [s for s, _ in STEPS]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pipeline berita harian Temu Tani")
    ap.add_argument("--config", default=None, help="path config.yaml (default: news_pipeline/config.yaml bila ada)")
    ap.add_argument("--date", default=None, help="tanggal run YYYY-MM-DD (default: hari ini WIB)")
    ap.add_argument("--from-step", choices=NAMES, default=NAMES[0])
    ap.add_argument("--to-step", choices=NAMES, default=NAMES[-1])
    ap.add_argument("--force", action="store_true", help="ulang langkah walau outputnya sudah ada")
    ap.add_argument("--dry-run", action="store_true", help="jangan kirim WhatsApp")
    ap.add_argument("--allow-backdated-send", action="store_true", help="izinkan kirim WA untuk tanggal selain hari ini")
    ap.add_argument("--input-csv", nargs="+", help="CSV ekspor Media Cloud (ganti langkah geturl)")
    ap.add_argument("--label", default="", help="label query untuk --input-csv, mis. Garut")
    ap.add_argument("--input-extracted", nargs="+", help="CSV berisi full_text* (ganti unduhan langkah gettext)")
    a = ap.parse_args(argv)

    if a.config is None:
        _default = Path(__file__).resolve().parent / "config.yaml"
        a.config = str(_default) if _default.exists() else None
    cfg = load_config(a.config)
    ctx = Context(cfg=cfg, run_date=date.fromisoformat(a.date) if a.date else today_wib(), force=a.force,
                  dry_run=a.dry_run, extras={"input_csv": a.input_csv, "label": a.label,
                                             "input_extracted": a.input_extracted,
                                             "allow_backdated_send": a.allow_backdated_send})
    lo, hi = NAMES.index(a.from_step), NAMES.index(a.to_step)
    summary_path = ctx.run_dir / "run_summary.json"
    try:                                                   # gabung dengan run sebelumnya di tanggal yang sama
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        summary = {"run_date": ctx.run_date.isoformat(), "steps": []}
    code = 0
    for name, fn in STEPS[lo:hi + 1]:
        t0 = time.time()
        log.info("=== %s ===", name)
        try:
            n = fn(ctx)
            summary["steps"].append({"step": name, "status": "SUCCESS", "n": n, "sec": round(time.time() - t0, 1),
                                     "at": time.strftime("%Y-%m-%dT%H:%M:%S")})
        except Exception as e:  # noqa: BLE001
            log.error("Langkah %s gagal: %s\n%s", name, e, traceback.format_exc())
            summary["steps"].append({"step": name, "status": "FAILED", "error": str(e)[:500],
                                     "sec": round(time.time() - t0, 1)})
            code = 1
            break                                            # langkah berikutnya butuh output langkah ini
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Selesai: %s", [(s["step"], s["status"], s.get("n")) for s in summary["steps"][-(hi - lo + 1):]])
    return code


if __name__ == "__main__":
    sys.exit(main())
