# Temu Tani — Dashboard Petani dan Tengkulak

Prototipe frontend interaktif yang **mengadaptasi desain web admin unggahan pengguna** (warna, sidebar, tipografi, kartu KPI, tabel, modal, logo, dan navigasi). Data transaksi dan referensi harga yang digunakan adalah **simulasi**, bukan data pasar, prediksi model, atau konfirmasi pembayaran sesungguhnya.

## Isi folder

- `index.html` — pintu masuk untuk memilih peran demo.
- `petani.html` — Dashboard Petani (contoh: Pak Asep Hidayat, Kabupaten Garut).
- `tengkulak.html` — Dashboard Tengkulak (contoh: pembeli WhatsApp guest).
- `assets/styles.css` — styling yang mengacu pada CSS web admin + penyesuaian dua peran.
- `assets/app.js` — data simulasi, state, tabel, filter, aksi stok, penawaran, dan transaksi.
- `assets/logo-maxxi.png`, `assets/logo-wa.jpg` — logo yang disertakan dari file admin pengguna.
- `referensi_admin/` — salinan web admin asli untuk perbandingan desain, **belum tersinkron** dengan dua halaman baru.
- `Chatbot/` — simulasi chatbot WhatsApp Temu Tani (`chatbot.html`) beserta aset.

## Cara membuka

**Pilihan cepat:** buka `index.html` dengan Chrome atau Edge. Semua menu dan modal dapat dicoba. Namun, pada sebagian browser perubahan data antarfile HTML yang dibuka lewat `file://` mungkin tidak otomatis tersinkron.

**Disarankan untuk mencoba alur dua peran yang tersambung:** jalankan server lokal pada folder ini:

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000` di browser. Pada Windows, bisa mencoba `Mulai_Dashboard_Windows.bat` bila Python sudah terpasang.

Buka dashboard Petani dan Tengkulak melalui **browser/profil yang sama** pada domain dan port yang sama. Keduanya berbagi data melalui `localStorage`; perubahan tersimpan di browser dan dapat terlihat di tab lain. Klik ikon notifikasi → **Reset data simulasi** untuk mengembalikan contoh awal.

## Alur uji fitur

1. Pada halaman Tengkulak, klik **Buat Permintaan** → masukkan tonase, jenis GKP/GKG, kabupaten, dan tanggal kebutuhan.
2. Pada **Stok Gabah** Tengkulak, pilih stok yang sesuai → **Ajukan Harga**. **Tidak ada harga indikatif petani atau referensi harga AI yang diperlihatkan kepada tengkulak.** Tengkulak menentukan penawaran pertama.
3. Buka dashboard Petani di browser yang sama. Pada **Penawaran & Negosiasi**, pilih penawaran untuk Pak Asep dan lihat **harga wajar AI**, hanya sebagai referensi bagi petani. Tekan **Terima**, **Tolak**, atau **Ajukan Harga Balik**.
4. Pada dashboard Tengkulak, tanggapi harga balik dengan **Setujui** atau **Tawar Lagi**. Jika sepakat, transaksi dibuat dengan status **Belum Dibayar** dan stok dialokasikan.
5. Pada halaman Transaksi Tengkulak, pilih transaksi → **Saya Sudah Transfer**. Status menjadi **Menunggu Verifikasi** (ini hanyalah klaim, tidak memindahkan dana).
6. Pada halaman Transaksi Petani, klik **Konfirmasi Dana Diterima** hanya setelah dana benar-benar diterima. Status menjadi **Sudah Dibayar**.
7. Petani dapat menambah stok atau mengubah data listing, namun tidak boleh mengurangi volume total di bawah volume yang telah disepakati dan dialokasikan.

## Menu dan cakupan peran

| Petani | Tengkulak |
| --- | --- |
| Overview — hanya petani yang dipilih & Kab. Garut | Overview — hanya permintaan & penawaran pembeli yang dipilih |
| Stok Gabah — tambah/edit stok milik sendiri | Stok Gabah — daftar gabah lintas wilayah + filter |
| Penawaran & Negosiasi — respons & harga balik | Penawaran & Negosiasi — tawaran pertama, terima harga balik, tawar ulang |
| Prediksi Harga AI — referensi khusus Garut | Tidak ditampilkan |
| Transaksi Disepakati — konfirmasi dana diterima | Transaksi Disepakati — laporan transfer & status |

**Catatan penting:** pada akun petani, penawaran yang bisa ditanggapi adalah penawaran yang benar-benar ditujukan ke listing stok petani tersebut (bukan penawaran privat petani lain dalam satu kabupaten). Kabupaten tetap dipakai sebagai kriteria pencocokan permintaan.

## Batasan prototipe / sebelum diproduksi

- Tidak memakai login, session, autentikasi, hak akses, database server, WhatsApp API, payment gateway, atau model AI sungguhan.
- `localStorage` **bukan solusi keamanan**. Peran petani/pembeli yang ditampilkan adalah akun contoh; pembatasan data pada frontend bukan pengganti otorisasi backend.
- Integrasikan identitas petani ke database Maxxi Tani dengan izin yang tepat, serta gunakan tautan masuk terverifikasi via WhatsApp (misalnya token/OTP berumur pendek) untuk pembeli tanpa registrasi. Akses penawaran/transaksi tetap harus dicek di backend.
- Pada produksi, kalkulasi stok/penawaran/transaksi dan transaksi database harus atomik agar tidak ada overselling atau duplikasi kesepakatan.
- Jangan mengekspos prediksi AI privat untuk petani kepada pembeli melalui API. Pembatasan harus diterapkan di server, bukan hanya menyembunyikan elemen HTML.
- Tanggal dan harga pada halaman AI hanya simulasi. Angka contoh HPP Rp6.500/kg berasal dari proposal dan **harus diverifikasi menurut kebijakan yang berlaku** saat go-live.
- Berkas admin asli dipertahankan sebagai pembanding dan **tidak otomatis mengambil data dari localStorage prototipe baru**.
