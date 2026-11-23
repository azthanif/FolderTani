"""Tes API Temu Tani di atas PostgreSQL (skema identik Supabase)."""
from __future__ import annotations

from conftest import PASSWORD, PHONES


def e164(local: str) -> str:
    return "+62" + local[1:]


# ---------------------------------------------------------------------------
# Umum & autentikasi
# ---------------------------------------------------------------------------
def test_health_reports_database(client):
    r = client.get("/api/health").json()
    assert r["database"] == "ok" and r["whatsapp"] == "not_configured"


def test_endpoints_require_login(client):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/admin/dashboard").status_code == 401
    assert client.get("/api/state", headers={"X-Demo-Role": "admin"}).status_code == 401  # header demo tidak berlaku lagi
    assert client.get("/api/state", headers={"Authorization": "Bearer palsu.token"}).status_code == 401


def test_register_petani_and_tengkulak(client, sql):
    body = {"role": "petani", "name": "Pak Engkos", "phone": "+62 813-1112-2233", "password": "rahasia123", "region": "kab. cianjur", "district": "Cugenang"}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    u = r.json()["user"]
    assert (u["role"], u["phone"], u["region"], u["district"]) == ("petani", "081311122233", "Cianjur", "Cugenang")
    row = sql("select phone, display_name, password_hash is not null as has_pw from users where phone = %s", ("+6281311122233",))[0]
    assert row["has_pw"] and row["display_name"] == "Pak Engkos"
    assert sql("select quantity_kg from stocks s join users u on u.id = s.farmer_id where u.phone = '+6281311122233'")[0]["quantity_kg"] == 0
    assert client.post("/api/auth/register", json={**body, "phone": "081311122233"}).status_code == 409
    t = client.post("/api/auth/register", json={"role": "tengkulak", "name": "CV Padi Jaya", "phone": "081377788899", "password": "rahasia123"})
    assert t.status_code == 201 and t.json()["user"]["role"] == "tengkulak"


def test_register_validation(client):
    base = {"role": "petani", "name": "Bu Ani", "phone": "081300000000", "password": "rahasia123", "district": "Cibeber"}
    r = client.post("/api/auth/register", json={**base, "region": "Sukabumi"})
    assert r.status_code == 400 and "Garut atau Cianjur" in r.json()["detail"]
    assert client.post("/api/auth/register", json={**base, "region": "Garut", "district": ""}).status_code == 400
    assert client.post("/api/auth/register", json={**base, "region": "Garut", "phone": "021555666777"}).status_code == 400
    assert client.post("/api/auth/register", json={**base, "region": "Garut", "password": "pendek"}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "role": "admin", "region": "Garut"}).status_code == 422


def test_whatsapp_registered_number_must_use_forgot_password(client):
    r = client.post("/api/auth/register", json={"role": "petani", "name": "Pak Ujang", "phone": PHONES["wa_farmer"],
                                                "password": "rahasia123", "region": "Garut", "district": "Leles"})
    assert r.status_code == 409 and "Lupa Password" in r.json()["detail"]
    r = client.post("/api/auth/login", json={"phone": PHONES["wa_farmer"], "password": "apasaja1"})
    assert r.status_code == 401 and "Lupa Password" in r.json()["detail"]


def test_login(client):
    assert client.post("/api/auth/login", json={"phone": PHONES["petani"], "password": "salah12345"}).status_code == 401
    assert client.post("/api/auth/login", json={"phone": "081999999999", "password": PASSWORD}).status_code == 401
    r = client.post("/api/auth/login", json={"phone": "+62 812-0000-0001", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Pak Asep Hidayat"


def test_admin_account(client, login):
    H = login("admin")
    me = client.get("/api/auth/me", headers=H).json()
    assert me["role"] == "admin" and me["phone"] == "081241831052"
    assert client.get("/api/admin/dashboard", headers=H).status_code == 200
    assert client.get("/api/admin/dashboard", headers=login("petani")).status_code == 403
    assert client.get("/api/admin/dashboard", headers=login("tengkulak")).status_code == 403
    assert set(client.get("/api/prices", headers=H).json()["regions"]) == {"Garut", "Cianjur"}


def test_admin_account_exists_from_migration(sql):
    # Migrasi 002 membuat akun admin; fixture tes menimpanya dengan password tes.
    assert sql("select role from users where phone = '+6281241831052'")[0]["role"] == "admin"


# ---------------------------------------------------------------------------
# Profil, ubah password, lupa password (OTP WhatsApp)
# ---------------------------------------------------------------------------
def test_update_profile(client, login, sql):
    H = login("petani")
    r = client.put("/api/auth/profile", headers=H, json={"name": "Asep H.", "region": "Cianjur", "district": "Cibeber", "shareContact": True})
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert (u["name"], u["region"], u["district"], u["shareContact"]) == ("Asep H.", "Cianjur", "Cibeber", True)
    assert client.put("/api/auth/profile", headers=H, json={"name": "Asep H.", "region": "Bandung", "district": "X"}).status_code == 400
    # display_name samaran dari chatbot tidak ikut berubah
    HD = login("petani_cianjur")
    client.put("/api/auth/profile", headers=HD, json={"name": "Dewi Lestari", "region": "Cianjur", "district": "Ciranjang"})
    assert sql("select display_name from users where phone = %s", (e164(PHONES["petani_cianjur"]),))[0]["display_name"] == "Petani E"
    # tengkulak: hanya nama
    r = client.put("/api/auth/profile", headers=login("tengkulak"), json={"name": "Budi S.", "region": "Garut", "district": "Leles", "shareContact": True})
    u = r.json()["user"]
    assert u["name"] == "Budi S." and u["region"] == "" and u["shareContact"] is False


def test_forgot_password_flow(client, sql):
    phone = PHONES["wa_farmer"]
    r = client.post("/api/auth/otp", json={"purpose": "reset_password", "phone": phone})
    assert r.status_code == 200, r.text
    code = r.json()["devCode"]
    assert "0812••••009" in r.json()["message"]
    # cooldown
    assert client.post("/api/auth/otp", json={"purpose": "reset_password", "phone": phone}).status_code == 429
    # kode salah dicatat
    bad = "000000" if code != "000000" else "111111"
    assert client.post("/api/auth/password/reset", json={"phone": phone, "code": bad, "password": "barubaru1"}).status_code == 400
    assert sql("select attempts from otp_codes where phone = %s", (e164(phone),))[0]["attempts"] == 1
    r = client.post("/api/auth/password/reset", json={"phone": phone, "code": code, "password": "barubaru1"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "petani"
    # kode sekali pakai
    assert client.post("/api/auth/password/reset", json={"phone": phone, "code": code, "password": "barubaru2"}).status_code == 400
    assert client.post("/api/auth/login", json={"phone": phone, "password": "barubaru1"}).status_code == 200


def test_forgot_password_does_not_reveal_unknown_number(client, sql):
    r = client.post("/api/auth/otp", json={"purpose": "reset_password", "phone": "081377700011"})
    assert r.status_code == 200 and "devCode" not in r.json()
    assert sql("select count(*) as n from otp_codes")[0]["n"] == 0


def test_otp_locked_after_max_attempts(client):
    phone = PHONES["petani"]
    code = client.post("/api/auth/otp", json={"purpose": "reset_password", "phone": phone}).json()["devCode"]
    bad = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/password/reset", json={"phone": phone, "code": bad, "password": "barubaru1"}).status_code == 400
    assert client.post("/api/auth/password/reset", json={"phone": phone, "code": code, "password": "barubaru1"}).status_code == 429


def test_change_password_requires_otp_and_revokes_old_sessions(client, login):
    H = login("tengkulak")
    assert client.post("/api/auth/otp", json={"purpose": "change_password"}).status_code == 401
    code = client.post("/api/auth/otp", headers=H, json={"purpose": "change_password"}).json()["devCode"]
    r = client.post("/api/auth/password/change", headers=H, json={"code": code, "password": "passwordbaru"})
    assert r.status_code == 200, r.text
    assert client.get("/api/state", headers=H).status_code == 401  # token lama tidak berlaku
    assert client.get("/api/state", headers={"Authorization": "Bearer " + r.json()["token"]}).status_code == 200
    assert client.post("/api/auth/login", json={"phone": PHONES["tengkulak"], "password": "passwordbaru"}).status_code == 200


def test_otp_unavailable_without_whatsapp_in_production(client, monkeypatch):
    monkeypatch.delenv("TEMUTANI_OTP_DEV")
    r = client.post("/api/auth/otp", json={"purpose": "reset_password", "phone": PHONES["petani"]})
    assert r.status_code == 503


def test_otp_is_sent_via_waha(client, monkeypatch):
    sent = []
    monkeypatch.setenv("WAHA_URL", "https://waha.example")
    from backend import wa

    monkeypatch.setattr(wa, "send_text", lambda phone, text: sent.append((phone, text)))
    r = client.post("/api/auth/otp", json={"purpose": "reset_password", "phone": PHONES["petani"]})
    assert r.status_code == 200 and "devCode" not in r.json()
    assert sent[0][0] == "+6281200000001" and "Kode verifikasi Temu Tani" in sent[0][1]
    assert wa.chat_id("+6281200000001") == "6281200000001@c.us"


# ---------------------------------------------------------------------------
# Stok
# ---------------------------------------------------------------------------
def add(client, H, volume, harvest):
    r = client.post("/api/stocks", headers=H, json={"volume": volume, "harvest": harvest})
    assert r.status_code == 200, r.text
    return r.json()["state"]


def test_add_stock_batches_and_history(client, login, sql):
    H = login("petani")
    add(client, H, 2200, "2026-11-04")
    add(client, H, 1800, "2026-11-05")
    st = add(client, H, 500, "2026-11-05")  # tanggal sama -> digabung
    assert [(b["harvest"], b["volume"]) for b in st["batches"]] == [("2026-11-04", 2200), ("2026-11-05", 2300)]
    assert st["stocks"][0]["volume"] == 4500 and st["stocks"][0]["harvest"] == "2026-11-05"
    assert [(x["activity"], x["harvest"], x["delta"], x["total"]) for x in st["stockLog"]] == [
        ("Tambah panen", "2026-11-05", 500, 4500), ("Tambah panen", "2026-11-05", 1800, 4000), ("Tambah panen", "2026-11-04", 2200, 2200)]
    assert sql("select source from stock_logs limit 1")[0]["source"] == "web"
    assert client.post("/api/stocks", headers=login("tengkulak"), json={"volume": 1, "harvest": "2026-11-05"}).status_code == 403
    assert client.post("/api/stocks", headers=H, json={"volume": 0, "harvest": "2026-11-05"}).status_code == 422


def test_update_remaining_per_harvest(client, login):
    H = login("petani")
    add(client, H, 1000, "2026-11-04")
    st = add(client, H, 5000, "2026-11-09")
    b4, b9 = (b["id"] for b in st["batches"])
    r = client.put("/api/stocks/remaining", headers=H, json={"items": [{"id": b4, "volume": 0}, {"id": b9, "volume": 4500}]})
    assert r.status_code == 200, r.text
    st = r.json()["state"]
    assert [(b["harvest"], b["volume"]) for b in st["batches"]] == [("2026-11-09", 4500)]  # batch habis tidak ditampilkan
    assert st["stocks"][0]["volume"] == 4500
    assert [(x["harvest"], x["delta"], x["total"]) for x in st["stockLog"][:2]] == [("2026-11-09", -500, 4500), ("2026-11-04", -1000, 5000)]
    # milik petani lain / format salah
    HC = login("petani_cianjur")
    assert client.put("/api/stocks/remaining", headers=HC, json={"items": [{"id": b9, "volume": 1}]}).status_code == 404
    assert client.put("/api/stocks/remaining", headers=H, json={"items": [{"id": "STK-1", "volume": 1}]}).status_code == 404
    assert client.put("/api/stocks/remaining", headers=H, json={"items": [{"id": b9, "volume": -1}]}).status_code == 422


def test_chatbot_stock_change_syncs_batches_and_history(client, login, sql):
    """Perubahan stok dari chatbot WA (langsung ke tabel stocks) tercermin di web."""
    H = login("petani")
    add(client, H, 1000, "2026-11-04")
    add(client, H, 2000, "2026-11-09")
    sql("update stocks set quantity_kg = 1800 where farmer_id = (select id from users where phone = %s)", (e164(PHONES["petani"]),))
    st = client.get("/api/state", headers=H).json()
    assert [(b["harvest"], b["volume"]) for b in st["batches"]] == [("2026-11-09", 1800)]  # FIFO: panen 4 Nov habis dulu
    assert st["stockLog"][0]["activity"] == "Update stok via WhatsApp" and st["stockLog"][0]["delta"] == -1200


# ---------------------------------------------------------------------------
# Penawaran & kesepakatan
# ---------------------------------------------------------------------------
def setup_stock(client, login):
    H = login("petani")
    add(client, H, 2000, "2026-11-04")
    st = add(client, H, 4000, "2026-11-09")
    return H, st["stocks"][0]["id"]


def test_tengkulak_sees_stock_but_not_ai_price(client, login):
    _, sid = setup_stock(client, login)
    T = login("tengkulak")
    s = client.get("/api/state", headers=T).json()
    assert [x["id"] for x in s["stocks"]] == [sid]
    assert s["farmers"][0]["name"] == "Pak Asep Hidayat" and "aiReference" not in s
    oid = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 1000, "price": 6800}).json()["id"]
    s = client.get("/api/state", headers=T).json()
    assert "aiRef" not in s["offers"][0] and s["offers"][0]["id"] == oid
    assert client.get("/api/prices", headers=T).status_code == 403


def test_full_negotiation_flow(client, login, sql):
    P, sid = setup_stock(client, login)
    T = login("tengkulak")
    r = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 3000, "price": 6800})
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    # request dibuat otomatis sesuai skema chatbot
    req = sql("select r.buyer_phone, r.kabupaten, r.need_kg, r.offered_kg from requests r join offers o on o.request_id = r.id where o.code = %s", (oid,))[0]
    assert (req["buyer_phone"], req["kabupaten"], req["need_kg"], req["offered_kg"]) == (e164(PHONES["tengkulak"]), "Garut", 3000, 3000)
    # petani melihat penawaran + harga AI dari price_predictions
    s = client.get("/api/state", headers=P).json()
    assert s["aiReference"] == {"GKP": 6900}
    o = s["offers"][0]
    assert (o["status"], o["currentBid"], o["aiRef"]) == ("Menunggu Petani", 6800, 6900)
    assert s["buyers"][0]["label"] == "Pak Budi Santoso" and s["buyers"][0]["id"] == o["buyerId"]
    # harga balik petani, tengkulak tawar lagi, petani setuju
    assert client.post(f"/api/offers/{oid}/counter", headers=P, json={"price": 6700}).status_code == 400
    assert client.post(f"/api/offers/{oid}/counter", headers=P, json={"price": 7200}).status_code == 200
    assert client.post(f"/api/offers/{oid}/counter", headers=T, json={"price": 6000}).status_code == 400
    assert client.post(f"/api/offers/{oid}/counter", headers=T, json={"price": 7000}).status_code == 200
    r = client.post(f"/api/offers/{oid}/accept", headers=P)
    assert r.status_code == 200, r.text
    st = r.json()["state"]
    assert st["offers"][0]["status"] == "Disepakati" and st["offers"][0]["agreedPrice"] == 7000
    assert [h["label"] for h in st["offers"][0]["history"]] == ["Penawaran awal dikirim", "Harga balik diajukan", "Penawaran baru diajukan", "Harga disepakati"]
    # stok berkurang FIFO + riwayat
    assert st["stocks"][0]["volume"] == 3000
    assert [(b["harvest"], b["volume"]) for b in st["batches"]] == [("2026-11-09", 3000)]
    assert st["stockLog"][0]["activity"] == f"Terjual via Temu Tani ({oid})" and st["stockLog"][0]["delta"] == -3000
    # kesepakatan + kontak
    trx = st["transactions"][0]
    assert trx["price"] == 7000 and trx["contact"] == PHONES["tengkulak"]
    assert client.get("/api/state", headers=T).json()["transactions"][0]["contact"] is None  # petani belum izinkan berbagi nomor
    client.put("/api/auth/profile", headers=P, json={"name": "Pak Asep Hidayat", "region": "Garut", "district": "Tarogong Kidul", "shareContact": True})
    assert client.get("/api/state", headers=T).json()["transactions"][0]["contact"] == PHONES["petani"]


def test_buyer_accepts_counter(client, login):
    P, sid = setup_stock(client, login)
    T = login("tengkulak")
    oid = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 1000, "price": 6800}).json()["id"]
    client.post(f"/api/offers/{oid}/counter", headers=P, json={"price": 7100})
    st = client.get("/api/state", headers=T).json()
    assert st["offers"][0]["status"] == "Penawaran Balik" and st["offers"][0]["counter"] == 7100
    r = client.post(f"/api/offers/{oid}/accept-counter", headers=T)
    assert r.status_code == 200 and r.json()["state"]["transactions"][0]["price"] == 7100


def test_reject_and_ownership(client, login):
    P, sid = setup_stock(client, login)
    T = login("tengkulak")
    oid = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 1000, "price": 6800}).json()["id"]
    assert client.post(f"/api/offers/{oid}/accept", headers=login("petani_cianjur")).status_code == 404
    assert client.post(f"/api/offers/{oid}/counter", headers=login("tengkulak2"), json={"price": 7000}).status_code == 404
    assert client.get("/api/state", headers=login("tengkulak2")).json()["offers"] == []
    assert client.post(f"/api/offers/{oid}/reject", headers=P).status_code == 200
    assert client.post(f"/api/offers/{oid}/accept", headers=P).status_code == 409
    assert client.get("/api/state", headers=T).json()["offers"][0]["status"] == "Ditolak"


def test_offer_validation(client, login):
    _, sid = setup_stock(client, login)
    T = login("tengkulak")
    r = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 999999, "price": 7000})
    assert r.status_code == 409 and "melebihi stok" in r.json()["detail"]
    assert client.post("/api/offers", headers=T, json={"stockId": "STK-999", "volume": 1, "price": 7000}).status_code == 409
    assert client.post("/api/offers", headers=T, json={"stockId": "abc", "volume": 1, "price": 7000}).status_code == 404
    assert client.post("/api/offers", headers=login("petani"), json={"stockId": sid, "volume": 1, "price": 7000}).status_code == 403
    assert client.post("/api/requests", headers=T, json={}).status_code == 404  # fitur permintaan tidak ada di web


def test_accept_fails_when_stock_reduced(client, login):
    P, sid = setup_stock(client, login)  # 6.000 kg
    T = login("tengkulak")
    oid = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 5000, "price": 7000}).json()["id"]
    st = client.get("/api/state", headers=P).json()
    client.put("/api/stocks/remaining", headers=P, json={"items": [{"id": b["id"], "volume": 1000} for b in st["batches"]]})
    r = client.post(f"/api/offers/{oid}/accept", headers=P)
    assert r.status_code == 409 and "Stok sudah berkurang" in r.json()["detail"]
    o = client.get("/api/state", headers=P).json()["offers"][0]
    assert o["status"] == "Ditolak" and o["history"][-1]["label"].startswith("Stok tidak mencukupi")


def test_prices_locked_to_farmer_region_and_follow_database(client, login):
    r = client.get("/api/prices", headers=login("petani_cianjur")).json()
    assert r["lockedArea"] == "Cianjur" and list(r["regions"]) == ["Cianjur"]
    assert r["regions"]["Cianjur"]["current"] == 6950


def test_admin_dashboard_uses_real_data(client, login):
    P, sid = setup_stock(client, login)
    T = login("tengkulak")
    oid = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": 1000, "price": 6800}).json()["id"]
    client.post(f"/api/offers/{oid}/accept", headers=P)
    d = client.get("/api/admin/dashboard", headers=login("admin")).json()
    stock = next(s for s in d["stocks"] if s["id"] == sid)
    assert stock["farmer"] == "Pak Asep Hidayat" and stock["volume"] == 5000 and stock["offers"] == 1
    assert d["offers"][0]["id"] == oid and d["offers"][0]["status"] == "Disetujui" and d["offers"][0]["buyer"] == "Pak Budi Santoso"
    assert d["transactions"][0]["price"] == 6800 and d["transactions"][0]["location"] == "Garut"
    assert any(e["kind"] == "Stok" for e in d["events"]) and any(e["kind"] == "Negosiasi" for e in d["events"])


def test_version_changes_on_mutation(client, login):
    v1 = client.get("/api/state/version").json()["version"]
    add(client, login("petani"), 100, "2026-11-20")
    assert client.get("/api/state/version").json()["version"] > v1
