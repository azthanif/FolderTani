"""Tes API Temu Tani. Jalankan: pytest -q"""
import importlib
import os

import pytest
from fastapi.testclient import TestClient

P = {"X-Demo-Role": "petani", "X-Demo-User": "F-001"}
T = {"X-Demo-Role": "tengkulak", "X-Demo-User": "GUEST-001"}
A = {"X-Demo-Role": "admin"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TEMUTANI_DATA_DIR", str(tmp_path))
    import backend.main as main
    importlib.reload(main)  # store baru di folder sementara untuk tiap tes
    return TestClient(main.app)


def test_requires_demo_role(client):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers={"X-Demo-Role": "petani", "X-Demo-User": "F-999"}).status_code == 403


def test_petani_snapshot_is_scoped(client):
    s = client.get("/api/state", headers=P).json()
    assert {x["farmerId"] for x in s["stocks"]} == {"F-001"}
    assert {o["farmerId"] for o in s["offers"]} == {"F-001"}
    assert s["aiReference"] == {"GKP": 7100}
    avail = {x["id"]: x["available"] for x in s["stocks"]}
    assert avail == {"STK-001": 5000, "STK-007": 1000, "STK-008": 800}


def test_buyer_never_receives_ai_reference(client):
    s = client.get("/api/state", headers=T).json()
    assert all("aiRef" not in o for o in s["offers"])
    assert "aiReference" not in s
    assert client.get("/api/prices", headers=T).status_code == 403


def test_prices_locked_for_farmer(client):
    p = client.get("/api/prices?wilayah=Sukabumi", headers=P).json()
    assert list(p["regions"]) == ["Garut"] and p["lockedArea"] == "Garut"
    a = client.get("/api/prices", headers=A).json()
    assert set(a["regions"]) == {"Garut", "Sukabumi"}
    g = a["regions"]["Garut"]
    assert len(g["actualDaily"]) == 30 and len(g["forecast"]) == 7


def test_full_negotiation_flow(client):
    # Tengkulak menawar stok Pak Asep
    r = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 2000, "price": 6800})
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    # Petani mengajukan harga balik (harus > tawaran)
    assert client.post(f"/api/offers/{oid}/counter", headers=P, json={"price": 6800}).status_code == 400
    assert client.post(f"/api/offers/{oid}/counter", headers=P, json={"price": 7050}).status_code == 200
    # Tengkulak tidak boleh menawar di bawah tawaran pertama
    assert client.post(f"/api/offers/{oid}/counter", headers=T, json={"price": 6700}).status_code == 400
    # Tengkulak menyetujui harga balik -> transaksi tercipta & stok teralokasi
    r = client.post(f"/api/offers/{oid}/accept-counter", headers=T)
    assert r.status_code == 200
    tid = r.json()["id"]
    s = client.get("/api/state", headers=P).json()
    assert next(x for x in s["stocks"] if x["id"] == "STK-001")["available"] == 3000
    # Pembayaran dilakukan di luar sistem: tidak ada status/endpoint pembayaran
    trx = next(t for t in client.get("/api/state", headers=P).json()["transactions"] if t["id"] == tid)
    assert "payment" not in trx and trx["price"] == 7050
    assert client.post(f"/api/transactions/{tid}/mark-paid", headers=T).status_code == 404


def test_no_overselling(client):
    a = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 4000, "price": 7000}).json()["id"]
    b = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 4000, "price": 7000}).json()["id"]
    assert client.post(f"/api/offers/{a}/accept", headers=P).status_code == 200
    r = client.post(f"/api/offers/{b}/accept", headers=P)
    assert r.status_code == 409 and "Stok sudah berkurang" in r.json()["detail"]
    assert client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 2000, "price": 7000}).status_code == 409


def test_role_permissions(client):
    assert client.post("/api/stocks", headers=T, json={"volume": 1, "harvest": "2026-11-12"}).status_code == 403
    assert client.post("/api/offers", headers=P, json={"stockId": "STK-002", "volume": 1, "price": 7000}).status_code == 403
    # Petani lain tidak bisa menanggapi penawaran milik Pak Asep
    other = {"X-Demo-Role": "petani", "X-Demo-User": "F-002"}
    assert client.post("/api/offers/OFF-001/accept", headers=other).status_code == 404


def test_only_gkp_accepted(client):
    r = client.post("/api/stocks", headers=P, json={"type": "GKG", "volume": 1000, "harvest": "2026-11-12"})
    assert r.status_code == 422
    r = client.put("/api/stocks/STK-001", headers=P, json={"type": "GKG", "volume": 1000, "harvest": "2026-11-12"})
    assert r.status_code == 422


def test_state_persists_and_reset(client, tmp_path):
    client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 100, "price": 7000})
    assert (tmp_path / "role_demo.json").exists()
    v = client.get("/api/state/version").json()["version"]
    assert v > 1
    r = client.post("/api/demo/reset", headers=T).json()
    assert len(r["state"]["offers"]) == 4  # penawaran awal milik GUEST-001


def test_news_and_admin(client):
    n = client.get("/api/berita").json()
    assert n["total"] == 30 and isinstance(n["items"][0]["ner_results"], list)
    assert client.get("/api/admin/dashboard", headers=P).status_code == 403
    d = client.get("/api/admin/dashboard", headers=A).json()
    assert len(d["stocks"]) == 8 and len(d["events"]) == 6


def test_chatbot_state_roundtrip(client):
    assert client.get("/api/chatbot/state").json() == {"state": None}
    assert client.put("/api/chatbot/state", json={"v": 7}).status_code == 400
    assert client.put("/api/chatbot/state", json={"v": 8, "role": "farmer"}).status_code == 200
    assert client.get("/api/chatbot/state").json()["state"]["role"] == "farmer"


def test_reset_requires_role_dashboard(client):
    assert client.post("/api/demo/reset", headers=A).status_code == 403


def test_request_feature_removed(client):
    assert client.post("/api/requests", headers=T, json={"type": "GKP", "region": "Garut", "volume": 1, "needed": "2026-11-20"}).status_code == 404
    r = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 1500, "price": 7000})
    assert r.status_code == 200
    s = r.json()["state"]
    assert "requests" not in s and "requestId" not in next(o for o in s["offers"] if o["id"] == r.json()["id"])
    assert s["activities"][0]["note"] == "1.500 kg GKP • Garut"


def test_vercel_mode_uses_tmp_and_cdn(monkeypatch):
    """Di Vercel: data di /tmp dan public/ TIDAK di-mount (disajikan CDN)."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("TEMUTANI_DATA_DIR", raising=False)
    import backend.main as main
    importlib.reload(main)
    try:
        assert str(main.DATA_DIR).startswith("/tmp/")
        c = TestClient(main.app)
        assert c.get("/api/health").status_code == 200
        assert c.get("/index.html").status_code == 404  # bukan tugas FastAPI di Vercel
        assert c.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 1, "price": 7000}).status_code == 200
    finally:
        monkeypatch.delenv("VERCEL")
        importlib.reload(main)


def test_vercel_function_wrapper_restores_path(client):
    """Simulasi rewrite Vercel: /api/state -> /api/index?__path=state."""
    import api.index as entry
    importlib.reload(entry)
    c = TestClient(entry.app)
    assert c.get("/api/index?__path=health").json()["status"] == "ok"
    r = c.get("/api/index?__path=berita&from=2026-11-10", headers=P)
    assert r.status_code == 200 and all(n["tanggal"] >= "2026-11-10" for n in r.json()["items"])
    r = c.post("/api/index?__path=offers/OFF-001/reject", headers=P)
    assert r.status_code == 200 and r.json()["message"] == "Penawaran ditolak."
    assert c.get("/api/state", headers=T).status_code == 200  # path asli tetap jalan


# ---------------------------------------------------------------------------
# Akun: daftar & masuk
# ---------------------------------------------------------------------------
def test_register_farmer_then_login_and_use_token(client):
    body = {"role": "petani", "name": "Pak Ujang", "phone": "+62 812-3456-7890", "password": "rahasia123",
            "region": "Kabupaten Karawang", "district": "Rengasdengklok"}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    u = r.json()["user"]
    assert u["role"] == "petani" and u["phone"] == "081234567890" and u["region"] == "Kabupaten Karawang"
    assert "passwordHash" not in r.text
    # nomor yang sama tidak boleh daftar dua kali (format berbeda tetap terdeteksi)
    assert client.post("/api/auth/register", json={**body, "phone": "081234567890"}).status_code == 409
    # login
    assert client.post("/api/auth/login", json={"phone": "081234567890", "password": "salah1234"}).status_code == 401
    r = client.post("/api/auth/login", json={"phone": "6281234567890", "password": "rahasia123"})
    assert r.status_code == 200
    H = {"Authorization": "Bearer " + r.json()["token"]}
    # token dipakai untuk aksi petani; stok tercatat di wilayah petani
    r = client.post("/api/stocks", headers=H, json={"volume": 1500, "harvest": "2026-11-20"})
    assert r.status_code == 200, r.text
    st = r.json()["state"]
    assert st["actor"]["user"] == u["id"] and st["stocks"][0]["region"] == "Kabupaten Karawang"
    assert all("phone" not in f for f in st["farmers"]) and "users" not in st
    assert client.get("/api/auth/me", headers=H).json()["name"] == "Pak Ujang"


def test_register_validation(client):
    base = {"role": "petani", "name": "Bu Ani", "phone": "081300000000", "password": "rahasia123"}
    assert client.post("/api/auth/register", json=base).status_code == 400  # petani wajib kota/kab & kecamatan
    assert client.post("/api/auth/register", json={**base, "role": "tengkulak", "phone": "12345"}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "role": "tengkulak", "phone": "021555666777"}).status_code == 400
    assert client.post("/api/auth/register", json={**base, "role": "tengkulak", "password": "pendek"}).status_code == 422
    r = client.post("/api/auth/register", json={**base, "role": "tengkulak"})
    assert r.status_code == 201 and r.json()["user"]["role"] == "tengkulak"


def test_demo_account_login_and_bad_token(client):
    r = client.post("/api/auth/login", json={"phone": "081200000001", "password": "temutani123"})
    assert r.status_code == 200 and r.json()["user"]["id"] == "F-001"
    assert client.get("/api/state", headers={"Authorization": "Bearer palsu.token"}).status_code == 401
    token = r.json()["token"]
    tampered = token[:-2] + ("AA" if not token.endswith("AA") else "BB")
    assert client.get("/api/state", headers={"Authorization": "Bearer " + tampered}).status_code == 401


def test_reset_keeps_registered_accounts(client):
    body = {"role": "tengkulak", "name": "CV Padi Jaya", "phone": "081377788899", "password": "rahasia123"}
    tok = client.post("/api/auth/register", json=body).json()["token"]
    H = {"Authorization": "Bearer " + tok}
    assert client.post("/api/demo/reset", headers=H).status_code == 200
    assert client.post("/api/auth/login", json={"phone": body["phone"], "password": body["password"]}).status_code == 200
    assert client.get("/api/state", headers=H).status_code == 200


def test_region_is_normalized_for_ai_price(client):
    body = {"role": "petani", "name": "Pak Odo", "phone": "081388877766", "password": "rahasia123", "region": "kab. garut", "district": "Leles"}
    r = client.post("/api/auth/register", json=body).json()
    assert r["user"]["region"] == "Garut"
    H = {"Authorization": "Bearer " + r["token"]}
    assert client.get("/api/state", headers=H).json()["aiReference"] == {"GKP": 7100}
    assert client.get("/api/prices", headers=H).json()["lockedArea"] == "Garut"


def test_buyer_names_are_people(client):
    s = client.get("/api/state", headers=P).json()
    assert {b["label"] for b in s["buyers"]} >= {"Pak Budi Santoso", "Pak Hendra Wijaya"}


def test_transaction_contact_only_for_parties(client):
    # Daftarkan petani & tengkulak, buat kesepakatan, cek nomor lawan transaksi
    fp = {"role": "petani", "name": "Pak Engkos", "phone": "081311122233", "password": "rahasia123", "region": "Garut", "district": "Leles"}
    tp = {"role": "tengkulak", "name": "Pak Darto", "phone": "081344455566", "password": "rahasia123"}
    F = {"Authorization": "Bearer " + client.post("/api/auth/register", json=fp).json()["token"]}
    B = {"Authorization": "Bearer " + client.post("/api/auth/register", json=tp).json()["token"]}
    sid = client.post("/api/stocks", headers=F, json={"volume": 1000, "harvest": "2026-11-20"}).json()["id"]
    oid = client.post("/api/offers", headers=B, json={"stockId": sid, "volume": 500, "price": 7000}).json()["id"]
    client.post(f"/api/offers/{oid}/accept", headers=F)
    assert client.get("/api/state", headers=F).json()["transactions"][0]["contact"] == "081344455566"
    assert client.get("/api/state", headers=B).json()["transactions"][0]["contact"] == "081311122233"


def test_agreed_volume_is_deducted_and_logged(client):
    s = client.get("/api/state", headers=P).json()
    assert sum(x["volume"] for x in s["stocks"]) == 6800  # 9000 dipanen - 2200 terjual via Temu Tani
    oid = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 2000, "price": 7000}).json()["id"]
    st = client.post(f"/api/offers/{oid}/accept", headers=P).json()["state"]
    assert next(x for x in st["stocks"] if x["id"] == "STK-001")["volume"] == 3000
    last = st["stockLog"][0]
    assert last["activity"].startswith("Terjual via Temu Tani (TRX-") and last["delta"] == -2000
    assert last["total"] == 4800 and last["harvest"] == "2026-11-09"


def test_add_stock_merges_same_harvest_date(client):
    st = client.post("/api/stocks", headers=P, json={"volume": 500, "harvest": "2026-11-09"}).json()["state"]
    assert next(x for x in st["stocks"] if x["id"] == "STK-001")["volume"] == 5500
    assert len(st["stocks"]) == 3
    st = client.post("/api/stocks", headers=P, json={"volume": 700, "harvest": "2026-11-20"}).json()["state"]
    assert len(st["stocks"]) == 4 and st["stockLog"][0] | {"id": "", "at": ""} == {
        "id": "", "at": "", "farmerId": "F-001", "activity": "Tambah panen", "harvest": "2026-11-20", "delta": 700, "total": 8000}


def test_update_remaining_per_harvest(client):
    r = client.put("/api/stocks/remaining", headers=P, json={"items": [
        {"id": "STK-007", "volume": 400},   # panen 4 Nov: 1.000 -> 400
        {"id": "STK-001", "volume": 5000},  # tidak berubah, tidak dicatat
        {"id": "STK-008", "volume": 0},     # panen 5 Nov habis (tetap disimpan karena dirujuk transaksi)
    ]})
    assert r.status_code == 200, r.text
    st = r.json()["state"]
    vol = {x["id"]: x["volume"] for x in st["stocks"]}
    assert vol == {"STK-001": 5000, "STK-007": 400, "STK-008": 0}
    assert [(x["harvest"], x["delta"], x["total"]) for x in st["stockLog"][:2]] == [("2026-11-05", -800, 5400), ("2026-11-04", -600, 6200)]
    # stok habis: sisa 0 (frontend tengkulak hanya menampilkan sisa > 0)
    assert next(x for x in client.get("/api/state", headers=T).json()["stocks"] if x["id"] == "STK-008")["available"] == 0
    # bukan milik sendiri / tengkulak
    assert client.put("/api/stocks/remaining", headers=P, json={"items": [{"id": "STK-002", "volume": 1}]}).status_code == 404
    assert client.put("/api/stocks/remaining", headers=T, json={"items": [{"id": "STK-001", "volume": 1}]}).status_code == 403
    assert client.put("/api/stocks/remaining", headers=P, json={"items": [{"id": "STK-001", "volume": -1}]}).status_code == 422


def test_empty_unreferenced_listing_is_removed(client):
    body = {"role": "petani", "name": "Bu Imas", "phone": "081355544433", "password": "rahasia123", "region": "Garut", "district": "Leles"}
    H = {"Authorization": "Bearer " + client.post("/api/auth/register", json=body).json()["token"]}
    sid = client.post("/api/stocks", headers=H, json={"volume": 1200, "harvest": "2026-11-20"}).json()["id"]
    st = client.put("/api/stocks/remaining", headers=H, json={"items": [{"id": sid, "volume": 0}]}).json()["state"]
    assert st["stocks"] == [] and [x["delta"] for x in st["stockLog"]] == [-1200, 1200]


def test_offer_exceeding_reduced_stock_cannot_be_accepted(client):
    # OFF-001: 3.000 kg dari STK-001; petani mengurangi sisa panen 9 Nov jadi 2.000 kg
    client.put("/api/stocks/remaining", headers=P, json={"items": [{"id": "STK-001", "volume": 2000}]})
    assert client.post("/api/offers/OFF-001/accept", headers=P).status_code == 409
