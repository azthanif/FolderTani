"""Tes pipeline prakiraan harian (forecast_pipeline) dan integrasinya dengan GET /api/prices."""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from forecast_pipeline import config, features, gee, simulation, store

WIB = config.WIB


def today() -> pd.Timestamp:
    return pd.Timestamp(datetime.now(WIB).date())


def test_simulation_is_deterministic_and_range_independent():
    a = simulation.simulate_range("2026-01-01", "2026-11-23", "Garut").set_index("date").harga
    b = simulation.simulate_range("2026-11-01", "2026-11-23", "Garut").set_index("date").harga
    assert (a.loc[b.index] == b).all()
    # nilai acuan dari notebook modeling (harga simulasi Garut 23 Nov 2026)
    assert a.loc["2026-11-23"] == 6930
    assert not simulation.available("Cianjur")


def test_asof_merge_uses_only_available_composites():
    daily = pd.DataFrame({"date": pd.date_range("2026-01-01", "2026-04-30")})
    comp = pd.DataFrame({"date": pd.to_datetime(["2026-01-01", "2026-01-17", "2026-02-02"]),
                         "modis_ndvi": [0.5, 0.6, 0.7], "modis_evi": [0.3, 0.3, 0.3],
                         "modis_vi_valid_frac": [0.9, 0.1, 0.9]})
    m = gee._asof(daily, comp, "mod13", ["modis_ndvi", "modis_evi"], "modis_vi_valid_frac").set_index("date")
    assert np.isnan(m.loc["2026-01-16", "modis_ndvi"])          # komposit 1 Jan baru tersedia 17 Jan
    assert m.loc["2026-01-17", "modis_ndvi"] == 0.5
    assert m.loc["2026-02-17", "modis_ndvi"] == 0.5             # komposit 17 Jan dibuang (valid_frac < 0,2)
    assert m.loc["2026-02-18", "modis_ndvi"] == 0.7
    assert m.loc["2026-04-07", "modis_ndvi"] == 0.7 and np.isnan(m.loc["2026-04-08", "modis_ndvi"])  # umur > 48 hari -> kosong


def test_feature_frame_fills_missing_gee_with_climatology():
    p = pd.DataFrame({"date": pd.date_range("2026-01-01", "2026-03-01"), "harga": 7000.0})
    fr = features.build_feature_frame(p, pd.DataFrame(columns=config.GEE_RAW_COLUMNS), "Cianjur")
    assert fr["gee_filled"].all() and fr[config.SEQ_FEATURES].iloc[1:].notna().all().all()
    assert features.window_ok(fr, pd.Timestamp("2026-03-01"), 30)
    X = features.build_sequence(fr, pd.Timestamp("2026-03-01"), 14)
    assert X.shape == (1, 14, 15) and (X[0, :, 0] == 0).all()


def test_store_priority_rules(database_url):
    with store.connect(database_url) as conn:
        conn.execute("truncate price_observations, gee_features_daily")
        d = pd.DataFrame({"date": pd.to_datetime(["2026-05-01", "2026-05-02"]), "harga": [7000, 7100]})
        store.upsert_prices(conn, "Garut", d, "simulasi")
        store.upsert_prices(conn, "Garut", d.iloc[:1].assign(harga=6800), "asli")
        store.upsert_prices(conn, "Garut", d.assign(harga=9999), "simulasi")   # simulasi tidak menimpa asli
        got = store.read_prices(conn, "Garut", "2026-05-01", "2026-05-02").set_index("date")
        assert got.harga.tolist() == [6800, 9999] and got.is_simulated.tolist() == [False, True]
        g = pd.DataFrame({"chirps_precip_mm": [5.0]}, index=pd.to_datetime(["2026-05-01"]))
        store.upsert_gee(conn, "Garut", g, "csv_pelatihan")
        store.upsert_gee(conn, "Garut", g.assign(chirps_precip_mm=50.0), "gee_pipeline")  # data pelatihan tidak ditimpa
        assert store.read_gee(conn, "Garut", "2026-05-01", "2026-05-01").chirps_precip_mm.iloc[0] == 5.0
        conn.rollback()


@pytest.fixture()
def tf_available():
    pytest.importorskip("tensorflow")


def test_daily_run_writes_forecasts_and_api_serves_them(client, login, database_url, monkeypatch, tf_available):
    from forecast_pipeline import run

    end = today() - pd.Timedelta(days=1)
    dates = pd.date_range(end - pd.Timedelta(days=500), end)
    harga = 7000 + 100 * np.sin(np.arange(len(dates)) / 20.0)
    with store.connect(database_url) as conn:
        store.upsert_prices(conn, "Cianjur", pd.DataFrame({"date": dates, "harga": harga.round(-1)}), "asli", "tes")
        conn.commit()
    monkeypatch.setenv("DATABASE_URL", database_url)
    assert run.main(["--skip-gee", "--date", str(end.date()), "--backfill", "2"]) == 0
    with store.connect(database_url) as conn:
        rows = conn.execute("select kabupaten, run_date, horizon, target_date, price_per_kg, is_simulation, price_source"
                            " from price_forecasts order by kabupaten, run_date, horizon").fetchall()
    cj = [r for r in rows if r["kabupaten"] == "Cianjur"]
    gt = [r for r in rows if r["kabupaten"] == "Garut"]
    assert len(cj) == len(gt) == 3 * 8
    assert all(not r["is_simulation"] and r["price_source"] == "asli" for r in cj)
    assert all(r["is_simulation"] for r in gt)            # Garut 2026: harga input dari simulasi
    assert all(abs(r["price_per_kg"] - 7000) < 800 for r in cj)
    # idempoten: jalan ulang tidak menggandakan baris
    assert run.main(["--skip-gee", "--date", str(end.date()), "--regions", "Cianjur"]) == 0
    with store.connect(database_url) as conn:
        assert conn.execute("select count(*) as n from price_forecasts where kabupaten = 'Cianjur'").fetchone()["n"] == 24

    r = client.get("/api/prices", headers=login("admin")).json()
    c = r["regions"]["Cianjur"]
    latest = [x["price_per_kg"] for x in cj if x["run_date"] == end.date()]
    assert c["forecast"] == latest[1:] and c["previous"] == latest[0]
    assert len(c["actualDaily"]) == r["historyDays"] and len(c["predictedDaily"]) == r["historyDays"]
    assert c["meta"]["modelVersion"].startswith("lstm-cianjur") and c["meta"]["mape"] is not None
    assert c["meta"]["simulated"] is False and r["regions"]["Garut"]["meta"]["simulated"] is True
    assert r["asOf"] == str(end.date())


def test_lagging_rain_tail_uses_climatology_not_partial_sums():
    idx = pd.date_range("2025-06-01", "2026-03-01")
    g = pd.DataFrame({c: 1.0 for c in config.GEE_RAW_COLUMNS}, index=idx)
    g["chirps_precip_mm"] = 10.0
    g.loc["2026-02-01":, "chirps_precip_mm"] = np.nan          # CHIRPS tertinggal, ERA5 sudah ada
    p = pd.DataFrame({"date": idx, "harga": 7000.0})
    fr = features.build_feature_frame(p, g, "Garut")
    clim = features.gee_climatology("Garut")
    t = pd.Timestamp("2026-02-15")
    assert fr.loc["2026-01-31", "rain30"] == 300                  # sebelum batas: jendela penuh (sama dengan pelatihan)
    assert fr.loc[t, "rain30"] == pytest.approx(clim.loc[t.dayofyear, "rain30"]) and fr.loc[t, "gee_filled"]


def test_asof_with_no_composites_gives_empty_columns():
    daily = pd.DataFrame({"date": pd.date_range("2026-01-01", "2026-01-10")})
    m = gee._asof(daily, gee._frame([]), "mod11", ["modis_lst_day_c"], "modis_lst_valid_frac")
    assert len(m) == 10 and m["modis_lst_day_c"].isna().all()


def test_backfill_keeps_past_forecasts(database_url):
    row = {"kabupaten": "Garut", "run_date": pd.Timestamp("2026-05-01").date(), "target_date": pd.Timestamp("2026-05-02").date(),
           "horizon": 1, "price_per_kg": 7000, "model_version": "tes", "is_simulation": False, "price_source": "asli",
           "gee_filled": False, "backtest_mape_pct": 1.0}
    with store.connect(database_url) as conn:
        conn.execute("truncate price_forecasts")
        store.upsert_forecast(conn, [row])
        store.upsert_forecast(conn, [{**row, "price_per_kg": 9000}], overwrite=False)
        assert conn.execute("select price_per_kg from price_forecasts").fetchone()["price_per_kg"] == 7000
        store.upsert_forecast(conn, [{**row, "price_per_kg": 9000}], overwrite=True)
        assert conn.execute("select price_per_kg from price_forecasts").fetchone()["price_per_kg"] == 9000
        conn.rollback()
