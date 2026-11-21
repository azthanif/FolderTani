"""Data awal simulasi Temu Tani.

Dipindahkan apa adanya dari app.js (initData() untuk dashboard petani/tengkulak
dan array statis milik initAdmin()). Semua angka adalah DATA SIMULASI.
"""
from __future__ import annotations


def role_demo_data() -> dict:
    """Data bersama dashboard Petani & Tengkulak (dulu: initData() di localStorage)."""
    return {
        "farmers": [
            {"id": "F-001", "name": "Pak Asep Hidayat", "region": "Garut", "village": "Tarogong Kidul", "maxxiId": "MX-001"},
            {"id": "F-002", "name": "Pak Dedi Suhendra", "region": "Garut", "village": "Cisurupan", "maxxiId": "MX-002"},
            {"id": "F-003", "name": "Bu Siti Aminah", "region": "Sukabumi", "village": "Cisaat", "maxxiId": "MX-003"},
            {"id": "F-004", "name": "Bu Ratna Mulyani", "region": "Sukabumi", "village": "Cicurug", "maxxiId": "MX-004"},
            {"id": "F-005", "name": "Pak Jajang Kurnia", "region": "Garut", "village": "Leles", "maxxiId": "MX-005"},
            {"id": "F-006", "name": "Bu Nia Kartika", "region": "Sukabumi", "village": "Sukaraja", "maxxiId": "MX-006"},
        ],
        "buyers": [
            {"id": "GUEST-001", "label": "Pembeli 08••91"},
            {"id": "GUEST-002", "label": "Pembeli 06••27"},
        ],
        "stocks": [
            {"id": "STK-001", "farmerId": "F-001", "region": "Garut", "type": "GKP", "volume": 5, "harvest": "2026-11-09", "status": "Tersedia", "moisture": 24},
            {"id": "STK-002", "farmerId": "F-003", "region": "Sukabumi", "type": "GKP", "volume": 8.5, "harvest": "2026-11-10", "status": "Tersedia", "moisture": 23},
            {"id": "STK-003", "farmerId": "F-002", "region": "Garut", "type": "GKP", "volume": 3.2, "harvest": "2026-11-08", "status": "Tersedia", "moisture": 25},
            {"id": "STK-004", "farmerId": "F-004", "region": "Sukabumi", "type": "GKP", "volume": 6, "harvest": "2026-11-12", "status": "Tersedia", "moisture": 23},
            {"id": "STK-005", "farmerId": "F-005", "region": "Garut", "type": "GKP", "volume": 4.8, "harvest": "2026-11-11", "status": "Tersedia", "moisture": 24},
            {"id": "STK-006", "farmerId": "F-006", "region": "Sukabumi", "type": "GKG", "volume": 7.5, "harvest": "2026-11-12", "status": "Tersedia", "moisture": 14},
            {"id": "STK-007", "farmerId": "F-001", "region": "Garut", "type": "GKP", "volume": 2.2, "harvest": "2026-11-04", "status": "Tersedia", "moisture": 24},
            {"id": "STK-008", "farmerId": "F-001", "region": "Garut", "type": "GKG", "volume": 1.8, "harvest": "2026-11-05", "status": "Tersedia", "moisture": 14},
        ],
        "requests": [
            {"id": "REQ-001", "buyerId": "GUEST-001", "region": "Garut", "type": "GKP", "volume": 8, "needed": "2026-11-14", "created": "2026-11-06T08:10:00+07:00"},
            {"id": "REQ-002", "buyerId": "GUEST-001", "region": "Garut", "type": "GKG", "volume": 1, "needed": "2026-11-12", "created": "2026-11-05T09:15:00+07:00"},
            {"id": "REQ-003", "buyerId": "GUEST-002", "region": "Garut", "type": "GKP", "volume": 3, "needed": "2026-11-15", "created": "2026-11-04T13:00:00+07:00"},
        ],
        "offers": [
            {"id": "OFF-001", "requestId": "REQ-001", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-001", "volume": 3, "initialBid": 6800, "currentBid": 6800, "counter": None, "aiRef": 7100, "status": "Menunggu Petani", "created": "2026-11-06T09:10:00+07:00",
             "history": [{"at": "2026-11-06T09:10:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 6800}]},
            {"id": "OFF-002", "requestId": "REQ-001", "buyerId": "GUEST-001", "farmerId": "F-002", "stockId": "STK-003", "volume": 3, "initialBid": 6750, "currentBid": 6750, "counter": 7000, "aiRef": 7100, "status": "Penawaran Balik", "created": "2026-11-06T09:15:00+07:00",
             "history": [{"at": "2026-11-06T09:15:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 6750},
                         {"at": "2026-11-06T09:20:00+07:00", "actor": "Petani", "label": "Petani mengajukan harga balik", "price": 7000}]},
            {"id": "OFF-003", "requestId": "REQ-003", "buyerId": "GUEST-002", "farmerId": "F-001", "stockId": "STK-001", "volume": 2, "initialBid": 6700, "currentBid": 6700, "counter": None, "aiRef": 7100, "status": "Ditolak", "created": "2026-11-04T13:05:00+07:00",
             "history": [{"at": "2026-11-04T13:05:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 6700},
                         {"at": "2026-11-04T13:15:00+07:00", "actor": "Petani", "label": "Penawaran ditolak", "price": None}]},
            {"id": "OFF-004", "requestId": "REQ-002", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-008", "volume": 1, "initialBid": 7100, "currentBid": 7100, "counter": 7200, "aiRef": 7350, "status": "Disepakati", "created": "2026-11-05T09:20:00+07:00", "agreedPrice": 7200,
             "history": [{"at": "2026-11-05T09:20:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 7100},
                         {"at": "2026-11-05T09:30:00+07:00", "actor": "Petani", "label": "Harga balik diajukan", "price": 7200},
                         {"at": "2026-11-05T09:40:00+07:00", "actor": "Pembeli", "label": "Harga balik disetujui", "price": 7200}]},
            {"id": "OFF-005", "requestId": "REQ-001", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-007", "volume": 1.2, "initialBid": 7000, "currentBid": 7000, "counter": None, "aiRef": 7100, "status": "Disepakati", "agreedPrice": 7000, "created": "2026-11-04T10:10:00+07:00",
             "history": [{"at": "2026-11-04T10:10:00+07:00", "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": 7000},
                         {"at": "2026-11-04T11:00:00+07:00", "actor": "Petani", "label": "Penawaran disetujui", "price": 7000}]},
        ],
        "transactions": [
            {"id": "TRX-001", "offerId": "OFF-004", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-008", "volume": 1, "price": 7200, "date": "2026-11-05", "payment": "Belum Dibayar"},
            {"id": "TRX-002", "offerId": "OFF-005", "buyerId": "GUEST-001", "farmerId": "F-001", "stockId": "STK-007", "volume": 1.2, "price": 7000, "date": "2026-11-04", "payment": "Sudah Dibayar", "paidAt": "2026-11-05T11:00:00+07:00"},
        ],
        "activities": [
            {"id": "EVT-001", "at": "2026-11-06T09:10:00+07:00", "title": "Penawaran masuk untuk Pak Asep", "note": "OFF-001 • 3 ton GKP • Garut"},
            {"id": "EVT-002", "at": "2026-11-06T09:20:00+07:00", "title": "Harga balik dari Pak Dedi", "note": "OFF-002 • Rp7.000/kg"},
            {"id": "EVT-003", "at": "2026-11-05T09:40:00+07:00", "title": "Kesepakatan GKG tercatat", "note": "TRX-001 • Menunggu pembayaran"},
            {"id": "EVT-004", "at": "2026-11-05T11:00:00+07:00", "title": "Pembayaran transaksi dikonfirmasi", "note": "TRX-002 • Sudah dibayar"},
        ],
    }


def admin_data() -> dict:
    """Data dashboard admin (dulu: array statis di initAdmin()). Belum tersinkron dengan data peran."""
    def hist(*rows):
        return [list(r) for r in rows]

    return {
        "stocks": [
            {"id": "STK-001", "farmer": "Pak Asep Hidayat", "location": "Garut", "type": "GKP", "volume": 5.0, "harvest": "04 Nov 2026", "status": "Tersedia", "offers": 3},
            {"id": "STK-002", "farmer": "Bu Siti Aminah", "location": "Sukabumi", "type": "GKP", "volume": 8.5, "harvest": "07 Nov 2026", "status": "Dalam Negosiasi", "offers": 2},
            {"id": "STK-003", "farmer": "Pak Dedi Suhendra", "location": "Garut", "type": "GKP", "volume": 3.2, "harvest": "01 Nov 2026", "status": "Tersedia", "offers": 1},
            {"id": "STK-004", "farmer": "Bu Ratna Mulyani", "location": "Sukabumi", "type": "GKP", "volume": 6.0, "harvest": "12 Nov 2026", "status": "Tersedia", "offers": 0},
            {"id": "STK-005", "farmer": "Pak Jajang Kurnia", "location": "Garut", "type": "GKG", "volume": 4.8, "harvest": "27 Okt 2026", "status": "Terjual", "offers": 4},
            {"id": "STK-006", "farmer": "Bu Nia Kartika", "location": "Sukabumi", "type": "GKP", "volume": 7.5, "harvest": "08 Nov 2026", "status": "Dalam Negosiasi", "offers": 2},
            {"id": "STK-007", "farmer": "Pak Agus Setiawan", "location": "Garut", "type": "GKP", "volume": 2.5, "harvest": "11 Nov 2026", "status": "Tersedia", "offers": 1},
            {"id": "STK-008", "farmer": "Bu Lina Fitriani", "location": "Sukabumi", "type": "GKP", "volume": 9.0, "harvest": "09 Nov 2026", "status": "Tersedia", "offers": 0},
        ],
        "offers": [
            {"id": "OFF-208", "buyer": "Pembeli 08••91", "location": "Garut", "farmer": "Pak Asep Hidayat", "stock": "STK-001", "volume": 5, "price": 6925, "ai": 7100, "status": "Menunggu", "date": "31 Okt 2026", "time": "10:42",
             "history": hist(("Penawaran dikirim", "31 Okt 2026 · 10:42", "Rp6.925/kg"), ("Diteruskan ke petani", "31 Okt 2026 · 10:43", "Harga wajar Rp7.100/kg"))},
            {"id": "OFF-207", "buyer": "Pembeli 03••74", "location": "Sukabumi", "farmer": "Bu Siti Aminah", "stock": "STK-002", "volume": 8.5, "price": 6950, "ai": 7040, "status": "Penawaran Balik", "date": "31 Okt 2026", "time": "10:15", "counter": 7100,
             "history": hist(("Penawaran dikirim", "31 Okt 2026 · 10:15", "Rp6.950/kg"), ("Petani ajukan penawaran balik", "31 Okt 2026 · 10:21", "Rp7.100/kg"))},
            {"id": "OFF-206", "buyer": "Pembeli 06••27", "location": "Garut", "farmer": "Pak Dedi Suhendra", "stock": "STK-003", "volume": 3.2, "price": 7050, "ai": 7100, "status": "Disetujui", "date": "30 Okt 2026", "time": "15:32",
             "history": hist(("Penawaran dikirim", "30 Okt 2026 · 15:32", "Rp7.050/kg"), ("Petani menyetujui", "30 Okt 2026 · 16:04", "Kesepakatan Rp7.050/kg"))},
            {"id": "OFF-205", "buyer": "Pembeli 09••63", "location": "Sukabumi", "farmer": "Bu Nia Kartika", "stock": "STK-006", "volume": 7.5, "price": 6725, "ai": 7040, "status": "Menunggu", "date": "30 Okt 2026", "time": "13:18",
             "history": hist(("Penawaran dikirim", "30 Okt 2026 · 13:18", "Rp6.725/kg"), ("Diteruskan ke petani", "30 Okt 2026 · 13:19", "Harga wajar Rp7.040/kg"))},
            {"id": "OFF-204", "buyer": "Pembeli 05••84", "location": "Garut", "farmer": "Pak Asep Hidayat", "stock": "STK-001", "volume": 4, "price": 6700, "ai": 7100, "status": "Ditolak", "date": "29 Okt 2026", "time": "11:25",
             "history": hist(("Penawaran dikirim", "29 Okt 2026 · 11:25", "Rp6.700/kg"), ("Petani menolak", "29 Okt 2026 · 11:41", "Penawaran ditolak"))},
            {"id": "OFF-203", "buyer": "Pembeli 07••16", "location": "Garut", "farmer": "Pak Jajang Kurnia", "stock": "STK-005", "volume": 4.8, "price": 7350, "ai": 7300, "status": "Disetujui", "date": "28 Okt 2026", "time": "09:48",
             "history": hist(("Penawaran dikirim", "28 Okt 2026 · 09:48", "Rp7.350/kg"), ("Petani menyetujui", "28 Okt 2026 · 10:05", "Kesepakatan Rp7.350/kg"))},
            {"id": "OFF-202", "buyer": "Pembeli 02••53", "location": "Sukabumi", "farmer": "Bu Siti Aminah", "stock": "STK-002", "volume": 6.0, "price": 6800, "ai": 7040, "status": "Penawaran Balik", "date": "28 Okt 2026", "time": "08:12", "counter": 7000,
             "history": hist(("Penawaran dikirim", "28 Okt 2026 · 08:12", "Rp6.800/kg"), ("Petani ajukan penawaran balik", "28 Okt 2026 · 08:33", "Rp7.000/kg"))},
        ],
        "transactions": [
            {"id": "TRX-104", "farmer": "Pak Dedi Suhendra", "buyer": "Pembeli 06••27", "location": "Garut", "stock": "STK-003", "volume": 3.2, "price": 7050, "date": "30 Okt 2026", "status": "Disepakati"},
            {"id": "TRX-103", "farmer": "Pak Jajang Kurnia", "buyer": "Pembeli 07••16", "location": "Garut", "stock": "STK-005", "volume": 4.8, "price": 7350, "date": "28 Okt 2026", "status": "Selesai"},
            {"id": "TRX-102", "farmer": "Bu Nia Kartika", "buyer": "Pembeli 04••88", "location": "Sukabumi", "stock": "STK-006", "volume": 4.0, "price": 7000, "date": "25 Okt 2026", "status": "Selesai"},
            {"id": "TRX-101", "farmer": "Bu Ratna Mulyani", "buyer": "Pembeli 01••35", "location": "Sukabumi", "stock": "STK-004", "volume": 2.0, "price": 6950, "date": "23 Okt 2026", "status": "Disepakati"},
        ],
        "events": [
            {"icon": "handshake", "title": "Pembeli 08••91 mengajukan penawaran", "note": "STK-001 · Garut · Rp6.925/kg", "time": "10:42", "kind": "Penawaran", "status": "Berhasil", "location": "Garut"},
            {"icon": "arrow-left-right", "title": "Bu Siti mengajukan penawaran balik", "note": "OFF-207 · Sukabumi · Rp7.100/kg", "time": "10:21", "kind": "Negosiasi", "status": "Berhasil", "location": "Sukabumi"},
            {"icon": "search", "title": "Pembeli mencari gabah 5 ton", "note": "Pencarian stok · Garut", "time": "09:52", "kind": "Pencarian", "status": "Berhasil", "location": "Garut"},
            {"icon": "refresh-cw", "title": "Bu Lina memperbarui stok gabah", "note": "STK-008 · Sukabumi · 9 ton", "time": "09:15", "kind": "Stok", "status": "Berhasil", "location": "Sukabumi"},
            {"icon": "message-circle-warning", "title": "Pesan tidak dapat dipahami chatbot", "note": "Permintaan perlu diperjelas · Identitas tersamarkan", "time": "08:47", "kind": "Chatbot", "status": "Perlu Tinjauan", "location": "Garut"},
            {"icon": "package-plus", "title": "Pak Agus mendaftarkan stok baru", "note": "STK-007 · Garut · 2,5 ton", "time": "08:13", "kind": "Stok", "status": "Berhasil", "location": "Garut"},
        ],
    }
