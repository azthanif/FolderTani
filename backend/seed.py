"""Data awal simulasi Temu Tani.

Dipindahkan apa adanya dari app.js (initData() untuk dashboard petani/tengkulak
dan array statis milik initAdmin()). Semua angka adalah DATA SIMULASI.
"""
from __future__ import annotations

from .auth import hash_password

# Versi skema data. Naikkan bila bentuk data berubah agar file runtime lama di-reset otomatis.
# v2: satuan volume kg (sebelumnya ton), jenis gabah hanya GKP, akun pengguna (login/daftar).
# v3: nama pembeli = nama orang, fitur permintaan & status pembayaran dihapus, riwayat perubahan stok.
SCHEMA_VERSION = 3

# Akun demo untuk mencoba login (SIMULASI). Password sama untuk keduanya.
DEMO_PASSWORD = "temutani123"
DEMO_ACCOUNTS = (
    ("F-001", "petani", "081200000001"),
    ("GUEST-001", "tengkulak", "081200000002"),
)


def role_demo_data() -> dict:
    """Data bersama dashboard Petani & Tengkulak (dulu: initData() di localStorage)."""
    return {
        "schema": SCHEMA_VERSION,
        # Akun login. TIDAK pernah dikirim ke klien (snapshot() hanya memilih kunci tertentu).
        "users": [
            {"id": uid, "role": role, "phone": phone, "passwordHash": hash_password(DEMO_PASSWORD), "created": "2026-11-01T08:00:00+07:00"}
            for uid, role, phone in DEMO_ACCOUNTS
        ],
        "farmers": [
            {"id": "F-001", "name": "Pak Asep Hidayat", "region": "Garut", "village": "Tarogong Kidul", "maxxiId": "MX-001"},
            {"id": "F-002", "name": "Pak Dedi Suhendra", "region": "Garut", "village": "Cisurupan", "maxxiId": "MX-002"},
            {"id": "F-003", "name": "Bu Siti Aminah", "region": "Sukabumi", "village": "Cisaat", "maxxiId": "MX-003"},
            {"id": "F-004", "name": "Bu Ratna Mulyani", "region": "Sukabumi", "village": "Cicurug", "maxxiId": "MX-004"},
            {"id": "F-005", "name": "Pak Jajang Kurnia", "region": "Garut", "village": "Leles", "maxxiId": "MX-005"},
            {"id": "F-006", "name": "Bu Nia Kartika", "region": "Sukabumi", "village": "Sukaraja", "maxxiId": "MX-006"},
        ],
        "buyers": [
            {"id": "GUEST-001", "label": "Pak Budi Santoso"},
            {"id": "GUEST-002", "label": "Pak Hendra Wijaya"},
        ],
        "stocks": [
            {"id": "STK-001", "farmerId": "F-001", "region": "Garut", "type": "GKP", "volume": 5000, "harvest": "2026-11-09", "status": "Tersedia", "moisture": 24},
            {"id": "STK-002", "farmerId": "F-003", "region": "Sukabumi", "type": "GKP", "volume": 8500, "harvest": "2026-11-10", "status": "Tersedia", "moisture": 23},
            {"id": "STK-003", "farmerId": "F-002", "region": "Garut", "type": "GKP", "volume": 3200, "harvest": "2026-11-08", "status": "Tersedia", "moisture": 25},
            {"id": "STK-004", "farmerId": "F-004", "region": "Sukabumi", "type": "GKP", "volume": 6000, "harvest": "2026-11-12", "status": "Tersedia", "moisture": 23},
            {"id": "STK-005", "farmerId": "F-005", "region": "Garut", "type": "GKP", "volume": 4800, "harvest": "2026-11-11", "status": "Tersedia", "moisture": 24},
            {"id": "STK-006", "farmerId": "F-006", "region": "Sukabumi", "type": "GKP", "volume": 7500, "harvest": "2026-11-12", "status": "Tersedia", "moisture": 24},
            {"id": "STK-007", "farmerId": "F-001", "region": "Garut", "type": "GKP", "volume": 2200, "harvest": "2026-11-04", "status": "Tersedia", "moisture": 24},
            {"id": "STK-008", "farmerId": "F-001", "region": "Garut", "type": "GKP", "volume": 1800, "harvest": "2026-11-05", "status": "Tersedia", "moisture": 24},
        ],
        # Riwayat perubahan total stok fisik per petani (terbaru di akhir).
        "stockLog": [
            {"id": "LOG-001", "farmerId": "F-001", "at": "2026-11-04T07:30:00+07:00", "activity": "Tambah panen", "delta": 2200, "total": 2200},
            {"id": "LOG-002", "farmerId": "F-001", "at": "2026-11-05T07:15:00+07:00", "activity": "Tambah panen", "delta": 2300, "total": 4500},
            {"id": "LOG-003", "farmerId": "F-001", "at": "2026-11-07T16:00:00+07:00", "activity": "Update stok", "delta": -500, "total": 4000},
            {"id": "LOG-004", "farmerId": "F-001", "at": "2026-11-09T08:00:00+07:00", "activity": "Tambah panen", "delta": 5000, "total": 9000},
        ],
        "offers": [
            {"id": "OFF-001", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-001", "volume": 3000, "initialBid": 6800, "currentBid": 6800, "counter": None, "aiRef": 7100, "status": "Menunggu Petani", "created": "2026-11-06T09:10:00+07:00",
             "history": [{"at": "2026-11-06T09:10:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 6800}]},
            {"id": "OFF-002", "buyerId": "GUEST-001", "farmerId": "F-002", "stockId": "STK-003", "volume": 3000, "initialBid": 6750, "currentBid": 6750, "counter": 7000, "aiRef": 7100, "status": "Penawaran Balik", "created": "2026-11-06T09:15:00+07:00",
             "history": [{"at": "2026-11-06T09:15:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 6750},
                         {"at": "2026-11-06T09:20:00+07:00", "actor": "Petani", "label": "Petani mengajukan harga balik", "price": 7000}]},
            {"id": "OFF-003", "buyerId": "GUEST-002", "farmerId": "F-001", "stockId": "STK-001", "volume": 2000, "initialBid": 6700, "currentBid": 6700, "counter": None, "aiRef": 7100, "status": "Ditolak", "created": "2026-11-04T13:05:00+07:00",
             "history": [{"at": "2026-11-04T13:05:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 6700},
                         {"at": "2026-11-04T13:15:00+07:00", "actor": "Petani", "label": "Penawaran ditolak", "price": None}]},
            {"id": "OFF-004", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-008", "volume": 1000, "initialBid": 7100, "currentBid": 7100, "counter": 7200, "aiRef": 7100, "status": "Disepakati", "created": "2026-11-05T09:20:00+07:00", "agreedPrice": 7200,
             "history": [{"at": "2026-11-05T09:20:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 7100},
                         {"at": "2026-11-05T09:30:00+07:00", "actor": "Petani", "label": "Harga balik diajukan", "price": 7200},
                         {"at": "2026-11-05T09:40:00+07:00", "actor": "Pembeli", "label": "Harga balik disetujui", "price": 7200}]},
            {"id": "OFF-005", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-007", "volume": 1200, "initialBid": 7000, "currentBid": 7000, "counter": None, "aiRef": 7100, "status": "Disepakati", "agreedPrice": 7000, "created": "2026-11-04T10:10:00+07:00",
             "history": [{"at": "2026-11-04T10:10:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 7000},
                         {"at": "2026-11-04T11:00:00+07:00", "actor": "Petani", "label": "Penawaran disetujui", "price": 7000}]},
        ],
        "transactions": [
            {"id": "TRX-001", "offerId": "OFF-004", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-008", "volume": 1000, "price": 7200, "date": "2026-11-05"},
            {"id": "TRX-002", "offerId": "OFF-005", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-007", "volume": 1200, "price": 7000, "date": "2026-11-04"},
        ],
        "activities": [
            {"id": "EVT-001", "at": "2026-11-06T09:10:00+07:00", "title": "Penawaran masuk untuk Pak Asep", "note": "OFF-001 • 3.000 kg GKP • Garut"},
            {"id": "EVT-002", "at": "2026-11-06T09:20:00+07:00", "title": "Harga balik dari Pak Dedi", "note": "OFF-002 • Rp7.000/kg"},
            {"id": "EVT-003", "at": "2026-11-05T09:40:00+07:00", "title": "Kesepakatan GKP tercatat", "note": "TRX-001 • 1.000 kg • Rp7.200/kg"},
            {"id": "EVT-004", "at": "2026-11-05T11:00:00+07:00", "title": "Kesepakatan GKP tercatat", "note": "TRX-002 • 1.200 kg • Rp7.000/kg"},
        ],
    }


def admin_data() -> dict:
    """Data dashboard admin (dulu: array statis di initAdmin()). Belum tersinkron dengan data peran."""
    def hist(*rows):
        return [list(r) for r in rows]

    return {
        "stocks": [
            {"id": "STK-001", "farmer": "Pak Asep Hidayat", "location": "Garut", "type": "GKP", "volume": 5000, "harvest": "04 Nov 2026", "status": "Tersedia", "offers": 3},
            {"id": "STK-002", "farmer": "Bu Siti Aminah", "location": "Sukabumi", "type": "GKP", "volume": 8500, "harvest": "07 Nov 2026", "status": "Dalam Negosiasi", "offers": 2},
            {"id": "STK-003", "farmer": "Pak Dedi Suhendra", "location": "Garut", "type": "GKP", "volume": 3200, "harvest": "01 Nov 2026", "status": "Tersedia", "offers": 1},
            {"id": "STK-004", "farmer": "Bu Ratna Mulyani", "location": "Sukabumi", "type": "GKP", "volume": 6000, "harvest": "12 Nov 2026", "status": "Tersedia", "offers": 0},
            {"id": "STK-005", "farmer": "Pak Jajang Kurnia", "location": "Garut", "type": "GKP", "volume": 4800, "harvest": "27 Okt 2026", "status": "Terjual", "offers": 4},
            {"id": "STK-006", "farmer": "Bu Nia Kartika", "location": "Sukabumi", "type": "GKP", "volume": 7500, "harvest": "08 Nov 2026", "status": "Dalam Negosiasi", "offers": 2},
            {"id": "STK-007", "farmer": "Pak Agus Setiawan", "location": "Garut", "type": "GKP", "volume": 2500, "harvest": "11 Nov 2026", "status": "Tersedia", "offers": 1},
            {"id": "STK-008", "farmer": "Bu Lina Fitriani", "location": "Sukabumi", "type": "GKP", "volume": 9000, "harvest": "09 Nov 2026", "status": "Tersedia", "offers": 0},
        ],
        "offers": [
            {"id": "OFF-208", "buyer": "Pak Budi Santoso", "location": "Garut", "farmer": "Pak Asep Hidayat", "stock": "STK-001", "volume": 5000, "price": 6925, "ai": 7100, "status": "Menunggu", "date": "31 Okt 2026", "time": "10:42",
             "history": hist(("Penawaran dikirim", "31 Okt 2026 · 10:42", "Rp6.925/kg"), ("Diteruskan ke petani", "31 Okt 2026 · 10:43", "Harga wajar Rp7.100/kg"))},
            {"id": "OFF-207", "buyer": "Bu Lilis Suryani", "location": "Sukabumi", "farmer": "Bu Siti Aminah", "stock": "STK-002", "volume": 8500, "price": 6950, "ai": 7040, "status": "Penawaran Balik", "date": "31 Okt 2026", "time": "10:15", "counter": 7100,
             "history": hist(("Penawaran dikirim", "31 Okt 2026 · 10:15", "Rp6.950/kg"), ("Petani ajukan penawaran balik", "31 Okt 2026 · 10:21", "Rp7.100/kg"))},
            {"id": "OFF-206", "buyer": "Pak Hendra Wijaya", "location": "Garut", "farmer": "Pak Dedi Suhendra", "stock": "STK-003", "volume": 3200, "price": 7050, "ai": 7100, "status": "Disetujui", "date": "30 Okt 2026", "time": "15:32",
             "history": hist(("Penawaran dikirim", "30 Okt 2026 · 15:32", "Rp7.050/kg"), ("Petani menyetujui", "30 Okt 2026 · 16:04", "Kesepakatan Rp7.050/kg"))},
            {"id": "OFF-205", "buyer": "Pak Agus Setiawan", "location": "Sukabumi", "farmer": "Bu Nia Kartika", "stock": "STK-006", "volume": 7500, "price": 6725, "ai": 7040, "status": "Menunggu", "date": "30 Okt 2026", "time": "13:18",
             "history": hist(("Penawaran dikirim", "30 Okt 2026 · 13:18", "Rp6.725/kg"), ("Diteruskan ke petani", "30 Okt 2026 · 13:19", "Harga wajar Rp7.040/kg"))},
            {"id": "OFF-204", "buyer": "Pak Rudi Hartono", "location": "Garut", "farmer": "Pak Asep Hidayat", "stock": "STK-001", "volume": 4000, "price": 6700, "ai": 7100, "status": "Ditolak", "date": "29 Okt 2026", "time": "11:25",
             "history": hist(("Penawaran dikirim", "29 Okt 2026 · 11:25", "Rp6.700/kg"), ("Petani menolak", "29 Okt 2026 · 11:41", "Penawaran ditolak"))},
            {"id": "OFF-203", "buyer": "Pak Yayan Ruhiyat", "location": "Garut", "farmer": "Pak Jajang Kurnia", "stock": "STK-005", "volume": 4800, "price": 7350, "ai": 7300, "status": "Disetujui", "date": "28 Okt 2026", "time": "09:48",
             "history": hist(("Penawaran dikirim", "28 Okt 2026 · 09:48", "Rp7.350/kg"), ("Petani menyetujui", "28 Okt 2026 · 10:05", "Kesepakatan Rp7.350/kg"))},
            {"id": "OFF-202", "buyer": "Bu Euis Komariah", "location": "Sukabumi", "farmer": "Bu Siti Aminah", "stock": "STK-002", "volume": 6000, "price": 6800, "ai": 7040, "status": "Penawaran Balik", "date": "28 Okt 2026", "time": "08:12", "counter": 7000,
             "history": hist(("Penawaran dikirim", "28 Okt 2026 · 08:12", "Rp6.800/kg"), ("Petani ajukan penawaran balik", "28 Okt 2026 · 08:33", "Rp7.000/kg"))},
        ],
        "transactions": [
            {"id": "TRX-104", "farmer": "Pak Dedi Suhendra", "buyer": "Pak Hendra Wijaya", "location": "Garut", "stock": "STK-003", "volume": 3200, "price": 7050, "date": "30 Okt 2026", "status": "Disepakati"},
            {"id": "TRX-103", "farmer": "Pak Jajang Kurnia", "buyer": "Pak Yayan Ruhiyat", "location": "Garut", "stock": "STK-005", "volume": 4800, "price": 7350, "date": "28 Okt 2026", "status": "Selesai"},
            {"id": "TRX-102", "farmer": "Bu Nia Kartika", "buyer": "Pak Dodi Firmansyah", "location": "Sukabumi", "stock": "STK-006", "volume": 4000, "price": 7000, "date": "25 Okt 2026", "status": "Selesai"},
            {"id": "TRX-101", "farmer": "Bu Ratna Mulyani", "buyer": "Pak Iwan Gunawan", "location": "Sukabumi", "stock": "STK-004", "volume": 2000, "price": 6950, "date": "23 Okt 2026", "status": "Disepakati"},
        ],
        "events": [
            {"icon": "handshake", "title": "Pak Budi Santoso mengajukan penawaran", "note": "STK-001 · Garut · Rp6.925/kg", "time": "10:42", "kind": "Penawaran", "status": "Berhasil", "location": "Garut"},
            {"icon": "arrow-left-right", "title": "Bu Siti mengajukan penawaran balik", "note": "OFF-207 · Sukabumi · Rp7.100/kg", "time": "10:21", "kind": "Negosiasi", "status": "Berhasil", "location": "Sukabumi"},
            {"icon": "search", "title": "Pembeli mencari gabah 5.000 kg", "note": "Pencarian stok · Garut", "time": "09:52", "kind": "Pencarian", "status": "Berhasil", "location": "Garut"},
            {"icon": "refresh-cw", "title": "Bu Lina memperbarui stok gabah", "note": "STK-008 · Sukabumi · 9.000 kg", "time": "09:15", "kind": "Stok", "status": "Berhasil", "location": "Sukabumi"},
            {"icon": "message-circle-warning", "title": "Pesan tidak dapat dipahami chatbot", "note": "Permintaan perlu diperjelas · Identitas tersamarkan", "time": "08:47", "kind": "Chatbot", "status": "Perlu Tinjauan", "location": "Garut"},
            {"icon": "package-plus", "title": "Pak Agus mendaftarkan stok baru", "note": "STK-007 · Garut · 2.500 kg", "time": "08:13", "kind": "Stok", "status": "Berhasil", "location": "Garut"},
        ],
    }
