"""Simulasi harga harian deterministik (Garut 2026+), salinan PriceSimulationEngine.simulate_range.

Dipakai HANYA untuk mengisi hari tanpa observasi asli agar prakiraan tetap bisa ditampilkan.
Nilai hari ke-t tidak bergantung pada panjang rentang (noise per hari dari SeedSequence([seed, t])),
sehingga harga simulasi yang sudah tersimpan tidak berubah ketika pipeline dijalankan ulang.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd

from .config import ARTIFACTS


@lru_cache(maxsize=1)
def _params() -> dict:
    return json.loads((ARTIFACTS / "sim_params.json").read_text())


def available(kab: str) -> bool:
    return kab in _params()["params"]


def last_real_date(kab: str) -> pd.Timestamp:
    return pd.Timestamp(_params()["params"][kab]["last_real_date"])


def simulate_range(start, end, kab: str) -> pd.DataFrame:
    p = _params()
    m = p["params"][kab]
    min_dt = pd.Timestamp(m["min_date"])
    dates = pd.date_range(pd.Timestamp(start), pd.Timestamp(end), freq="D")
    if len(dates) == 0:
        return pd.DataFrame(columns=["date", "harga"])
    t = (dates - min_dt).days.values
    t_max = int(t.max())
    raw = np.array([np.random.default_rng([p["seed"], k]).standard_normal() for k in range(t_max + 1)])
    raw = raw * m["noise_std_raw"] * p["noise_scale"]
    noise = pd.Series(raw).ewm(alpha=p["ewm_alpha"]).mean().values[t]
    trend = m["intercept"] + m["slope_per_day"] * t
    season = np.array([m["monthly_season"][str(mo)] for mo in dates.month])
    harga = np.clip(trend + season + noise, 0, None)
    step = p["round_step"]
    if step > 1:
        harga = np.round(harga / step) * step
    return pd.DataFrame({"date": dates, "harga": harga.astype(float)})
