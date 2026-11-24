"""Isi awal tabel price_observations dan gee_features_daily dari data pelatihan (sekali jalan, idempoten).

  python -m forecast_pipeline.seed --prices seed_harga_asli.csv --gee seed_gee.csv

--prices : CSV kolom kabupaten, date, harga[, source_detail]  (observasi asli yang sudah dibersihkan)
--gee    : CSV kolom kabupaten, date + kolom GEE (CSV keluaran notebook ekstraksi GEE boleh langsung dipakai)
Env: DATABASE_URL.
"""
from __future__ import annotations

import argparse
import logging

import pandas as pd

from . import store
from .config import GEE_RAW_COLUMNS, REGIONS

log = logging.getLogger("forecast.seed")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prices", nargs="*", default=[])
    ap.add_argument("--gee", nargs="*", default=[])
    ap.add_argument("--since", default="2022-01-01", help="abaikan baris sebelum tanggal ini")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    since = pd.Timestamp(a.since)
    with store.connect() as conn:
        for path in a.prices:
            df = pd.read_csv(path, parse_dates=["date"])
            df = df[df["date"] >= since]
            for kab, g in df.groupby("kabupaten"):
                if kab not in REGIONS:
                    continue
                detail = g["source_detail"].iloc[0] if "source_detail" in g else path
                n = store.upsert_prices(conn, kab, g[["date", "harga"]], "asli", str(detail))
                log.info("harga %s: %d baris (%s..%s)", kab, n, g.date.min().date(), g.date.max().date())
        for path in a.gee:
            df = pd.read_csv(path, parse_dates=["date"])
            df = df[df["date"] >= since]
            for kab, g in df.groupby("kabupaten"):
                if kab not in REGIONS:
                    continue
                n = store.upsert_gee(conn, kab, g.set_index("date").reindex(columns=GEE_RAW_COLUMNS), "csv_pelatihan")
                log.info("GEE %s: %d baris (%s..%s)", kab, n, g.date.min().date(), g.date.max().date())
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
