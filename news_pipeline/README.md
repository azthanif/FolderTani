# news_pipeline — Berita harian Temu Tani

Alur harian: Media Cloud → teks penuh → pembersihan → NER → wilayah (Garut/Cianjur/Nasional) → ringkasan → digest → web + WhatsApp.

| # | Modul | Output di `data/runs/<tanggal>/` | Isi |
|---|---|---|---|
| 1 | `geturl_news.py` | `01_urls.csv` | Query Media Cloud per label (atau `--input-csv`) |
| 2 | `gettext_news.py` | `02_raw.jsonl` | Unduh HTML sekali/URL, trafilatura + cadangan newspaper3k, jeda per domain, robots.txt, circuit breaker, Wayback, bisa di-resume |
| 3 | `preprocess_news.py` | `03_clean.jsonl` | `news_cleaner.py` + boilerplate & dedup lintas hari (`data/state/`) |
| 4 | `ner_news.py` | `04_ner.jsonl` | `cahya/bert-base-indonesian-NER` (MIT), logika dari notebook EDA, offset ke teks bersih |
| 5 | `classifier_news.py` | `05_classified.jsonl` | Wilayah + kategori dari entitas NER, gazetteer kecamatan (UU 110/2024 & UU 97/2024), kata inti padi/gabah |
| 6 | `summary_news.py` | `06_summary.jsonl` | idT5 hasil fine-tuning bila ada, selain itu Lead-2; ringkasan dengan entitas karangan diganti Lead |
| 7 | `digest_news.py` | `07_items.jsonl`, `07_digest_<Kab>.txt` | Digest per kabupaten = berita kabupaten + nasional, berita kembar lintas media dibuang |
| 8 | `publish_news.py` | `backend/data/berita_pipeline.csv`, Supabase | Data untuk halaman Berita & Analisis |
| 9 | `notify_news.py` | `08_delivery.jsonl` | WAHA `sendText`, hanya petani se-kabupaten, idempoten, default dry-run |

Setiap langkah dilewati bila outputnya sudah ada. Bila satu langkah gagal, perbaiki lalu jalankan ulang: langkah yang sudah selesai tidak diulang.

## Instalasi

```bash
pip install -r news_pipeline/requirements.txt
cp news_pipeline/config.example.yaml news_pipeline/config.yaml   # sesuaikan
cp news_pipeline/.env.example news_pipeline/.env                 # isi API key
```

Database (Supabase, opsional tapi dibutuhkan untuk WA ke petani terdaftar): jalankan `sql/news_schema.sql` di SQL Editor.
Bila sebelumnya sudah menjalankan skema versi lengkap, jalankan `sql/rollback_news_full.sql` dulu.

## Menjalankan

```bash
# hari ini, semua langkah (WA tetap dry-run sampai notify.enabled: true)
python -m news_pipeline.run_daily --config news_pipeline/config.yaml

# ulang dari langkah tertentu / tanggal tertentu
python -m news_pipeline.run_daily --config news_pipeline/config.yaml --date 2026-11-22 --from-step ner --force

# tanpa API Media Cloud, memakai CSV ekspor yang sudah ada (+ teks yang sudah diekstrak)
python -m news_pipeline.run_daily --config news_pipeline/config.yaml --input-csv MC_cianjur.csv --input-extracted MC_cianjur.csv
```

Jadwal harian (05.00 WIB), pilih salah satu:
- **GitHub Actions (disarankan, tanpa PC menyala):** `.github/workflows/news-daily.yml` memakai `config.ci.yaml` dan menulis
  hasil ke Supabase. Isi GitHub Secrets `MEDIACLOUD_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (Settings → Secrets and variables → Actions), opsional variable `MEDIACLOUD_COLLECTION_IDS`. Uji sekali lewat
  tab Actions → *Berita harian* → *Run workflow*. Catatan: GitHub menonaktifkan jadwal di repo publik yang 60 hari tanpa commit.
- Linux: `crontab -e` → `0 5 * * * /path/FolderTani/news_pipeline/run_daily.sh`
- Windows: Task Scheduler → aksi `news_pipeline\run_daily.bat`

## Menyambungkan ke web

- Lokal/demo: backend otomatis membaca `backend/data/berita_pipeline.csv` bila file itu ada (bisa ditimpa `TEMUTANI_NEWS_CSV`).
- Produksi (Vercel): set `TEMUTANI_NEWS_SOURCE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` di environment server.
- `/api/berita?wilayah=Garut` menyaring per wilayah. Petani Garut/Cianjur otomatis melihat kabupatennya.

## Model ringkasan

Isi `summary.model_path` dengan folder `final/` dari notebook `idT5_IndoSum_Summarization_FineTuning` (berisi
`inference_config.json`). Pakai idT5 hanya bila ROUGE-nya di test set **lebih tinggi dari Lead-3** (baseline di notebook
Anda: ROUGE-L 62,25). Bila tidak, biarkan `method: lead`.

Selama `model_path` kosong, semua ringkasan memakai Lead-2 (`summary_model = lead-2`), bukan idT5. Catatan: angka
ROUGE-L 62,25 di atas adalah Lead-3 tanpa batas kata; konfigurasi default memakai `lead_sentences: 2` dan `max_words: 45`,
jadi bandingkan idT5 dengan konfigurasi yang benar-benar dipakai.

Pengaman halusinasi idT5: ringkasan diganti Lead bila entity precision < `min_entity_precision` atau ada **angka** di
ringkasan yang tidak ada di artikel (`number_precision` < 1). Artikel yang lebih panjang dari `max_input_len` token
dicatat di log karena bagian akhirnya tidak ikut diringkas.

## Batasan yang perlu diketahui

- **Classifier berbasis aturan.** Di uji 532 artikel Garut/Cianjur, berita non-pertanian dan berita daerah lain tersaring,
  tetapi masih ada kasus batas (mis. berita program CSR yang banyak menyebut petani). Validasi dengan ±100 artikel berlabel
  sebelum dipakai luas; ambang ada di `classifier:` pada config.
- **NER tanpa metrik resmi** (model card tidak memuat evaluasi). Presisi per tipe perlu diukur dari `sampel_validasi.csv`.
- **Scraping:** situs berproteksi bot tidak dibobol; patuhi ToS media, terutama untuk penggunaan komersial.
- **WhatsApp:** kirim hanya ke petani yang mendaftar; uji dulu ke nomor sendiri (`recipients_source: csv`).

## Tes

```bash
pytest -q news_pipeline/tests      # 28 tes, tanpa model & jaringan
```
