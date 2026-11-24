"""Akses database (Postgres/Supabase lewat DATABASE_URL) untuk pipeline prakiraan."""
from __future__ import annotations

import os
from contextlib import contextmanager

import pandas as pd
import psycopg
from psycopg.rows import dict_row

from .config import GEE_RAW_COLUMNS


@contextmanager
def connect(url: str | None = None):
    url = url or os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL belum di-set.")
    with psycopg.connect(url, prepare_threshold=None, row_factory=dict_row) as conn:
        yield conn


# ------------------------------------------------------------------ GEE
def upsert_gee(conn, kab: str, df: pd.DataFrame, source: str = "gee_pipeline") -> int:
    """Simpan fitur GEE harian. Baris dari CSV pelatihan tidak ditimpa tarikan pipeline;
    nilai kosong pada tarikan baru tidak menghapus nilai lama."""
    df = df.reindex(columns=GEE_RAW_COLUMNS)
    df = df[df.notna().any(axis=1)]
    if df.empty:
        return 0
    cols = ", ".join(GEE_RAW_COLUMNS)
    ph = ", ".join(["%s"] * (len(GEE_RAW_COLUMNS) + 3))
    upd = ", ".join(f"{c} = coalesce(excluded.{c}, gee_features_daily.{c})" for c in GEE_RAW_COLUMNS)
    sql = (f"insert into gee_features_daily (kabupaten, date, source, {cols}) values ({ph}) "
           f"on conflict (kabupaten, date) do update set {upd}, source = excluded.source, fetched_at = now() "
           f"where gee_features_daily.source <> 'csv_pelatihan' or excluded.source = 'csv_pelatihan'")
    rows = [(kab, pd.Timestamp(d).date(), source, *[None if pd.isna(v) else float(v) for v in r])
            for d, r in zip(df.index, df.itertuples(index=False))]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    return len(rows)


def read_gee(conn, kab: str, start, end) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(f"select date, {', '.join(GEE_RAW_COLUMNS)} from gee_features_daily "
                    "where kabupaten = %s and date between %s and %s order by date",
                    (kab, pd.Timestamp(start).date(), pd.Timestamp(end).date()))
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=["date", *GEE_RAW_COLUMNS])
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date").astype(float)


def last_gee_date(conn, kab: str):
    with conn.cursor() as cur:
        cur.execute("select max(date) as d from gee_features_daily where kabupaten = %s and chirps_precip_mm is not null", (kab,))
        return cur.fetchone()["d"]


# ------------------------------------------------------------------ harga
def upsert_prices(conn, kab: str, df: pd.DataFrame, source: str, detail: str | None = None) -> int:
    """df: kolom date, harga. 'asli' selalu menimpa; 'simulasi' hanya mengisi/menimpa simulasi."""
    if df.empty:
        return 0
    sql = ("insert into price_observations (kabupaten, date, price_per_kg, source, source_detail) "
           "values (%s, %s, %s, %s, %s) on conflict (kabupaten, date) do update set "
           "price_per_kg = excluded.price_per_kg, source = excluded.source, source_detail = excluded.source_detail, "
           "updated_at = now() where price_observations.source = 'simulasi' or excluded.source = 'asli'")
    rows = [(kab, pd.Timestamp(d).date(), int(round(float(h))), source, detail) for d, h in zip(df["date"], df["harga"])]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    return len(rows)


def read_prices(conn, kab: str, start, end) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute("select date, price_per_kg, source from price_observations where kabupaten = %s "
                    "and date between %s and %s order by date", (kab, pd.Timestamp(start).date(), pd.Timestamp(end).date()))
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=["date", "price_per_kg", "source"])
    return pd.DataFrame({"date": pd.to_datetime(df["date"]), "harga": df["price_per_kg"].astype(float),
                         "is_simulated": df["source"].eq("simulasi")})


def last_real_price_date(conn, kab: str):
    with conn.cursor() as cur:
        cur.execute("select max(date) as d from price_observations where kabupaten = %s and source = 'asli'", (kab,))
        return cur.fetchone()["d"]


# ------------------------------------------------------------------ prakiraan
def upsert_forecast(conn, rows: list[dict], overwrite: bool = True) -> int:
    """overwrite=False: baris yang sudah ada dibiarkan (rekam jejak prakiraan tidak ditulis ulang dengan data menyusul)."""
    sql = ("insert into price_forecasts (kabupaten, run_date, target_date, horizon, price_per_kg, "
           "model_version, is_simulation, price_source, gee_filled, backtest_mape_pct) values "
           "(%(kabupaten)s, %(run_date)s, %(target_date)s, %(horizon)s, %(price_per_kg)s, %(model_version)s, "
           "%(is_simulation)s, %(price_source)s, %(gee_filled)s, %(backtest_mape_pct)s) "
           "on conflict (kabupaten, run_date, horizon) do update set target_date = excluded.target_date, "
           "price_per_kg = excluded.price_per_kg, model_version = excluded.model_version, "
           "is_simulation = excluded.is_simulation, price_source = excluded.price_source, "
           "gee_filled = excluded.gee_filled, backtest_mape_pct = excluded.backtest_mape_pct, created_at = now()")
    if not overwrite:
        sql = sql[:sql.index("on conflict")] + "on conflict (kabupaten, run_date, horizon) do nothing"
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    return len(rows)
