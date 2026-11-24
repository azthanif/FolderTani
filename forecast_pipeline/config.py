"""Konstanta pipeline. Nilai-nilai ini HARUS sama dengan yang dipakai saat melatih model
(pustaka temutani_gabah.py pada folder modeling-harga-gabah); jangan diubah tanpa melatih ulang."""
from __future__ import annotations

from datetime import timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
WIB = timezone(timedelta(hours=7))

REGIONS = ("Garut", "Cianjur")
H = 7                    # horizon prakiraan (hari)
GEE_LAG_DAYS = 5         # fitur GEE di hari t memakai data <= t-5 (latensi publikasi, asumsi saat pelatihan)
FFILL_LIMIT = 7          # isi maju harga saat pelatihan (maks 7 hari)
# Operasional: bila observasi asli jarang (Cianjur 2026), isi maju diperpanjang agar jendela input terisi.
# Hari yang terisi dengan cara ini ditandai 'ffill' dan prakiraannya ditandai is_simulation.
OPERATIONAL_FFILL_LIMIT = 70
HISTORY_DAYS = 460       # riwayat yang dibaca untuk membentuk fitur (lag 365 + jendela 90 hari + lookback)

# Riwayat HPP GKP tingkat petani (Rp/kg), tanggal berlaku mengikuti daftar BPS;
# Rp6.500 (15 Jan 2025) dari Keputusan Kepala Bapanas Jan 2025.
HPP_SCHEDULE = [
    ("2012-02-27", 3300),   # Inpres 3/2012
    ("2015-03-17", 3700),   # Inpres 5/2015
    ("2020-03-19", 4200),   # Permendag 24/2020
    ("2023-03-24", 5000),   # Perbadan 6/2023
    ("2024-06-05", 6000),   # Peraturan Bapanas 4/2024
    ("2025-01-15", 6500),   # Keputusan Kepala Bapanas Jan 2025
]

# Pangsa luas panen bulanan klimatologis BPS KSA 2018-2023 (bulan 1..12), dari harvest_climatology().
HARVEST_CLIM = {
    "Garut": [0.05435, 0.0863, 0.12471, 0.11622, 0.09075, 0.10112, 0.10724, 0.08123, 0.07394, 0.05537, 0.06066, 0.04812],
    "Cianjur": [0.05744, 0.10736, 0.15531, 0.10543, 0.07549, 0.09249, 0.12234, 0.10226, 0.05804, 0.04481, 0.04599, 0.03304],
}

# Kolom GEE harian mentah yang dibutuhkan fitur model (subset CSV fitur GEE yang dipakai saat pelatihan).
GEE_RAW_COLUMNS = [
    "chirps_precip_mm", "era5_evap_mm", "soil_moisture_l1", "t2m_mean_c", "t2m_max_c", "rh_pct",
    "modis_lst_day_c", "modis_ndvi", "modis_evi", "s1_vv_db", "s1_vh_db",
]
GEE_FEATURES = ["rain7", "rain30", "rain90", "rain30_lag60", "rain30_lag90", "rain90_lag60",
                "et30", "soil30", "soil30_lag60", "t2m30", "tmax30", "rh30", "lst_day30",
                "ndvi", "evi", "ndvi_chg30", "ndvi_lag60", "ndvi_lag90", "vh30", "vv30"]
SEQ_FEATURES = ["d1", "gap_hpp", "rain30", "rain30_lag60", "soil30", "t2m30", "ndvi", "vh30",
                "month_sin", "month_cos", "week_sin", "week_cos", "harvest_share", "yoy_next7"]
