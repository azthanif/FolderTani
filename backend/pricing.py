"""Data harga untuk GET /api/prices.

Sumber utama: tabel price_forecasts + price_observations yang diisi pipeline harian
forecast_pipeline (LSTM, dijalankan GitHub Actions). Bila sebuah kabupaten belum punya
prakiraan, dipakai simulasi lama (titik acuan diinterpolasi, prakiraan mengikuti kemiringan
7 hari terakhir). Kontrak respons API sama untuk keduanya.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone

WIB = timezone(timedelta(hours=7))
HISTORY_DAYS = 30
FORECAST_DAYS = 7
MAX_FORECAST_AGE_DAYS = 3  # prakiraan lebih tua dari ini dianggap basi (pipeline gagal) -> simulasi
HPP_GKP = 6500  # HPP GKP tingkat petani sejak 15 Jan 2025 (Keputusan Kepala Bapanas, Jan 2025).

PRICE_ANCHORS: dict[str, dict] = {
    "Garut": {
        "current": 7100,
        "previous": 6980,
        "actual": [6750, 6830, 6780, 6900, 6960, 6930, 7040, 7020, 7100, 7090, 7160, 7100],
        "predicted": [6780, 6810, 6840, 6880, 6910, 6960, 6980, 7020, 7040, 7070, 7080, 7100],
    },
    "Cianjur": {
        "current": 7040,
        "previous": 6900,
        "actual": [6680, 6710, 6760, 6740, 6830, 6880, 6850, 6960, 6910, 6990, 6970, 7040],
        "predicted": [6690, 6740, 6750, 6780, 6820, 6850, 6870, 6910, 6940, 6970, 7000, 7040],
    },
}

# Referensi harga wajar (Rp/kg) per jenis gabah. Privat untuk petani. Hanya GKP yang didukung.
AI_REFERENCE: dict[str, dict[str, int]] = {
    "Garut": {"GKP": 7100},
    "Cianjur": {"GKP": 7040},
}

REGIONS = tuple(PRICE_ANCHORS)


def canonical_region(name: str) -> str:
    """'Kab. Garut' / 'kabupaten garut' / 'GARUT' -> 'Garut' (nama wilayah yang punya data harga).
    Wilayah lain dikembalikan apa adanya (spasi dirapikan), mis. 'Kota Bandung'."""
    cleaned = " ".join((name or "").split())
    key = re.sub(r"^(kabupaten|kab\.?|kota)\s+", "", cleaned, flags=re.I).casefold()
    return next((r for r in REGIONS if r.casefold() == key), cleaned)


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


def region_prices(region: str, current: int | None = None) -> dict:
    """current: harga terbaru dari tabel price_predictions (bila ada); seluruh seri digeser agar berakhir di angka itu."""
    d = PRICE_ANCHORS[region]
    shift = (current - d["current"]) if current else 0
    d = {
        "current": d["current"] + shift,
        "previous": d["previous"] + shift,
        "actual": [v + shift for v in d["actual"]],
        "predicted": [v + shift for v in d["predicted"]],
    }
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


def load_forecasts(cur, regions: list[str], as_of: str | None = None) -> dict[str, dict]:
    """Prakiraan terbaru per kabupaten (run_date <= as_of) dalam bentuk region_prices().

    actualDaily  : harga harian 30 hari s.d. run_date (price_observations, diisi maju bila bolong)
    predictedDaily: prakiraan h+1 yang dibuat sehari sebelumnya untuk tiap hari itu (bila belum ada: harga hari itu)
    forecast     : prakiraan h+1..h+7 dari run terbaru
    current      : rata-rata prakiraan 7 hari (estimasi harga wajar); previous: harga hari asal (h0)
    """
    as_of = as_of or today_wib()
    out: dict[str, dict] = {}
    cur.execute("select to_regclass('public.price_forecasts') is not null as ok")
    if not cur.fetchone()["ok"]:  # migrasi 004 belum diterapkan: pakai simulasi
        return out
    oldest = (datetime.fromisoformat(as_of).date() - timedelta(days=MAX_FORECAST_AGE_DAYS)).isoformat()
    for kab in regions:
        cur.execute(
            "select run_date from price_forecasts where kabupaten = %s and run_date <= %s"
            " and run_date >= %s order by run_date desc limit 1", (kab, as_of, oldest))
        row = cur.fetchone()
        if not row:
            continue
        run = row["run_date"]
        cur.execute(
            "select horizon, price_per_kg, model_version, is_simulation, price_source, gee_filled, backtest_mape_pct"
            " from price_forecasts where kabupaten = %s and run_date = %s order by horizon", (kab, run))
        fc = cur.fetchall()
        if len(fc) != FORECAST_DAYS + 1:
            continue
        start = run - timedelta(days=HISTORY_DAYS - 1)
        cur.execute(
            "select date, price_per_kg, source from price_observations where kabupaten = %s"
            " and date between %s and %s order by date", (kab, start - timedelta(days=FORECAST_DAYS * 10), run))
        obs = {r["date"]: r for r in cur.fetchall()}
        cur.execute(
            "select target_date, price_per_kg from price_forecasts where kabupaten = %s"
            " and horizon = 1 and target_date between %s and %s", (kab, start, run))
        pred1 = {r["target_date"]: r["price_per_kg"] for r in cur.fetchall()}
        h0 = fc[0]["price_per_kg"]
        prior = [d for d in sorted(obs) if d < start]
        last = obs[prior[-1]]["price_per_kg"] if prior else None
        actual, predicted, sources = [], [], set()
        for i in range(HISTORY_DAYS):
            d = start + timedelta(days=i)
            if d in obs:
                last = obs[d]["price_per_kg"]
                sources.add(obs[d]["source"])
            v = last if last is not None else h0
            actual.append(v)
            predicted.append(pred1.get(d, v))
        actual[-1] = h0
        forecast = [r["price_per_kg"] for r in fc[1:]]
        mape = fc[0]["backtest_mape_pct"]
        out[kab] = {
            "current": js_round(sum(forecast) / len(forecast)),
            "previous": h0,
            "actualDaily": actual,
            "predictedDaily": predicted,
            "forecast": forecast,
            "meta": {
                "source": "Model LSTM Temu Tani",
                "runDate": run.isoformat(),
                "modelVersion": fc[0]["model_version"],
                "mape": float(mape) if mape is not None else None,
                "simulated": bool(fc[0]["is_simulation"] or "simulasi" in sources),
                "priceSource": fc[0]["price_source"],
                "geeFilled": bool(fc[0]["gee_filled"]),
            },
        }
    return out


def price_payload(regions: list[str], current: dict[str, int] | None = None,
                  forecasts: dict[str, dict] | None = None) -> dict:
    current = current or {}
    forecasts = forecasts or {}
    data = {}
    for r in regions:
        if r in forecasts:
            data[r] = forecasts[r]
        else:
            data[r] = region_prices(r, current.get(r))
            data[r]["meta"] = {"source": "Simulasi", "runDate": today_wib(), "modelVersion": None, "mape": None,
                               "simulated": True, "priceSource": "simulasi", "geeFilled": False}
    metas = [v["meta"] for v in data.values()]
    model = [m for m in metas if m["modelVersion"]]
    runs = [m["runDate"] for m in metas]
    return {
        "asOf": max(runs) if runs else today_wib(),  # tiap wilayah punya meta.runDate sendiri
        "historyDays": HISTORY_DAYS,
        "forecastDays": FORECAST_DAYS,
        "hpp": HPP_GKP,
        "meta": {
            "source": "Model LSTM Temu Tani" if model else "Model AI Temu Tani",
            "mape": None,
            "modelVersion": None,
            "simulated": any(m["simulated"] for m in metas) if metas else True,
        },
        "regions": data,
    }
