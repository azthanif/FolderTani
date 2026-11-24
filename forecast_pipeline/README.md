# Pipeline prakiraan harga GKP harian

Setiap hari pukul 06.00 WIB, workflow GitHub Actions `Prakiraan harga harian` (`.github/workflows/price-forecast-daily.yml`) menjalankan:

1. **Tarik GEE** (`gee.py`): 45 hari terakhir untuk Garut dan Cianjur, plus hari yang tertinggal sejak tarikan terakhir. Kodenya port langsung dari notebook ekstraksi `kode_ekstraksiv8.ipynb`, dengan masker cropland WorldCover, CHIRPS, ERA5-Land, MOD13Q1, MOD11A2, dan Sentinel-1 12 hari. Hasilnya disimpan ke tabel `gee_features_daily`.
2. **Lengkapi harga** (`simulation.py`): hari tanpa observasi asli di Garut (sejak 1 Jan 2026) diisi simulasi deterministik `sim_params.json` dengan `source = 'simulasi'`. Observasi asli selalu menimpa simulasi.
3. **Bentuk fitur** (`features.py`): rumusnya identik dengan `temutani_gabah.build_feature_frame`. Fitur GEE memakai lag 5 hari, dan hari yang GEE-nya belum tersedia diisi klimatologi data latih. Kalau jendela input belum lengkap karena observasi jarang (Cianjur 2026), isi maju diperpanjang sampai 70 hari dan prakiraannya ditandai `is_simulation`.
4. **Prakiraan** (`model.py`): LSTM final per kabupaten (`artifacts/lstm_*.keras` + `lstm_*.json`) menghasilkan Δ harga h+1..h+7. Harga hari asal disimpan sebagai horizon 0.
5. **Simpan** ke `price_forecasts`, lalu dibaca `GET /api/prices` untuk halaman Prediksi Harga di web.

Uji paritas: untuk tanggal asal 23 Nov 2026, pipeline ini menghasilkan prakiraan Garut 6.928, 6.926, 6.916, 6.916, 6.908, 6.907, 6.904. Angka ini sama persis dengan notebook `03_modeling_garut.ipynb`.

## Pemasangan (sekali)

1. **Migrasi**: jalankan `db/migrations/004_price_forecast.sql` di Supabase (SQL Editor). Migrasi ini hanya menambah tabel baru dan tidak mengubah `price_predictions` milik chatbot.
2. **Isi data awal** dari komputer lokal (butuh `DATABASE_URL`):
   ```bash
   pip install -r forecast_pipeline/requirements.txt
   python -m forecast_pipeline.seed --prices seed_harga_asli.csv --gee seed_gee.csv
   ```
   `seed_harga_asli.csv` berisi harga asli Garut dan Cianjur yang sudah dibersihkan, dan `seed_gee.csv` berisi fitur GEE pelatihan sejak 2023. Keduanya dihasilkan dari folder modeling dan tidak di-commit ke repo publik.
3. **GitHub Secrets** (Settings > Secrets and variables > Actions):
   * `DATABASE_URL`: sama dengan backend.
   * `GEE_SERVICE_ACCOUNT_KEY`: isi file JSON key akun layanan Google Cloud yang sudah didaftarkan untuk Earth Engine (peran *Earth Engine Resource Viewer* + *Service Usage Consumer* pada proyeknya).
   * Opsional, repository variable `GEE_PROJECT`. Kalau kosong, dipakai `project_id` dari key.
4. **Jalankan manual sekali** dari tab Actions dengan `backfill = 30`, supaya grafik 30 hari di web langsung terisi.

## Menjalankan lokal

```bash
export DATABASE_URL=...            # dan GEE_SERVICE_ACCOUNT_KEY bila tanpa --skip-gee
python -m forecast_pipeline.run --skip-gee --dry-run   # cek tanpa menulis
python -m forecast_pipeline.run --date 2026-11-23 --backfill 7
```

## Batasan

* **Harga input belum asli.** Harga asli Garut berhenti 31 Des 2025, dan Cianjur hanya punya observasi jarang. Selama itu prakiraan ditandai simulasi di web. Untuk harga sungguhan, isi tabel `price_observations` dengan `source = 'asli'` (lewat admin, n8n, atau skrip) dan pipeline otomatis memakainya.
* **Model tidak dilatih ulang.** Bobot LSTM dilatih sampai END_DATE (Garut 2025-12-31, Cianjur 2025-03-01). Pelatihan ulang dilakukan di notebook modeling, lalu artefak di `artifacts/` diganti.
* **Latensi GEE.** CHIRPS dan ERA5-Land tertinggal beberapa hari, sedangkan MODIS dan Sentinel-1 berupa komposit. Hari yang belum tersedia diisi klimatologi (`gee_filled = true`).
