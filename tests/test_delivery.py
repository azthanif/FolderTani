"""Tes fitur delivery (PRD "Fitur Delivery Temu Tani: Estimasi Jarak & Biaya Angkut"), mengikuti tabel kriteria
penerimaan: Haversine, pemilihan armada, rumus tagihan, ambil sendiri, fee, biaya terkunci, master desa;
ditambah pencairan dua termin di escrow dan kanal WhatsApp."""
from __future__ import annotations

import math
from decimal import Decimal

import pytest

from conftest import PHONES
from test_escrow import SERVICE, deal, e164, finish_disb, gw, pay, wa  # noqa: F401 (fixture gw dipakai lewat nama)

KODE_PETANI = "3205051002"     # Kel. Sukagalih, Tarogong Kidul, Garut
KODE_TENGKULAK = "3203052001"  # Desa Ciranjang, Ciranjang, Cianjur


# ---------------------------------------------------------------------------
# Rumus murni (tanpa database)
# ---------------------------------------------------------------------------
TARIF = [  # sama dengan seed 007_delivery.sql (median Deliveree, 2026)
    {"kode": "CDE", "nama": "Engkel CDE", "kapasitas_ton": Decimal("3"), "tarif_harian": 850000, "tarif_per_km": 4000},
    {"kode": "CDD", "nama": "Engkel CDD", "kapasitas_ton": Decimal("8"), "tarif_harian": 1250000, "tarif_per_km": 7000},
    {"kode": "FUSO", "nama": "Fuso", "kapasitas_ton": Decimal("10"), "tarif_harian": 2100000, "tarif_per_km": 10750},
    {"kode": "TRONTON", "nama": "Tronton", "kapasitas_ton": Decimal("25"), "tarif_harian": 4150000, "tarif_per_km": 14500},
]


def test_haversine_known_distances():
    from backend.delivery import R_BUMI_KM, haversine_km
    # 1 derajat bujur di ekuator dan seperempat meridian: jarak analitis 2*pi*R/360 dan pi*R/2
    assert abs(haversine_km(0, 0, 0, 1) - 2 * math.pi * R_BUMI_KM / 360) < 0.1
    assert abs(haversine_km(0, 0, 90, 0) - math.pi * R_BUMI_KM / 2) < 0.1
    # 1 menit busur meridian = 1,853 km (mil laut berbasis R = 6.371 km); simetris; titik sama = 0
    assert abs(haversine_km(-7.0, 107.0, -7.0 + 1 / 60, 107.0) - 1.853) < 0.1
    assert haversine_km(-7.2, 107.9, -6.8, 107.2) == pytest.approx(haversine_km(-6.8, 107.2, -7.2, 107.9))
    assert haversine_km(-7.2, 107.9, -7.2, 107.9) == 0


@pytest.mark.parametrize("ton,expected", [
    ("3", {"CDE": 1}),
    ("3.01", {"CDD": 1}),
    ("8", {"CDD": 1}),
    ("10", {"FUSO": 1}),
    ("25", {"TRONTON": 1}),
    ("26", {"TRONTON": 1, "CDE": 1}),
    ("60", {"TRONTON": 2, "FUSO": 1}),
    ("30", {"TRONTON": 1, "CDD": 1}),
    ("50", {"TRONTON": 2}),
    ("0.5", {"CDE": 1}),
])
def test_pilih_armada_rules(ton, expected):
    from backend.delivery import pilih_armada
    got = {a["kode"]: a["jumlah"] for a in pilih_armada(Decimal(ton) * 1000, TARIF)}
    assert got == expected


def test_pilih_armada_rejects_nonpositive():
    from backend.delivery import DeliveryError, pilih_armada
    with pytest.raises(DeliveryError):
        pilih_armada(Decimal(0), TARIF)


@pytest.mark.parametrize("pengambilan,ton,logistik,nilai,fee,total", [  # tabel "Contoh hitung" PRD (D = 40 km)
    ("ambil_sendiri", "2", 0, 13_000_000, 65_000, 13_065_000),
    ("diantar", "2", 1_010_000, 13_000_000, 65_000, 14_075_000),
    ("diantar", "6", 1_530_000, 39_000_000, 195_000, 40_725_000),
    ("diantar", "10", 2_530_000, 65_000_000, 325_000, 67_855_000),
    ("diantar", "30", 6_260_000, 195_000_000, 975_000, 202_235_000),
])
def test_contoh_hitung_prd(pengambilan, ton, logistik, nilai, fee, total):
    from backend.delivery import hitung
    q = hitung(pengambilan, Decimal(ton) * 1000, 6500, TARIF, Decimal("40.0") if pengambilan == "diantar" else None)
    assert q["rincian"] == {"nilai_gabah": nilai, "biaya_logistik": logistik, "fee": fee}
    assert q["total_tagihan"] == total
    if pengambilan == "diantar":
        assert q["termin_petani"] == [{"ke": 1, "jenis": "logistik", "nilai": logistik}, {"ke": 2, "jenis": "gabah", "nilai": nilai}]
    else:
        assert q["jarak_km"] is None and q["armada"] == [] and q["termin_petani"] == [{"ke": 1, "jenis": "gabah", "nilai": nilai}]


def test_contoh_30_ton_rincian_armada():
    from backend.delivery import hitung
    q = hitung("diantar", Decimal(30000), 6500, TARIF, Decimal("40.0"))
    assert [(a["kode"], a["jumlah"], a["biaya"]) for a in q["armada"]] == [("TRONTON", 1, 4_730_000), ("CDD", 1, 1_530_000)]


@pytest.mark.parametrize("harga,kg,fee", [(6500, 2000, 65000), (6501, 1000, 32505), (7000, 1, 35), (6500, 3, 98), (6123, 777, 23788)])
def test_fee_always_half_percent(harga, kg, fee):
    from backend.delivery import hitung
    q = hitung("ambil_sendiri", Decimal(kg), harga, [])
    assert q["rincian"]["fee"] == fee == int((Decimal(harga * kg) * Decimal("0.005")).quantize(Decimal("1"), rounding="ROUND_HALF_UP"))


def test_same_village_costs_daily_rate_only():
    from backend.delivery import hitung
    q = hitung("diantar", Decimal(2000), 6500, TARIF, Decimal("0.0"))
    assert q["rincian"]["biaya_logistik"] == 850_000 and q["jarak_km"] == 0.0


def test_jarak_dibulatkan_01_km():
    from backend.delivery import bulat_jarak
    assert bulat_jarak(40.04) == Decimal("40.0") and bulat_jarak(40.05) == Decimal("40.1") and bulat_jarak(12.349) == Decimal("12.3")


# ---------------------------------------------------------------------------
# Database & API
# ---------------------------------------------------------------------------
@pytest.fixture()
def lokasi(sql):
    """Petani & tengkulak uji diberi desa; tengkulak lewat kolom nama (meniru form daftar), petani lewat kode_desa (backfill)."""
    sql("update users set kelurahan = 'Sukagalih', kode_desa = %s where phone = %s", (KODE_PETANI, e164(PHONES["petani"])))
    sql("update users set kabupaten = 'Cianjur', kecamatan = 'Ciranjang', kelurahan = 'Ciranjang', kode_desa = %s where phone = %s",
        (KODE_TENGKULAK, e164(PHONES["tengkulak"])))
    from backend import cache
    cache.clear()
    rows = sql("select kode_desa, lat, lon from master_desa where kode_desa in (%s, %s)", (KODE_PETANI, KODE_TENGKULAK))
    by = {r["kode_desa"]: r for r in rows}
    from backend.delivery import bulat_jarak, haversine_km
    a, b = by[KODE_PETANI], by[KODE_TENGKULAK]
    return float(bulat_jarak(haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])))


def test_master_desa_complete(sql):
    assert sql("select count(*)::int as n from master_desa")[0]["n"] == 802
    assert sql("select count(*)::int as n from master_desa where lat is null or lon is null")[0]["n"] == 0
    assert sql("select count(distinct kabupaten)::int as n from master_desa")[0]["n"] == 2
    t = sql("select kode, kapasitas_ton::float as k, tarif_harian, tarif_per_km from tarif_armada order by kapasitas_ton")
    assert [(r["kode"], r["k"], r["tarif_harian"], r["tarif_per_km"]) for r in t] == [
        ("CDE", 3.0, 850000, 4000), ("CDD", 8.0, 1250000, 7000), ("FUSO", 10.0, 2100000, 10750), ("TRONTON", 25.0, 4150000, 14500)]


def test_desa_endpoint_public_and_wilayah_has_kode(client):
    r = client.get("/api/desa", params={"kabupaten": "Garut", "q": "sukagalih"})
    assert r.status_code == 200
    item = next(i for i in r.json()["items"] if i["kode_desa"] == KODE_PETANI)
    assert item["label"] == "Kel. Sukagalih, Kec. Tarogong Kidul, Kab. Garut" and item["ada_koordinat"] is True
    w = client.get("/api/wilayah").json()
    kab = next(k for k in w["kabupaten"] if k["nama"] == "Garut")
    kec = next(k for k in kab["kecamatan"] if k["nama"] == "Tarogong Kidul")
    assert next(d for d in kec["desa"] if d["nama"] == "Sukagalih")["kode"] == KODE_PETANI


def test_quote_endpoint(client, login, lokasi):
    T = login("tengkulak")
    body = {"pengambilan": "diantar", "berat_ton": 30, "harga_per_kg": 6500, "kode_desa_asal": KODE_PETANI, "kode_desa_tujuan": "32.03.05.2001"}
    r = client.post("/api/delivery/quote", headers=T, json=body)
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["jarak_km"] == lokasi and lokasi > 0
    assert [(a["kode"], a["jumlah"]) for a in q["armada"]] == [("TRONTON", 1), ("CDD", 1)]
    logistik = (4150000 + 14500 * Decimal(str(lokasi))) + (1250000 + 7000 * Decimal(str(lokasi)))
    assert q["rincian"]["biaya_logistik"] == int(logistik.quantize(Decimal("1"), rounding="ROUND_HALF_UP"))
    assert q["total_tagihan"] == 195_000_000 + q["rincian"]["biaya_logistik"] + 975_000
    assert q["termin_petani"][0] == {"ke": 1, "jenis": "logistik", "nilai": q["rincian"]["biaya_logistik"]}
    assert set(q["peringatan"]) == {"koordinat_asal_centroid", "koordinat_tujuan_centroid"}
    # ambil sendiri: kode desa tidak wajib, satu termin
    a = client.post("/api/delivery/quote", headers=T, json={"pengambilan": "ambil_sendiri", "berat_ton": 2, "harga_per_kg": 6500}).json()
    assert a["jarak_km"] is None and a["armada"] == [] and a["rincian"]["biaya_logistik"] == 0 and len(a["termin_petani"]) == 1
    # error sesuai kontrak
    assert client.post("/api/delivery/quote", headers=T, json={**body, "berat_ton": 0}).status_code == 422
    assert client.post("/api/delivery/quote", headers=T, json={**body, "berat_ton": 1.234}).status_code == 422
    assert client.post("/api/delivery/quote", headers=T, json={**body, "kode_desa_asal": "3205999999"}).status_code == 404
    assert client.post("/api/delivery/quote", headers=T, json={**body, "kode_desa_tujuan": None}).status_code == 422
    assert client.post("/api/delivery/quote", json=body).status_code == 401


def test_coordinates_missing_returns_404(client, login, lokasi, sql):
    lat = sql("select lat from master_desa where kode_desa = %s", (KODE_TENGKULAK,))[0]["lat"]
    sql("update master_desa set lat = null where kode_desa = %s", (KODE_TENGKULAK,))
    try:
        r = client.post("/api/delivery/quote", headers=login("tengkulak"), json={
            "pengambilan": "diantar", "berat_ton": 2, "harga_per_kg": 6500, "kode_desa_asal": KODE_PETANI, "kode_desa_tujuan": KODE_TENGKULAK})
        assert r.status_code == 404
    finally:
        sql("update master_desa set lat = %s where kode_desa = %s", (lat, KODE_TENGKULAK))


def test_escrow_waits_for_choice_then_locks(client, login, sql, gw, lokasi):
    P, T, oid, trx = deal(client, login, volume=6000, pengambilan=None)
    eid = trx["escrowId"]
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    assert d["pengambilan"] is None and d["dikunci"] is False and d["invoice_url"] is None and not gw.invoices
    assert d["aksi_tersedia"] == ["pilih-ambil-sendiri", "pilih-diantar"]
    assert client.get(f"/api/escrow/{eid}", headers=P).json()["aksi_tersedia"] == []
    # pratinjau tidak mengunci
    q = client.post(f"/api/escrow/{eid}/quote", headers=T, json={"pengambilan": "diantar"}).json()
    assert q["jarak_km"] == lokasi and q["armada"][0]["kode"] == "CDD" and q["sudah_dipilih"] is None
    assert client.post(f"/api/escrow/{eid}/quote", headers=P, json={"pengambilan": "diantar"}).status_code == 403
    assert client.post(f"/api/escrow/{eid}/pengambilan", headers=P, json={"pengambilan": "diantar"}).status_code == 403
    # pembayaran sebelum tagihan final diabaikan
    r = client.post(f"/api/escrow/{eid}/pengambilan", headers=T, json={"pengambilan": "diantar"})
    assert r.status_code == 200 and r.json()["berubah"] is True
    d = r.json()
    assert d["pengambilan"] == "diantar" and d["dikunci"] and d["total_tagihan"] == q["total_tagihan"]
    assert d["rincian"] == q["rincian"] and d["desa_asal"].startswith("Kel. Sukagalih") and d["desa_tujuan"].startswith("Desa Ciranjang")
    assert d["termin_petani"][0]["jenis"] == "logistik" and d["termin_petani"][0]["status"] == "MENUNGGU"
    inv = list(gw.invoices.values())[0]
    assert inv["amount"] == q["total_tagihan"] and d["aksi_tersedia"] == ["bayar"]
    # idempoten & tidak bisa diganti
    assert client.post(f"/api/escrow/{eid}/pengambilan", headers=T, json={"pengambilan": "diantar"}).json()["berubah"] is False
    assert client.post(f"/api/escrow/{eid}/pengambilan", headers=T, json={"pengambilan": "ambil_sendiri"}).status_code == 409
    assert len(gw.invoices) == 1
    # biaya terkunci: ubah tarif master setelah transaksi dibuat
    sql("update tarif_armada set tarif_harian = 9999999, tarif_per_km = 99999 where kode = 'CDD'")
    try:
        d2 = client.get(f"/api/escrow/{eid}", headers=T).json()
        assert d2["rincian"] == d["rincian"] and d2["total_tagihan"] == d["total_tagihan"] and d2["armada"] == d["armada"]
    finally:
        sql("update tarif_armada set tarif_harian = 1250000, tarif_per_km = 7000 where kode = 'CDD'")


def test_diantar_two_termin_payout_and_fee_retained(client, login, sql, gw, lokasi):
    P, T, oid, trx = deal(client, login, volume=2000, pengambilan="diantar")
    eid = trx["escrowId"]
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    logistik, nilai, fee = d["rincian"]["biaya_logistik"], d["rincian"]["nilai_gabah"], d["rincian"]["fee"]
    assert logistik == int((850000 + 4000 * Decimal(str(lokasi))).quantize(Decimal("1"), rounding="ROUND_HALF_UP"))
    pay(client, gw, eid)
    # termin 1: logistik cair saat DIBAYAR (sebelum kirim)
    assert len(gw.disb) == 1
    d1 = gw.disb["disb1"]
    assert d1["external_id"] == f"{eid}-L1" and d1["amount"] == logistik
    assert client.get(f"/api/escrow/{eid}", headers=P).json()["termin_petani"][0]["status"] == "DIPROSES"
    assert finish_disb(client, gw).json()["changed"] is True
    d = client.get(f"/api/escrow/{eid}", headers=P).json()
    assert d["status"] == "DIBAYAR" and d["termin_petani"][0]["status"] == "CAIR" and d["termin_petani"][0]["cair_pada"]
    assert finish_disb(client, gw).json()["changed"] is False  # callback ganda tidak mengubah apa pun
    # termin 2: gabah setelah DITERIMA
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    assert len(gw.disb) == 2 and gw.disb["disb2"]["external_id"] == f"{eid}-1" and gw.disb["disb2"]["amount"] == nilai
    finish_disb(client, gw)
    d = client.get(f"/api/escrow/{eid}", headers=P).json()
    assert d["status"] == "SELESAI" and [t["status"] for t in d["termin_petani"]] == ["CAIR", "CAIR"]
    # fee ditahan platform: total dibayar tengkulak - total dicairkan ke petani = fee
    dibayar = list(gw.invoices.values())[0]["amount"]
    assert dibayar - sum(x["amount"] for x in gw.disb.values()) == fee == 65_000
    # event termin logistik tidak muncul sebagai perubahan status di aktivitas
    feed = client.get("/api/state", headers=P).json()["activities"]
    assert not any("logistik" in (a.get("note") or "").lower() for a in feed)


def test_ambil_sendiri_single_termin(client, login, gw, lokasi):
    P, T, _, trx = deal(client, login, pengambilan="ambil_sendiri")
    eid = trx["escrowId"]
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    assert d["jarak_km"] is None and d["armada"] == [] and d["rincian"]["biaya_logistik"] == 0 and len(d["termin_petani"]) == 1
    pay(client, gw, eid)
    assert gw.disb == {}  # tidak ada termin logistik


def test_logistik_payout_failure_and_admin_retry(client, login, sql, gw, lokasi):
    sql("delete from akun_pencairan_petani")
    P, T, _, trx = deal(client, login, pengambilan="diantar")
    eid = trx["escrowId"]
    pay(client, gw, eid)
    d = client.get(f"/api/escrow/{eid}", headers=login("admin")).json()
    assert d["status"] == "DIBAYAR" and d["termin_petani"][0]["status"] == "GAGAL"
    assert "cairkan-ulang-logistik" in d["aksi_tersedia"]
    assert client.post(f"/api/escrow/{eid}/cairkan-ulang-logistik", headers=T).status_code == 403
    sql("insert into akun_pencairan_petani (petani_id, kode_bank, nama_pemilik, nomor_akun)"
        " select id, 'BCA', 'Asep Hidayat', '1234567890' from users where phone = %s", (e164(PHONES["petani"]),))
    d = client.post(f"/api/escrow/{eid}/cairkan-ulang-logistik", headers=login("admin")).json()
    assert d["termin_petani"][0]["status"] == "DIPROSES" and list(gw.disb.values())[-1]["external_id"] == f"{eid}-L2"
    assert client.post(f"/api/escrow/{eid}/cairkan-ulang-logistik", headers=login("admin")).status_code == 409
    finish_disb(client, gw)
    assert client.get(f"/api/escrow/{eid}", headers=P).json()["termin_petani"][0]["status"] == "CAIR"


def test_diantar_requires_villages(client, login, gw, sql):
    # tengkulak tanpa desa di profil & petani tanpa desa: diantar ditolak dengan pesan jelas, ambil sendiri tetap bisa
    P, T, _, trx = deal(client, login, pengambilan=None)
    eid = trx["escrowId"]
    r = client.post(f"/api/escrow/{eid}/pengambilan", headers=T, json={"pengambilan": "diantar"})
    assert r.status_code == 422 and "petani" in r.json()["detail"]
    sql("update users set kode_desa = %s where phone = %s", (KODE_PETANI, e164(PHONES["petani"])))
    r = client.post(f"/api/escrow/{eid}/pengambilan", headers=T, json={"pengambilan": "diantar"})
    assert r.status_code == 422 and "tujuan" in r.json()["detail"]
    r = client.post(f"/api/escrow/{eid}/pengambilan", headers=T, json={"pengambilan": "diantar", "kode_desa_tujuan": KODE_TENGKULAK})
    assert r.status_code == 200 and r.json()["desa_tujuan"].startswith("Desa Ciranjang")


def test_choose_via_whatsapp(client, login, gw, lokasi, sql):
    P, T, _, trx = deal(client, login, pengambilan=None)
    eid = trx["escrowId"]
    q = client.post(f"/api/escrow/ESC-{trx['offerId'].split('-')[1]}/quote", headers=wa("tengkulak"), json={"pengambilan": "diantar"})
    assert q.status_code == 200 and q.json()["kode"].startswith("ESC-")
    r = client.post(f"/api/escrow/{eid}/pengambilan", headers=wa("tengkulak"), json={"pengambilan": "ambil_sendiri"})
    assert r.status_code == 200 and r.json()["invoice_url"]
    ev = sql("select pelaku, kanal, payload from escrow_event where escrow_id = %s and payload->>'aksi' = 'pilih-pengambilan'", (eid,))
    assert ev[0]["pelaku"] == "tengkulak" and ev[0]["kanal"] == "whatsapp" and ev[0]["payload"]["total_tagihan"] == 13_065_000


def test_create_escrow_with_pengambilan_locks_immediately(client, login, gw, lokasi, sql):
    """POST /api/escrow menerima pilihan pengambilan: hitung ulang quote lalu simpan snapshot (kontrak API PRD)."""
    _, _, oid, trx = deal(client, login, pengambilan=None)
    r = client.post("/api/escrow", headers=wa("tengkulak"), json={"offer_id": oid, "notify": False, "pengambilan": "diantar"})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["pengambilan"] == "diantar" and d["jarak_km"] == lokasi and d["invoice_url"] and d["baru"] is False


def test_register_and_profile_set_kode_desa(client, login, sql):
    r = client.post("/api/auth/register", json={"name": "Pak Dadang", "phone": "081277770001", "password": "Rahasia123",
                                               "region": "Cianjur", "district": "Ciranjang", "village": "Sindangjaya"})
    assert r.status_code == 201, r.text
    assert sql("select kode_desa from users where phone = %s", (e164("081277770001"),))[0]["kode_desa"] == "3203052002"
    T = login("tengkulak")
    r = client.put("/api/auth/profile", headers=T, json={"name": "Pak Budi Santoso", "region": "Cianjur", "district": "Ciranjang", "village": "Ciranjang"})
    assert r.status_code == 200 and r.json()["user"]["villageCode"] == KODE_TENGKULAK


def test_mock_mode_diantar_checkout_and_auto_termin(client, login, monkeypatch, sql, gw, lokasi):
    """Mode simulasi: checkout menampilkan rincian, termin logistik & gabah cair otomatis."""
    from backend import xendit
    import importlib
    monkeypatch.setenv("TEMUTANI_PAYMENT_MOCK", "1")
    importlib.reload(xendit)
    try:
        sql("delete from akun_pencairan_petani")
        P, T, _, trx = deal(client, login, pengambilan="diantar")
        eid = trx["escrowId"]
        d = client.get(f"/api/escrow/{eid}", headers=T).json()
        path = d["invoice_url"][d["invoice_url"].index("/api/"):]
        page = client.get(path).text
        assert "Fee aplikasi" in page and "Logistik" in page and f"{d['total_tagihan']:,}".replace(",", ".") in page
        client.post(path)
        d = client.get(f"/api/escrow/{eid}", headers=P).json()
        assert d["status"] == "DIBAYAR" and d["termin_petani"][0]["status"] == "CAIR"
        client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
        client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
        d = client.get(f"/api/escrow/{eid}", headers=P).json()
        assert d["status"] == "SELESAI" and [t["status"] for t in d["termin_petani"]] == ["CAIR", "CAIR"]
    finally:
        monkeypatch.delenv("TEMUTANI_PAYMENT_MOCK")
        importlib.reload(xendit)


def test_seed_desa_script_upserts_and_backfills(client, sql, capsys):
    from backend import seed_desa
    sql("update users set kelurahan = 'Sukagalih', kode_desa = null where phone = %s", (e164(PHONES["petani"]),))
    seed_desa.main([])
    out = capsys.readouterr().out
    assert "802 desa di-upsert" in out and "0 tanpa koordinat" in out
    assert sql("select kode_desa from users where phone = %s", (e164(PHONES["petani"]),))[0]["kode_desa"] == KODE_PETANI


def test_farmer_changing_kecamatan_clears_desa(client, login, sql, lokasi):
    P = login("petani")
    r = client.put("/api/auth/profile", headers=P, json={"name": "Pak Asep Hidayat", "region": "Garut", "district": "Tarogong Kidul"})
    assert r.json()["user"]["villageCode"] == KODE_PETANI and r.json()["user"]["village"] == "Sukagalih"  # kecamatan sama: tetap
    r = client.put("/api/auth/profile", headers=P, json={"name": "Pak Asep Hidayat", "region": "Garut", "district": "Leles"})
    assert r.json()["user"]["villageCode"] == "" and r.json()["user"]["village"] == ""
    # petani memilih desa sendiri dari data Kepmendagri (sama seperti tengkulak)
    r = client.put("/api/auth/profile", headers=P, json={"name": "Pak Asep Hidayat", "region": "Garut", "district": "Tarogong Kidul", "village": "Sukagalih"})
    assert r.status_code == 200 and r.json()["user"]["villageCode"] == KODE_PETANI and r.json()["user"]["village"] == "Sukagalih"
    assert client.put("/api/auth/profile", headers=P, json={"name": "Pak Asep Hidayat", "region": "Garut", "district": "Leles", "village": "Sukagalih"}).status_code == 400
