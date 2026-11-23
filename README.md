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
export DATABASE_URL='postgresql://...'   # wajib (lihat bagian Database)
export TEMUTANI_SECRET='string-acak-panjang'
export TEMUTANI_OTP_DEV=1                   # lokal: kode verifikasi tampil di layar
uvicorn backend.main:app --reload
```
Buka `http://localhost:8000`. Dokumentasi API interaktif: `http://localhost:8000/docs`.

> Halaman **tidak bisa** lagi dibuka langsung lewat `file://`, karena data diambil dari API.

## Database (Supabase)

Backend memakai database Supabase project **TemuTani** yang juga dipakai chatbot WhatsApp (n8n + WAHA). Skema ada di `db/migrations/`:

- `001_baseline_chatbot.sql`: replika tabel chatbot yang **sudah ada** di Supabase. Hanya untuk database lokal/tes, jangan dijalankan ke Supabase.
- `002_web_integration.sql`: tambahan untuk web (sudah diterapkan ke Supabase): role `tengkulak` + kolom `password_hash` di `users`, tabel `stock_batches` (sisa per tanggal panen), `stock_logs` (riwayat stok), `otp_codes` (kode verifikasi WA), trigger sinkronisasi stok, label riwayat di `accept_offer`, dan akun admin `081241831052`.

Perubahan stok dari chatbot (langsung ke `stocks.quantity_kg`) otomatis tercatat di riwayat dan mengurangi batch panen terlama dulu (FIFO).

## Deploy ke Vercel

Hubungkan repo ke Vercel. Root Directory = folder yang berisi `vercel.json`. Framework Preset tidak perlu diubah karena sudah dikunci oleh `vercel.json` (`"framework": null`).

- `api/index.py` adalah Vercel Function yang membungkus FastAPI (`backend/main.py`); `vercel.json` me-rewrite semua `/api/*` ke function ini.
- Cek setelah deploy: `https://<domain>/api/health` harus mengembalikan `"database": "ok"` dan `"whatsapp": "configured"`.

Environment variables project backend (Settings → Environment Variables). **Jangan commit nilai aslinya ke repo.**

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | Supabase → Connect → *Transaction pooler* (port 6543). Format `postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres` (tanpa tanda kurung siku). |
| `TEMUTANI_SECRET` | String acak panjang untuk menandatangani token & kode verifikasi. |
| `WAHA_URL` | Alamat server WAHA, mis. `https://waha.domain.id` (backend memanggil `POST {WAHA_URL}/api/sendText`). |
| `WAHA_API_KEY` | Nilai header `X-Api-Key` WAHA. |
| `WAHA_SESSION` | Nama sesi WAHA yang terhubung ke nomor WhatsApp Temu Tani. |
| `TEMUTANI_OTP_DEV` | Hanya untuk lokal: `1` = kode verifikasi ditampilkan di layar bila WAHA belum di-set. Jangan di-set di produksi. |

## Akun (Masuk / Daftar)

- `/daftar` (petani: peran, nama, nomor HP, password, kabupaten Garut/Cianjur, kecamatan; tengkulak: peran, nama, nomor HP, password), `/masuk`, `/lupa-password`, dan halaman **Profil Saya** (`/petani/profil`, `/tengkulak/profil`, `/admin/profil`).
- Lupa password & ubah password memakai kode 6 digit yang dikirim via WhatsApp (WAHA): berlaku 5 menit, jeda kirim ulang 60 detik, maks. 5 kode/jam, terkunci setelah 5 kali salah. Ganti password = semua sesi lama keluar.
- Nomor yang terdaftar lewat chatbot WA (belum punya password) membuat password lewat **Lupa Password**.
- Admin: `081241831052`. Akun dibuat tanpa password; buat lewat Lupa Password (setelah WAHA aktif) atau `DATABASE_URL=... python -m backend.set_password 081241831052`.
- Password di-hash PBKDF2-SHA256; token ditandatangani HMAC (`TEMUTANI_SECRET`).
- Satuan volume: **kg**. Jenis gabah: **GKP**. Wilayah: **Garut** dan **Cianjur**.
- Volume yang disepakati langsung mengurangi stok petani dan tercatat di riwayat. Sisa stok per tanggal panen diperbarui lewat `PUT /api/stocks/remaining`.

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
| GET | `/api/berita?from=&to=` | semua | Berita + hasil NER |
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

Tes berjalan pada PostgreSQL lokal sementara dengan skema yang sama persis (butuh binary PostgreSQL; atur `PG_BIN` bila tidak terdeteksi):

```bash
pip install -r requirements-dev.txt
pytest -q
```

## Batasan sebelum produksi

- Notifikasi WhatsApp ke petani untuk penawaran yang dibuat dari web belum ada (chatbot hanya bereaksi pada pesan WA).
- Nomor HP tidak bisa diubah sendiri oleh pengguna (dipakai untuk login & verifikasi).
- Grafik harga 30 hari masih simulasi; angka harga terkini diambil dari tabel `price_predictions`.
- Halaman `/chatbot` di web masih simulasi mandiri, bukan percakapan WhatsApp asli.
- HPP Rp6.500/kg adalah contoh dari proposal dan **harus diverifikasi** terhadap kebijakan yang berlaku.
