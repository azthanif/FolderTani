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


def test_static_frontend_served(client):
    assert client.get("/").status_code == 200
    for page in ("admin", "petani", "tengkulak", "harga", "berita"):
        assert client.get(f"/dashboard/{page}.html").status_code == 200
    assert client.get("/app.js").status_code == 200
    assert client.get("/Chatbot/chatbot.html").status_code == 200


def test_requires_demo_role(client):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers={"X-Demo-Role": "petani", "X-Demo-User": "F-999"}).status_code == 403


def test_petani_snapshot_is_scoped(client):
    s = client.get("/api/state", headers=P).json()
    assert {x["farmerId"] for x in s["stocks"]} == {"F-001"}
    assert {o["farmerId"] for o in s["offers"]} == {"F-001"}
    assert s["aiReference"] == {"GKP": 7100, "GKG": 7350}
    avail = {x["id"]: x["available"] for x in s["stocks"]}
    assert avail == {"STK-001": 5, "STK-007": 1.0, "STK-008": 0.8}


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


def test_full_negotiation_and_payment_flow(client):
    # Tengkulak menawar stok Pak Asep
    r = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 2, "price": 6800})
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
    assert next(x for x in s["stocks"] if x["id"] == "STK-001")["available"] == 3
    # Alur pembayaran: klaim -> verifikasi
    assert client.post(f"/api/transactions/{tid}/verify", headers=P).status_code == 409
    assert client.post(f"/api/transactions/{tid}/mark-paid", headers=T).status_code == 200
    assert client.post(f"/api/transactions/{tid}/verify", headers=P).status_code == 200
    trx = next(t for t in client.get("/api/state", headers=P).json()["transactions"] if t["id"] == tid)
    assert trx["payment"] == "Sudah Dibayar"


def test_no_overselling(client):
    a = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 4, "price": 7000}).json()["id"]
    b = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 4, "price": 7000}).json()["id"]
    assert client.post(f"/api/offers/{a}/accept", headers=P).status_code == 200
    r = client.post(f"/api/offers/{b}/accept", headers=P)
    assert r.status_code == 409 and "Stok sudah berkurang" in r.json()["detail"]
    assert client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 2, "price": 7000}).status_code == 409


def test_role_permissions(client):
    assert client.post("/api/stocks", headers=T, json={"volume": 1, "harvest": "2026-11-12"}).status_code == 403
    assert client.post("/api/offers", headers=P, json={"stockId": "STK-002", "volume": 1, "price": 7000}).status_code == 403
    # Petani lain tidak bisa menanggapi penawaran milik Pak Asep
    other = {"X-Demo-Role": "petani", "X-Demo-User": "F-002"}
    assert client.post("/api/offers/OFF-001/accept", headers=other).status_code == 404


def test_stock_volume_cannot_drop_below_committed(client):
    # STK-008: 1.8 ton, 1 ton sudah disepakati
    r = client.put("/api/stocks/STK-008", headers=P, json={"type": "GKP", "volume": 0.5, "harvest": "2026-11-05", "status": "Tersedia"})
    assert r.status_code == 400
    r = client.put("/api/stocks/STK-008", headers=P, json={"type": "GKP", "volume": 3, "harvest": "2026-11-05", "status": "Tersedia"})
    s = next(x for x in r.json()["state"]["stocks"] if x["id"] == "STK-008")
    assert s["type"] == "GKG" and s["available"] == 2  # jenis terkunci karena sudah ada kesepakatan


def test_state_persists_and_reset(client, tmp_path):
    client.post("/api/requests", headers=T, json={"type": "GKP", "region": "Garut", "volume": 2, "needed": "2026-11-20"})
    assert (tmp_path / "role_demo.json").exists()
    v = client.get("/api/state/version").json()["version"]
    assert v > 1
    r = client.post("/api/demo/reset", headers=T).json()
    assert len(r["state"]["requests"]) == 2


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


def test_unknown_request_id_auto_creates_request(client):
    r = client.post("/api/offers", headers=T, json={"stockId": "STK-001", "volume": 1.5, "price": 7000, "requestId": "REQ-TIDAK-ADA"})
    assert r.status_code == 200
    s = r.json()["state"]
    offer = next(o for o in s["offers"] if o["id"] == r.json()["id"])
    assert offer["requestId"] != "REQ-TIDAK-ADA"
    assert s["activities"][0]["note"] == "1.5 ton GKP • Garut"  # format sama dengan versi awal
