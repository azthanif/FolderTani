# Temu Tani — Dashboard Petani & Tengkulak (FastAPI)

Prototipe Temu Tani dengan arsitektur **frontend HTML/CSS/JS + backend FastAPI (JSON API)**.
Tampilan dan alur sama dengan versi statis sebelumnya. Bedanya, data dan aturan bisnis
(stok, penawaran, negosiasi, transaksi, prediksi harga, berita) sekarang ada di server.
Semua angka tetap **data simulasi**.

## Struktur

```
temutani/
├── backend/
│   ├── main.py        # FastAPI: endpoint /api/* + menyajikan frontend
│   ├── store.py       # penyimpanan JSON atomik (pengganti localStorage)
│   ├── seed.py        # data awal simulasi (petani, tengkulak, admin)
│   ├── pricing.py     # simulasi keluaran model harga AI
│   ├── news.py        # pembaca berita.csv + ner_results
│   └── data/
│       ├── berita.csv
│       └── runtime/   # dibuat otomatis: role_demo.json, chatbot_state.json
├── public/            # frontend: HTML/CSS asli + app.js yang memanggil API (CDN di Vercel)
│   ├── index.html, app.js, assets/
│   ├── dashboard/     # admin, petani, tengkulak, harga (iframe), berita (iframe)
│   └── Chatbot/chatbot.html
├── tests/test_api.py
├── requirements.txt
├── api/index.py       # entrypoint Vercel Function → backend.main:app
├── vercel.json        # konfigurasi deploy Vercel
└── start_app.bat / start_app.sh
```

## Menjalankan

**Windows:** klik dua kali `start_app.bat` (membuat `.venv`, memasang dependensi, membuka browser).

**macOS/Linux:** `./start_app.sh`

**Manual:**
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```
Buka `http://localhost:8000`. Dokumentasi API interaktif: `http://localhost:8000/docs`.

> Halaman **tidak bisa** lagi dibuka langsung lewat `file://`, karena data diambil dari API.

## Deploy ke Vercel

Hubungkan repo ke Vercel. Root Directory = folder yang berisi `vercel.json`. Framework Preset tidak perlu diubah karena sudah dikunci oleh `vercel.json` (`"framework": null`).

- `public/` disajikan langsung oleh CDN Vercel.
- `api/index.py` adalah Vercel Function yang membungkus FastAPI (`backend/main.py`); `vercel.json` me-rewrite semua `/api/*` ke function ini.
- Di Vercel, data disimpan di `/tmp/temutani` (filesystem lain read-only).
- Cek setelah deploy: `https://<domain>/api/health` harus mengembalikan `{"status":"ok"}`.

> **Batasan Vercel:** `/tmp` bersifat sementara dan tidak dibagi antar-instance. Data simulasi bisa kembali ke kondisi awal setelah function idle, dan dua pengguna bisa sesekali melihat data berbeda. Untuk demo yang stabil, pindahkan penyimpanan ke database (mis. Supabase/Postgres).

## Berita otomatis (news_pipeline)

Halaman **Berita & Analisis** dan digest WhatsApp harian diisi oleh `news_pipeline/` (Media Cloud → teks → NER BERT →
wilayah Garut/Cianjur/Nasional → ringkasan → digest → WAHA). Pipeline dijalankan terjadwal di server/PC terpisah, bukan di
Vercel. Panduan lengkap: [`news_pipeline/README.md`](news_pipeline/README.md).

| Variabel (backend) | Fungsi |
| --- | --- |
| `TEMUTANI_NEWS_CSV` | Path CSV berita, mis. `backend/data/berita_pipeline.csv` (default: `berita.csv` contoh) |
| `TEMUTANI_NEWS_SOURCE=supabase` | Baca tabel `news_articles` (butuh `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |

`GET /api/berita?from=&to=&wilayah=Garut` — respons kini juga memuat `ringkasan`, `wilayah`, `url`, dan offset entitas
(`start`, `end`, `field`) untuk sorotan NER yang akurat. Format `berita.csv` lama tetap didukung.

## Endpoint utama

| Method | Endpoint | Peran | Fungsi |
| --- | --- | --- | --- |
| GET | `/api/state` | petani, tengkulak | Snapshot data sesuai peran |
| GET | `/api/state/version` | semua | Versi data (dipakai sinkronisasi antar-tab) |
| POST | `/api/stocks` · PUT `/api/stocks/{id}` | petani | Tambah / ubah stok |
| POST | `/api/requests` | tengkulak | Buat permintaan gabah |
| POST | `/api/offers` | tengkulak | Ajukan harga pertama |
| POST | `/api/offers/{id}/accept` · `/reject` | petani | Terima / tolak |
| POST | `/api/offers/{id}/counter` | petani, tengkulak | Harga balik / tawar lagi |
| POST | `/api/offers/{id}/accept-counter` | tengkulak | Setujui harga balik |
| POST | `/api/transactions/{id}/mark-paid` | tengkulak | Klaim sudah transfer |
| POST | `/api/transactions/{id}/verify` | petani | Konfirmasi dana diterima |
| POST | `/api/demo/reset` | petani, tengkulak | Reset data simulasi |
| GET | `/api/prices` | petani, admin | Prediksi harga AI (petani dikunci ke kabupatennya) |
| GET | `/api/berita?from=&to=&wilayah=` | semua | Berita + hasil NER + ringkasan |
| GET | `/api/admin/dashboard` | admin | Data dashboard admin |
| GET/PUT/DELETE | `/api/chatbot/state` | semua | State simulasi chatbot |

Peran dikirim lewat header `X-Demo-Role` (`petani` / `tengkulak` / `admin`) dan `X-Demo-User`.

## Aturan yang kini ditegakkan di server

- Referensi harga AI (`aiRef`, `/api/prices`) **tidak pernah dikirim** ke tengkulak.
- Petani hanya menerima stok, penawaran, dan transaksi miliknya; petani lain mendapat 404.
- Kesepakatan dan alokasi stok berjalan dalam satu transaksi berkunci, sehingga tidak ada overselling.
- Volume stok tidak bisa diturunkan di bawah volume yang sudah disepakati; jenis gabah terkunci setelah ada kesepakatan.
- Transisi status (Menunggu Petani → Penawaran Balik → Disepakati, Belum Dibayar → Menunggu Verifikasi → Sudah Dibayar) divalidasi server (409 bila status sudah berubah).

## Alur uji fitur

Sama seperti sebelumnya. Buka dashboard Petani dan Tengkulak di dua tab atau dua perangkat yang mengakses server yang sama. Perubahan di satu tab muncul di tab lain dalam ±4 detik, tanpa reload.

## Tes

```bash
pip install -r requirements-dev.txt
pytest -q
```

## Batasan sebelum produksi

- `X-Demo-Role`/`X-Demo-User` **bukan autentikasi**. Ganti dengan login/OTP WhatsApp berumur pendek + token (mis. JWT) dan cek hak akses dari token.
- Penyimpanan JSON hanya aman untuk satu proses. Untuk banyak worker gunakan database (PostgreSQL/Supabase) dengan transaksi SQL.
- Dashboard admin masih memakai data contoh tersendiri, belum dihitung dari data peran.
- Chatbot masih simulasi mandiri (model datanya terpisah dari dashboard); kini state-nya hanya disimpan di server.
- Harga dan HPP Rp6.500/kg adalah contoh dari proposal dan **harus diverifikasi** terhadap kebijakan yang berlaku saat go-live.
- Status pembayaran adalah pencatatan, bukan verifikasi bank atau payment gateway.
