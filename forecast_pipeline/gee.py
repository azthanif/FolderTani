"""Tarik fitur GEE harian per kabupaten, port langsung dari notebook ekstraksi
`kode_ekstraksiv8.ipynb` (sumber CSV fitur GEE yang dipakai melatih model).

Yang dipertahankan sama persis dengan notebook ekstraksi:
* batas wilayah: GAUL 2024 (sat-io) lalu GAUL 2015; poligon terbesar di Jawa Barat >= 1.000 km2;
* masker cropland ESA WorldCover v200 kelas 40;
* CHIRPS dan ERA5-Land harian direduksi pada skala 500 m; MOD13Q1 250 m (SummaryQA <= 1);
  MOD11A2 500 m (QC bit 0-1 <= 1); Sentinel-1 IW komposit 12 hari (rerata linear, VV > -30 dB) 30 m;
* komposit digabung as-of pada avail_date = tanggal komposit + periode, dibuang bila
  valid_frac < 0,20 atau umur > MAX_AGE (mod13 48, mod11 24, s1 36 hari);
* RH dari suhu dan titik embun (Magnus, a = 17,625, b = 243,04), dipotong maks 100.
Jendela Sentinel-1 disejajarkan dari START_DATE ekstraksi asli (Garut 2019-01-01, Cianjur 2016-01-01).

Hanya kolom GEE_RAW_COLUMNS yang dihasilkan (yang dipakai fitur model).
"""
from __future__ import annotations

import json
import logging
import math
import os
import time

import numpy as np
import pandas as pd

from .config import GEE_RAW_COLUMNS

log = logging.getLogger("forecast.gee")

BOUNDARY_SOURCES = [
    dict(asset="projects/sat-io/open-datasets/FAO/GAUL/GAUL_2024_L2", adm0="gaul0_name", adm1="gaul1_name", adm2="gaul2_name"),
    dict(asset="FAO/GAUL/2015/level2", adm0="ADM0_NAME", adm1="ADM1_NAME", adm2="ADM2_NAME"),
]
PROVINCE_KEYS = ("jawa barat", "west java")
MIN_AREA_KM2 = 1000
ANCHOR_START = {"Garut": "2019-01-01", "Cianjur": "2016-01-01"}   # START_DATE notebook ekstraksi
MIN_VALID_FRAC = 0.20
MAX_AGE = {"mod13": 48, "mod11": 24, "s1": 36}
PERIOD = {"mod13": 16, "mod11": 8, "s1": 12}
LOOKBACK_COMPOSITE_DAYS = 64      # komposit yang masih "berlaku" di awal rentang (periode + umur maks)
HEAVY_ERRORS = ("timed out", "memory", "too many", "limit", "aborted", "capacity")


def initialize() -> None:
    """Inisialisasi Earth Engine dari env GEE_SERVICE_ACCOUNT_KEY (isi JSON key akun layanan) + GEE_PROJECT."""
    import ee

    key = os.getenv("GEE_SERVICE_ACCOUNT_KEY", "").strip()
    if not key:
        raise RuntimeError("GEE_SERVICE_ACCOUNT_KEY belum di-set (isi JSON key akun layanan Earth Engine).")
    info = json.loads(key)
    creds = ee.ServiceAccountCredentials(info["client_email"], key_data=key)
    ee.Initialize(creds, project=os.getenv("GEE_PROJECT", "").strip() or info.get("project_id"))


def load_region(kab: str):
    """FeatureCollection berisi satu fitur (properti 'kabupaten') untuk kabupaten kab."""
    import ee

    variants = [kab, f"Kabupaten {kab}", f"Kab. {kab}", f"{kab} Regency"]
    for src in BOUNDARY_SOURCES:
        try:
            fc = (ee.FeatureCollection(src["asset"]).filter(ee.Filter.eq(src["adm0"], "Indonesia"))
                  .filter(ee.Filter.inList(src["adm2"], variants)))
            fc = fc.map(lambda f: f.set("area_km2", f.geometry().area(100).divide(1e6)))
            info = fc.select([src["adm1"], src["adm2"], "area_km2"], None, False).getInfo()["features"]
        except Exception as err:  # pragma: no cover - jaringan/aset
            log.warning("%s: gagal (%s)", src["asset"], str(err)[:80])
            continue
        best = None
        for f in info:
            p = f["properties"]
            if not any(k in str(p.get(src["adm1"], "")).lower() for k in PROVINCE_KEYS) or p["area_km2"] < MIN_AREA_KM2:
                continue
            if kab.lower() in str(p[src["adm2"]]).lower() and (best is None or p["area_km2"] > best[1]):
                best = (f["id"], p["area_km2"], p[src["adm2"]])
        if best:
            log.info("Batas %s: %s \"%s\" %.0f km2", kab, src["asset"], best[2], best[1])
            feat = ee.Feature(fc.filter(ee.Filter.eq("system:index", best[0])).first()).set("kabupaten", kab).select(["kabupaten"])
            return ee.FeatureCollection([feat])
    raise RuntimeError(f"Batas kabupaten {kab} tidak ditemukan.")


def _reduce(ic, regions, scale, names=None):
    import ee

    reducer = ee.Reducer.mean().setOutputs(names) if names else ee.Reducer.mean()

    def per_img(img):
        date = img.date().format("YYYY-MM-dd")
        fc = img.reduceRegions(collection=regions, reducer=reducer, scale=scale, tileScale=4)
        return fc.map(lambda f: ee.Feature(None, f.toDictionary()).set("date", date))

    return ic.map(per_img).flatten()


def _fetch(build_fc, s: pd.Timestamp, e: pd.Timestamp, min_days=8, max_retry=3) -> list[dict]:
    import ee

    last = None
    for attempt in range(max_retry):
        try:
            return [f["properties"] for f in build_fc(s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d")).getInfo()["features"]]
        except ee.EEException as err:  # pragma: no cover - jaringan
            last = err
            if any(k in str(err).lower() for k in HEAVY_ERRORS) and (e - s).days > min_days:
                mid = (s + (e - s) / 2).normalize()
                return _fetch(build_fc, s, mid) + _fetch(build_fc, mid, e)
            time.sleep(5 * 2 ** attempt)
    raise RuntimeError(f"GEE gagal {s.date()}..{e.date()}: {last}")


def _frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=["date"])
    df["date"] = pd.to_datetime(df["date"])
    return df.drop(columns=[c for c in ("kabupaten",) if c in df]).drop_duplicates("date").sort_values("date")


def _asof(daily: pd.DataFrame, comp: pd.DataFrame, prefix: str, value_cols: list[str], frac_col: str) -> pd.DataFrame:
    """Gabung komposit as-of (tanpa nilai masa depan), sama dengan asof_merge notebook ekstraksi."""
    if comp.empty:  # mis. gangguan MODIS: tidak ada komposit di jendela -> kolom kosong (diisi klimatologi)
        daily = daily.copy()
        daily[value_cols] = np.nan
        return daily
    comp = comp.copy()
    for c in value_cols + [frac_col]:
        if c not in comp:
            comp[c] = np.nan
    comp.loc[comp[frac_col].fillna(0) < MIN_VALID_FRAC, value_cols] = np.nan
    comp = comp.dropna(subset=value_cols, how="all")
    comp["avail_date"] = comp["date"] + pd.Timedelta(days=PERIOD[prefix])
    comp = comp[["avail_date"] + value_cols].sort_values("avail_date")
    m = pd.merge_asof(daily.sort_values("date"), comp, left_on="date", right_on="avail_date", direction="backward")
    age = (m["date"] - m["avail_date"]).dt.days
    m.loc[age > MAX_AGE[prefix], value_cols] = np.nan
    return m.drop(columns="avail_date")


def fetch(kab: str, start, end) -> pd.DataFrame:
    """Fitur harian [start, end] inklusif -> DataFrame berindeks date dengan kolom GEE_RAW_COLUMNS."""
    import ee

    start, end = pd.Timestamp(start).normalize(), pd.Timestamp(end).normalize()
    regions = load_region(kab)
    geom = regions.geometry()
    crop = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").eq(40)
    crop_masked = crop.selfMask()
    e_excl = end + pd.Timedelta(days=1)
    c_start = start - pd.Timedelta(days=LOOKBACK_COMPOSITE_DAYS)

    def build_chirps(s, e):
        ic = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(s, e)
              .select(["precipitation"], ["chirps_precip_mm"]).map(lambda i: i.updateMask(crop_masked)))
        return _reduce(ic, regions, 500, ["chirps_precip_mm"])

    def prep_era5(img):
        t = (img.select(["temperature_2m", "temperature_2m_max", "dewpoint_temperature_2m"]).subtract(273.15)
             .rename(["t2m_mean_c", "t2m_max_c", "td2m_c"]))
        ev = img.select("total_evaporation_sum").multiply(-1000).rename("era5_evap_mm")
        sm = img.select("volumetric_soil_water_layer_1").rename("soil_moisture_l1")
        return ee.Image(t.addBands([ev, sm]).updateMask(crop_masked).copyProperties(img, ["system:time_start"]))

    def build_era5(s, e):
        return _reduce(ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR").filterDate(s, e).map(prep_era5), regions, 500)

    def prep_mod13(img):
        good = img.select("SummaryQA").lte(1)
        vi = img.select(["NDVI", "EVI"]).multiply(0.0001).rename(["modis_ndvi", "modis_evi"]).updateMask(good)
        frac = good.unmask(0).rename("modis_vi_valid_frac")
        return ee.Image(vi.addBands(frac).updateMask(crop_masked).copyProperties(img, ["system:time_start"]))

    def build_mod13(s, e):
        return _reduce(ee.ImageCollection("MODIS/061/MOD13Q1").filterDate(s, e).map(prep_mod13), regions, 250)

    def prep_mod11(img):
        gd = img.select("QC_Day").bitwiseAnd(3).lte(1)
        day = img.select("LST_Day_1km").multiply(0.02).subtract(273.15).rename("modis_lst_day_c").updateMask(gd)
        frac = gd.unmask(0).rename("modis_lst_valid_frac")
        return ee.Image(day.addBands(frac).updateMask(crop_masked).copyProperties(img, ["system:time_start"]))

    def build_mod11(s, e):
        return _reduce(ee.ImageCollection("MODIS/061/MOD11A2").filterDate(s, e).map(prep_mod11), regions, 500)

    def s1_window(start_d, period):
        ic = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geom)
              .filterDate(start_d, start_d.advance(period, "day"))
              .filter(ee.Filter.eq("instrumentMode", "IW"))
              .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
              .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
              .select(["VV", "VH"]))
        lin = ic.map(lambda i: i.updateMask(i.select("VV").gt(-30)).divide(10).multiply(math.log(10)).exp())

        def composite():
            db = lin.mean().log10().multiply(10).rename(["s1_vv_db", "s1_vh_db"])
            frac = db.select("s1_vv_db").mask().unmask(0).rename("s1_valid_frac")
            return db.addBands(frac).toFloat()

        empty = (ee.Image.constant([0, 0]).rename(["s1_vv_db", "s1_vh_db"]).updateMask(0).toFloat()
                 .addBands(ee.Image.constant(0).rename("s1_valid_frac").toFloat()))
        img = ee.Image(ee.Algorithms.If(ic.size().gt(0), composite(), empty))
        return img.updateMask(crop_masked).set("system:time_start", start_d.millis())

    def build_s1(s, e):
        all_starts = pd.date_range(ANCHOR_START[kab], e_excl, freq=f"{PERIOD['s1']}D")
        starts = [d.strftime("%Y-%m-%d") for d in all_starts if pd.Timestamp(s) <= d < pd.Timestamp(e)]
        ic = ee.ImageCollection.fromImages(ee.List(starts).map(lambda d: s1_window(ee.Date(d), PERIOD["s1"]))) \
            if starts else ee.ImageCollection([])
        return _reduce(ic, regions, 30)

    chirps = _frame(_fetch(build_chirps, start, e_excl))
    era5 = _frame(_fetch(build_era5, start, e_excl))
    mod13 = _frame(_fetch(build_mod13, c_start, e_excl))
    mod11 = _frame(_fetch(build_mod11, c_start, e_excl))
    s1 = _frame(_fetch(build_s1, c_start, e_excl))

    panel = pd.DataFrame({"date": pd.date_range(start, end, freq="D")})
    panel = panel.merge(chirps, on="date", how="left").merge(era5, on="date", how="left")
    panel = _asof(panel, mod13, "mod13", ["modis_ndvi", "modis_evi"], "modis_vi_valid_frac")
    panel = _asof(panel, mod11, "mod11", ["modis_lst_day_c"], "modis_lst_valid_frac")
    panel = _asof(panel, s1, "s1", ["s1_vv_db", "s1_vh_db"], "s1_valid_frac")
    a, b = 17.625, 243.04
    if {"td2m_c", "t2m_mean_c"} <= set(panel.columns):
        panel["rh_pct"] = (100 * np.exp(a * panel["td2m_c"] / (b + panel["td2m_c"]))
                           / np.exp(a * panel["t2m_mean_c"] / (b + panel["t2m_mean_c"]))).clip(upper=100)
    return panel.set_index("date").reindex(columns=GEE_RAW_COLUMNS).astype(float)
