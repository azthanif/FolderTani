"""Pipeline prakiraan harga GKP harian Temu Tani (Garut, Cianjur).

Alur harian (lihat run.py):
  1. tarik fitur GEE harian terbaru  -> tabel gee_features_daily
  2. lengkapi harga harian           -> tabel price_observations (asli / simulasi)
  3. bentuk fitur (identik notebook modeling) dan jalankan LSTM final
  4. simpan prakiraan h0..h+7        -> tabel price_forecasts (dibaca GET /api/prices)
"""
