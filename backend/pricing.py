"""Simulasi keluaran model harga AI.

Logika sama dengan app.js versi statis: titik acuan dipadatkan menjadi seri harian
(interpolasi linier) yang berakhir hari ini (WIB), lalu prakiraan 7 hari mengikuti
kemiringan 7 hari terakhir. Saat model sungguhan tersedia, cukup ganti fungsi di sini;
kontrak respons API tidak perlu berubah.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

WIB = timezone(timedelta(hours=7))
HISTORY_DAYS = 30
FORECAST_DAYS = 7
HPP_GKP = 6500  # Angka contoh dari proposal; wajib diverifikasi terhadap regulasi saat go-live.

PRICE_ANCHORS: dict[str, dict] = {
    "Garut": {
        "current": 7100,
        "previous": 6980,
        "actual": [6750, 6830, 6780, 6900, 6960, 6930, 7040, 7020, 7100, 7090, 7160, 7100],
        "predicted": [6780, 6810, 6840, 6880, 6910, 6960, 6980, 7020, 7040, 7070, 7080, 7100],
    },
    "Sukabumi": {
        "current": 7040,
        "previous": 6900,
        "actual": [6680, 6710, 6760, 6740, 6830, 6880, 6850, 6960, 6910, 6990, 6970, 7040],
        "predicted": [6690, 6740, 6750, 6780, 6820, 6850, 6870, 6910, 6940, 6970, 7000, 7040],
    },
}

# Referensi harga wajar per jenis gabah (dulu currentAI() di app.js). Privat untuk petani.
AI_REFERENCE: dict[str, dict[str, int]] = {
    "Garut": {"GKP": 7100, "GKG": 7350},
    "Sukabumi": {"GKP": 7040, "GKG": 7300},
}

REGIONS = tuple(PRICE_ANCHORS)


def js_round(x: float) -> int:
    """Setara Math.round() JavaScript (round half up), bukan banker's rounding Python."""
    return math.floor(x + 0.5)


def today_wib() -> str:
    return datetime.now(WIB).date().isoformat()


def daily_series(anchors: list[int], days: int) -> list[int]:
    out = []
    for i in range(days):
        t = i * (len(anchors) - 1) / (days - 1)
        k = math.floor(t)
        f = t - k
        a = anchors[k]
        b = anchors[min(k + 1, len(anchors) - 1)]
        out.append(js_round(a + (b - a) * f))
    return out


def region_prices(region: str) -> dict:
    d = PRICE_ANCHORS[region]
    actual_daily = daily_series(d["actual"], HISTORY_DAYS)
    predicted_daily = daily_series(d["predicted"], HISTORY_DAYS)
    last = predicted_daily[HISTORY_DAYS - 1]
    slope = (last - predicted_daily[HISTORY_DAYS - 8]) / 7
    forecast = [js_round(last + slope * (i + 1)) for i in range(FORECAST_DAYS)]
    return {
        "current": d["current"],
        "previous": d["previous"],
        "actualDaily": actual_daily,
        "predictedDaily": predicted_daily,
        "forecast": forecast,
    }


def price_payload(regions: list[str]) -> dict:
    return {
        "asOf": today_wib(),
        "historyDays": HISTORY_DAYS,
        "forecastDays": FORECAST_DAYS,
        "hpp": HPP_GKP,
        "meta": {"source": "Model AI Temu Tani", "mape": None, "modelVersion": None, "simulated": True},
        "regions": {r: region_prices(r) for r in regions},
    }
