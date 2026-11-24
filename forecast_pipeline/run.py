"""Jalankan pipeline prakiraan harga GKP harian.

Contoh:
  python -m forecast_pipeline.run                         # hari ini (WIB), tarik GEE, simpan prakiraan
  python -m forecast_pipeline.run --skip-gee --dry-run    # tanpa GEE, tanpa menulis prakiraan
  python -m forecast_pipeline.run --backfill 30           # isi juga 30 hari asal sebelumnya (grafik web)

Env: DATABASE_URL (wajib), GEE_SERVICE_ACCOUNT_KEY + GEE_PROJECT (kecuali --skip-gee).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime

import pandas as pd

from . import features, simulation, store
from .config import FFILL_LIMIT, GEE_LAG_DAYS, H, HISTORY_DAYS, OPERATIONAL_FFILL_LIMIT, REGIONS, WIB

log = logging.getLogger("forecast")
GEE_WARMUP_DAYS = 200        # riwayat GEE tambahan sebelum frame (jendela 90 hari + lag 90 hari + lag publikasi)
MAX_GEE_CATCHUP_DAYS = 400   # batas tarikan GEE sekali jalan bila tabel tertinggal jauh


def forecast_one(conn, kab: str, run_date: pd.Timestamp) -> list[dict]:
    """Prakiraan h0..h+7 untuk satu kabupaten dan satu tanggal asal. Tidak menulis ke DB."""
    from . import model as model_mod

    m = model_mod.load(kab)
    start = run_date - pd.Timedelta(days=HISTORY_DAYS)
    prices = store.read_prices(conn, kab, start, run_date)
    if prices.empty:
        raise RuntimeError(f"{kab}: tidak ada harga di price_observations sampai {run_date.date()}")
    gee = store.read_gee(conn, kab, start - pd.Timedelta(days=GEE_WARMUP_DAYS), run_date)
    extended = False
    fr = features.build_feature_frame(prices, gee, kab, start=start, end=run_date, ffill_limit=FFILL_LIMIT)
    if not features.window_ok(fr, run_date, m.lookback):
        extended = True
        fr = features.build_feature_frame(prices, gee, kab, start=start, end=run_date, ffill_limit=OPERATIONAL_FFILL_LIMIT)
        if not features.window_ok(fr, run_date, m.lookback):
            raise RuntimeError(f"{kab}: jendela input {m.lookback} hari sampai {run_date.date()} tidak lengkap "
                               f"(harga terakhir lebih dari {OPERATIONAL_FFILL_LIMIT} hari lalu)")
        log.warning("%s %s: isi maju diperpanjang sampai %d hari (observasi jarang)", kab, run_date.date(), OPERATIONAL_FFILL_LIMIT)
    win = fr.loc[run_date - pd.Timedelta(days=m.lookback - 1):run_date]
    is_sim = extended or bool(win["sumber_harga"].eq("simulasi").any())
    y0 = float(fr.loc[run_date, "y"])
    delta = m.predict_delta(features.build_sequence(fr, run_date, m.lookback))
    src = str(fr.loc[run_date, "sumber_harga"])
    gee_filled = bool(fr.loc[run_date, "gee_filled"])
    base = {"kabupaten": kab, "run_date": run_date.date(), "model_version": m.version, "is_simulation": is_sim,
            "price_source": src, "gee_filled": gee_filled,
            "backtest_mape_pct": m.meta.get("backtest", {}).get("MAPE_pct")}
    rows = [{**base, "horizon": 0, "target_date": run_date.date(), "price_per_kg": int(round(y0))}]
    for k in range(H):
        rows.append({**base, "horizon": k + 1, "target_date": (run_date + pd.Timedelta(days=k + 1)).date(),
                     "price_per_kg": int(round(y0 + float(delta[k])))})
    return rows


def refresh_gee(conn, kab: str, end: pd.Timestamp, days: int) -> int:
    from . import gee

    last = store.last_gee_date(conn, kab)
    start = end - pd.Timedelta(days=days)
    if last is not None:
        start = min(start, pd.Timestamp(last) + pd.Timedelta(days=1))
    start = max(start, end - pd.Timedelta(days=MAX_GEE_CATCHUP_DAYS))
    df = gee.fetch(kab, start, end)
    n = store.upsert_gee(conn, kab, df)
    log.info("%s: GEE %s..%s, %d hari tersimpan (hari terakhir dengan CHIRPS: %s)", kab, start.date(), end.date(), n,
             df["chirps_precip_mm"].last_valid_index())
    return n


def fill_simulation(conn, kab: str, end: pd.Timestamp) -> int:
    """Isi hari tanpa observasi asli dengan simulasi deterministik (hanya kabupaten yang punya sim_params)."""
    if not simulation.available(kab):
        return 0
    start = simulation.last_real_date(kab) + pd.Timedelta(days=1)
    if end < start:
        return 0
    sim = simulation.simulate_range(start, end, kab)
    return store.upsert_prices(conn, kab, sim, "simulasi", "sim_params.json")


def step_summary(rows: list[dict]) -> None:
    path = os.getenv("GITHUB_STEP_SUMMARY")
    if not path or not rows:
        return
    df = pd.DataFrame(rows)
    lines = ["## Prakiraan harga GKP", "", "| Kabupaten | Tanggal asal | " + " | ".join(f"h{k}" for k in range(H + 1)) + " | Simulasi | Sumber harga h0 |",
             "|" + "---|" * (H + 4)]
    for (kab, rd), g in df.groupby(["kabupaten", "run_date"]):
        g = g.sort_values("horizon")
        lines.append(f"| {kab} | {rd} | " + " | ".join(f"{v:,}".replace(",", ".") for v in g.price_per_kg)
                     + f" | {'ya' if g.is_simulation.iloc[0] else 'tidak'} | {g.price_source.iloc[0]} |")
    with open(path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Prakiraan harga GKP harian (LSTM) -> price_forecasts")
    ap.add_argument("--date", help="tanggal asal YYYY-MM-DD (default hari ini WIB)")
    ap.add_argument("--regions", default=",".join(REGIONS))
    ap.add_argument("--skip-gee", action="store_true", help="jangan tarik GEE (pakai isi tabel; kekurangan diisi klimatologi)")
    ap.add_argument("--gee-days", type=int, default=45, help="tarik ulang GEE N hari terakhir (data ERA5/komposit menyusul)")
    ap.add_argument("--backfill", type=int, default=0, help="buat juga prakiraan untuk N tanggal asal sebelumnya")
    ap.add_argument("--overwrite", action="store_true", help="timpa prakiraan tanggal asal lampau saat backfill")
    ap.add_argument("--dry-run", action="store_true", help="hitung dan tampilkan, tanpa menulis price_forecasts")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    run_date = pd.Timestamp(a.date) if a.date else pd.Timestamp(datetime.now(WIB).date())
    regions = [r.strip() for r in a.regions.split(",") if r.strip()]
    bad = [r for r in regions if r not in REGIONS]
    if bad:
        ap.error(f"wilayah tidak dikenal: {bad}")
    if not a.skip_gee:
        from . import gee

        gee.initialize()

    failed, written = [], []
    with store.connect() as conn:
        for kab in regions:
            try:
                if not a.skip_gee:
                    refresh_gee(conn, kab, run_date, a.gee_days)
                    conn.commit()
                n_sim = fill_simulation(conn, kab, run_date)
                if n_sim:
                    log.info("%s: %d hari harga simulasi diperbarui", kab, n_sim)
                conn.commit()
                for i in range(a.backfill, -1, -1):
                    d = run_date - pd.Timedelta(days=i)
                    try:
                        rows = forecast_one(conn, kab, d)
                    except Exception as e:
                        if i == 0:
                            raise
                        log.warning("%s %s dilewati: %s", kab, d.date(), e)   # backfill: lanjut ke tanggal berikutnya
                        continue
                    log.info("%s %s: %s%s", kab, d.date(), [r["price_per_kg"] for r in rows],
                             " (simulasi)" if rows[0]["is_simulation"] else "")
                    if not a.dry_run:
                        # riwayat prakiraan (tanggal asal lampau) tidak ditimpa kecuali --overwrite
                        store.upsert_forecast(conn, rows, overwrite=(i == 0 or a.overwrite))
                    written += rows
                    conn.commit()
            except Exception:
                conn.rollback()
                log.exception("%s gagal", kab)
                failed.append(kab)
    step_summary([r for r in written if r["run_date"] == run_date.date()])
    log.info("Selesai: %d baris prakiraan%s; gagal: %s; lag GEE diasumsikan %d hari", len(written),
             " (dry-run, tidak ditulis)" if a.dry_run else "", failed or "-", GEE_LAG_DAYS)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
