"""Rekayasa fitur untuk inferensi. Rumus disalin dari temutani_gabah.build_feature_frame
(notebook modeling) agar input LSTM identik dengan saat pelatihan; tes paritas ada di tests/."""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

from .config import (ARTIFACTS, FFILL_LIMIT, GEE_FEATURES, GEE_LAG_DAYS, HARVEST_CLIM, HPP_SCHEDULE,
                     SEQ_FEATURES)


def hpp_series(dates: pd.DatetimeIndex) -> pd.Series:
    s = pd.Series(np.nan, index=dates)
    for start, val in HPP_SCHEDULE:
        s[s.index >= pd.Timestamp(start)] = val
    return s.ffill()


def harvest_daily(idx: pd.DatetimeIndex, kab: str) -> pd.Series:
    """Pangsa panen klimatologis diinterpolasi ke harian (titik tengah bulan, siklik)."""
    clim = pd.Series(HARVEST_CLIM[kab], index=range(1, 13))
    anchor = pd.date_range(f"{idx.min().year - 1}-01-15", f"{idx.max().year + 1}-12-15", freq="MS") + pd.Timedelta(days=14)
    s = pd.Series(clim.reindex(anchor.month).values, index=anchor)
    full = s.reindex(s.index.union(idx)).interpolate("time")
    return full.reindex(idx)


def gee_derived(gee: pd.DataFrame) -> pd.DataFrame:
    """Turunan agregat GEE pada kalender harian (belum digeser)."""
    g = gee.asfreq("D")
    out = pd.DataFrame(index=g.index)
    out["rain7"] = g["chirps_precip_mm"].rolling(7, min_periods=5).sum()
    out["rain30"] = g["chirps_precip_mm"].rolling(30, min_periods=20).sum()
    out["rain90"] = g["chirps_precip_mm"].rolling(90, min_periods=60).sum()
    out["rain30_lag60"] = out["rain30"].shift(60)
    out["rain30_lag90"] = out["rain30"].shift(90)
    out["rain90_lag60"] = out["rain90"].shift(60)
    out["et30"] = g["era5_evap_mm"].rolling(30, min_periods=20).sum()
    out["soil30"] = g["soil_moisture_l1"].rolling(30, min_periods=20).mean()
    out["soil30_lag60"] = out["soil30"].shift(60)
    out["t2m30"] = g["t2m_mean_c"].rolling(30, min_periods=20).mean()
    out["tmax30"] = g["t2m_max_c"].rolling(30, min_periods=20).mean()
    out["rh30"] = g["rh_pct"].rolling(30, min_periods=20).mean()
    out["lst_day30"] = g["modis_lst_day_c"].rolling(30, min_periods=10).mean()
    ndvi = g["modis_ndvi"].ffill(limit=32)
    out["ndvi"] = ndvi
    out["evi"] = g["modis_evi"].ffill(limit=32)
    out["ndvi_chg30"] = ndvi - ndvi.shift(30)
    out["ndvi_lag60"] = ndvi.shift(60)
    out["ndvi_lag90"] = ndvi.shift(90)
    out["vh30"] = g["s1_vh_db"].rolling(30, min_periods=5).mean()
    out["vv30"] = g["s1_vv_db"].rolling(30, min_periods=5).mean()
    return out


WEATHER_COLUMNS = ["chirps_precip_mm", "era5_evap_mm", "soil_moisture_l1", "t2m_mean_c", "t2m_max_c", "rh_pct"]


def trim_incomplete_gee(gee: pd.DataFrame) -> pd.DataFrame:
    """Buang hari setelah data cuaca harian terakhir yang LENGKAP.

    Saat pelatihan, CSV GEE lengkap sampai tanggal akhirnya lalu diisi klimatologi. Di produksi CHIRPS
    tertinggal beberapa minggu dan ERA5-Land beberapa hari; tanpa pemotongan ini rolling(30, min_periods=20)
    menjumlahkan jendela yang bolong sehingga rain7/rain30 lebih kecil dari seharusnya (train/serve skew).
    Setelah dipotong, hari sesudahnya diisi klimatologi persis seperti saat pelatihan (gee_filled = True).
    """
    if gee.empty:
        return gee
    cols = [c for c in WEATHER_COLUMNS if c in gee.columns]
    last = [gee[c].last_valid_index() for c in cols]
    if any(v is None for v in last):
        return gee.iloc[0:0]
    cut = min(last)   # kolom cuaca yang paling tertinggal menentukan batas (bolong di tengah dibiarkan, sama dengan pelatihan)
    return gee.loc[:cut]


@lru_cache(maxsize=4)
def gee_climatology(kab: str) -> pd.DataFrame:
    """Rata-rata per day-of-year fitur GEE turunan dari data pelatihan (<= END_DATE model)."""
    return pd.read_csv(ARTIFACTS / f"gee_clim_{kab.lower()}.csv", index_col="doy")


def build_feature_frame(price: pd.DataFrame, gee: pd.DataFrame, kab: str, start=None, end=None,
                        ffill_limit: int = FFILL_LIMIT) -> pd.DataFrame:
    """Frame harian berisi y, sumber_harga, dan fitur sekuens LSTM.

    price: kolom date, harga (+ opsional is_simulated). gee: indeks date, kolom GEE_RAW_COLUMNS.
    Semua fitur di baris t hanya memakai informasi <= t (GEE <= t-5). GEE yang belum tersedia
    diisi klimatologi day-of-year (kolom gee_filled).
    """
    p = price.copy()
    p["date"] = pd.to_datetime(p["date"])
    s = p.set_index("date")["harga"].astype(float).sort_index()
    start = pd.Timestamp(start) if start is not None else s.index.min()
    end = pd.Timestamp(end) if end is not None else s.index.max()
    idx = pd.date_range(start, end, freq="D")
    df = pd.DataFrame(index=idx)
    df.index.name = "date"
    df["y_obs"] = s.reindex(idx)
    df["observed"] = df["y_obs"].notna()
    df["y"] = df["y_obs"].ffill(limit=ffill_limit)
    if "is_simulated" in p.columns:
        df["is_simulated"] = p.set_index("date")["is_simulated"].astype(bool).reindex(idx).fillna(False).astype(bool)
    else:
        df["is_simulated"] = False
    df["sumber_harga"] = np.select(
        [df["observed"] & df["is_simulated"], df["observed"], df["y"].notna()],
        ["simulasi", "asli", "ffill"], default="kosong")
    y = df["y"]
    df["d1"] = y - y.shift(1)
    df["hpp"] = hpp_series(idx)
    df["gap_hpp"] = y - df["hpp"]
    m = idx.month
    df["month_sin"] = np.sin(2 * np.pi * m / 12)
    df["month_cos"] = np.cos(2 * np.pi * m / 12)
    wk = idx.isocalendar().week.values.astype(float)
    df["week_sin"] = np.sin(2 * np.pi * wk / 52.18)
    df["week_cos"] = np.cos(2 * np.pi * wk / 52.18)

    def _lag(k):
        out = y.shift(k)
        for j in range(1, 8):
            out = out.fillna(y.shift(k - j)).fillna(y.shift(k + j))
        return out

    df["yoy_next7"] = (_lag(358) - _lag(365)).fillna(0)
    df["harvest_share"] = harvest_daily(idx, kab).values
    # GEE: turunan -> geser lag publikasi -> isi klimatologi -> reindex
    gee = gee.copy()
    gee.index = pd.to_datetime(gee.index)
    gee = trim_incomplete_gee(gee.sort_index())
    gd = gee_derived(gee.sort_index()).shift(GEE_LAG_DAYS) if len(gee) else pd.DataFrame(columns=GEE_FEATURES)
    gd = gd.reindex(gd.index.union(idx))
    clim = gee_climatology(kab)
    filled = gd.isna().all(axis=1)
    for c in GEE_FEATURES:
        miss = gd[c].isna()
        if miss.any():
            gd.loc[miss, c] = clim[c].reindex(gd.index[miss].dayofyear).values
    gd = gd.reindex(idx)
    df[GEE_FEATURES] = gd[GEE_FEATURES]
    df["gee_filled"] = filled.reindex(idx).fillna(True).values
    return df


def window_ok(df: pd.DataFrame, origin: pd.Timestamp, lookback: int) -> bool:
    """True bila jendela `lookback` hari yang berakhir di origin lengkap (harga & fitur sekuens)."""
    w = df.loc[origin - pd.Timedelta(days=lookback - 1):origin]
    return len(w) == lookback and bool(w["y"].notna().all()) and bool(w[SEQ_FEATURES].notna().all().all())


def build_sequence(df: pd.DataFrame, origin: pd.Timestamp, lookback: int) -> np.ndarray:
    """Tensor (1, lookback, 1+len(SEQ_FEATURES)); kanal 0 = y(t-j) - y(t)."""
    p = df.index.get_loc(origin)
    sl = slice(p - lookback + 1, p + 1)
    yv = df["y"].values
    X = np.empty((1, lookback, 1 + len(SEQ_FEATURES)), dtype=np.float32)
    X[0, :, 0] = yv[sl] - yv[p]
    X[0, :, 1:] = df[SEQ_FEATURES].values[sl]
    return X
