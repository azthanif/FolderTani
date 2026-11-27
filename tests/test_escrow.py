"""Tes escrow (PRD "Escrow Temu Tani: Konfirmasi Pembayaran & Penerimaan"): satu transaksi berjalan dari deal sampai
dana cair, berpindah kanal web <-> WhatsApp (n8n), dengan Xendit di-mock."""
from __future__ import annotations

import pytest

from conftest import PHONES

SERVICE = "token-layanan-uji"
CB = "token-callback-uji"


def e164(local: str) -> str:
    return "+62" + local[1:]


class FakeXendit:
    """Pengganti API Xendit: menyimpan invoice/disbursement dan statusnya (untuk cek ulang setelah callback)."""

    def __init__(self):
        self.invoices: dict[str, dict] = {}
        self.disb: dict[str, dict] = {}
        self.fail_invoice = False
        self.lose_response = False  # disbursement dibuat di Xendit tetapi respons hilang (timeout)

    def create_invoice(self, external_id, amount, description, duration_seconds, success_redirect_url=None):
        from backend import xendit
        if self.fail_invoice:
            raise xendit.XenditError("down", "NETWORK_ERROR")
        iid = f"inv{len(self.invoices) + 1}"
        self.invoices[iid] = {"id": iid, "external_id": external_id, "amount": amount, "status": "PENDING",
                              "invoice_url": f"https://checkout-staging.xendit.co/web/{iid}", "expiry_date": "2026-11-28T07:00:00.000Z",
                              "duration": duration_seconds}
        return dict(self.invoices[iid])

    def get_invoice(self, iid):
        return dict(self.invoices[iid])

    def create_disbursement(self, external_id, amount, bank_code, account_holder_name, account_number, description):
        from backend import xendit
        same = [d for d in self.disb.values() if d["external_id"] == external_id]  # idempotency key
        if same:
            return dict(same[0])
        did = f"disb{len(self.disb) + 1}"
        self.disb[did] = {"id": did, "external_id": external_id, "amount": amount, "status": "PENDING", "account_number": account_number}
        if self.lose_response:
            raise xendit.XenditError("timeout", "NETWORK_ERROR")
        return dict(self.disb[did])

    def find_disbursements(self, external_id):
        return [dict(d) for d in self.disb.values() if d["external_id"] == external_id]

    def get_disbursement(self, did):
        return dict(self.disb[did])


@pytest.fixture()
def gw(client, sql, monkeypatch):
    from backend import xendit
    fake = FakeXendit()
    monkeypatch.setenv("XENDIT_SECRET_KEY", "xnd_development_uji")
    monkeypatch.setenv("XENDIT_CALLBACK_TOKEN", CB)
    monkeypatch.setenv("TEMUTANI_SERVICE_TOKEN", SERVICE)
    monkeypatch.delenv("TEMUTANI_PAYMENT_MOCK", raising=False)
    monkeypatch.delenv("N8N_ESCROW_WEBHOOK_URL", raising=False)
    for name in ("create_invoice", "get_invoice", "create_disbursement", "get_disbursement", "find_disbursements"):
        monkeypatch.setattr(xendit, name, getattr(fake, name))
    sql("create table if not exists chat_sessions (phone text primary key, step text, context jsonb not null default '{}'::jsonb,"
        " updated_at timestamptz not null default now())")
    sql("truncate chat_sessions")
    sql("insert into akun_pencairan_petani (petani_id, kode_bank, nama_pemilik, nomor_akun)"
        " select id, 'BCA', 'Asep Hidayat', '1234567890' from users where phone = %s", (e164(PHONES["petani"]),))
    return fake


def wa(phone_key: str) -> dict:
    return {"X-Service-Token": SERVICE, "X-WA-Phone": PHONES[phone_key]}


def deal(client, login, volume=2000, price=6500, pengambilan="ambil_sendiri"):
    """Deal di web lalu tengkulak memilih cara pengambilan (PRD delivery) agar invoice terbit.
    pengambilan=None: berhenti sebelum memilih (escrow menunggu pilihan, belum ada invoice)."""
    P = login("petani")
    client.post("/api/stocks", headers=P, json={"volume": 6000, "harvest": "2026-11-09"})
    T = login("tengkulak")
    sid = client.get("/api/state", headers=P).json()["stocks"][0]["id"]
    oid = client.post("/api/offers", headers=T, json={"stockId": sid, "volume": volume, "price": price}).json()["id"]
    r = client.post(f"/api/offers/{oid}/accept", headers=P)
    assert r.status_code == 200, r.text
    trx = r.json()["state"]["transactions"][0]
    if pengambilan:
        r = client.post(f"/api/escrow/{trx['escrowId']}/pengambilan", headers=T, json={"pengambilan": pengambilan})
        assert r.status_code == 200, r.text
    return P, T, oid, trx


def callback(client, path, body, token=CB):
    return client.post(f"/api/webhooks/xendit/{path}", json=body, headers={"x-callback-token": token})


def pay(client, gw, escrow_id, status="PAID"):
    inv = next(i for i in gw.invoices.values() if i["external_id"] == escrow_id)
    inv["status"] = status
    return callback(client, "invoice", {"id": inv["id"], "external_id": escrow_id, "status": status})


def finish_disb(client, gw, status="COMPLETED"):
    d = list(gw.disb.values())[-1]
    d["status"] = status
    body = {"id": d["id"], "external_id": d["external_id"], "status": status}
    if status == "FAILED":
        body["failure_code"] = "INVALID_DESTINATION"
    return callback(client, "disbursement", body)


# ---------------------------------------------------------------------------
def test_deal_creates_escrow_and_invoice(client, login, sql, gw):
    P, T, oid, trx = deal(client, login)
    assert trx["escrowStatus"] == "MENUNGGU_BAYAR" and trx["escrowLabel"] == "Menunggu Pembayaran"
    eid = trx["escrowId"]
    assert trx["escrowUpdated"]  # dipakai web untuk mengurutkan dari tanggal terbaru
    inv = list(gw.invoices.values())[0]
    # tagihan = nilai gabah + fee 0,5% (ambil sendiri, tanpa logistik)
    assert inv["external_id"] == eid and inv["amount"] == 13_065_000 and inv["duration"] == 24 * 3600
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    assert d["nilai"] == 13_000_000 and d["harga_per_kg"] == 6500 and d["berat_kg"] == 2000
    assert d["aksi_tersedia"] == ["bayar"] and d["invoice_url"].endswith("/inv1")
    assert d["riwayat"][0]["ke_status"] == "MENUNGGU_BAYAR" and "kontak" not in d
    p = client.get(f"/api/escrow/{eid}", headers=P).json()
    assert p["aksi_tersedia"] == [] and "invoice_url" not in p
    # idempoten: POST /api/escrow untuk offer yang sama tidak membuat escrow/invoice baru
    r = client.post("/api/escrow", headers=wa("petani"), json={"offer_id": oid, "notify": False})
    assert r.status_code == 201 and r.json()["baru"] is False and r.json()["id"] == eid
    assert len(gw.invoices) == 1 and sql("select count(*) as n from escrow_transaksi")[0]["n"] == 1


def test_full_flow_switching_channels(client, login, sql, gw):
    """Bayar (webhook) -> petani konfirmasi kirim lewat WA -> tengkulak konfirmasi terima lewat web -> COMPLETED."""
    P, T, oid, trx = deal(client, login)
    eid = trx["escrowId"]
    assert pay(client, gw, eid).json() == {"ok": True, "changed": True}
    assert client.get("/api/state", headers=T).json()["transactions"][0]["escrowStatus"] == "DIBAYAR"
    # chatbot: daftar transaksi + aksi bernomor dari aksi_tersedia
    lst = client.get("/api/escrow", headers=wa("petani")).json()["items"]
    assert lst[0]["kode"] == trx["offerId"].replace("OFF", "ESC") and lst[0]["aksi_tersedia"] == ["konfirmasi-kirim"]
    assert lst[0]["kontak"] == PHONES["tengkulak"]  # kontak dibagikan setelah dana aman
    r = client.post(f"/api/escrow/{lst[0]['kode']}/konfirmasi-kirim", headers=wa("petani"))
    assert r.status_code == 200 and r.json()["status"] == "DIKIRIM" and r.json()["berubah"] is True
    # web tengkulak langsung melihat DIKIRIM
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    assert d["status"] == "DIKIRIM" and d["aksi_tersedia"] == ["konfirmasi-terima", "lapor-masalah"]
    r = client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    assert r.status_code == 200 and r.json()["status"] == "DITERIMA"
    assert len(gw.disb) == 1 and gw.disb["disb1"]["amount"] == 13_000_000 and gw.disb["disb1"]["external_id"] == f"{eid}-1"
    assert finish_disb(client, gw).json()["changed"] is True
    d = client.get(f"/api/escrow/{eid}", headers=P).json()
    assert d["status"] == "SELESAI" and d["selesai_pada"]
    ev = sql("select dari_status::text as d, ke_status::text as k, pelaku, kanal from escrow_event where escrow_id = %s order by id", (eid,))
    assert [(e["d"], e["k"], e["pelaku"], e["kanal"]) for e in ev] == [
        (None, "MENUNGGU_BAYAR", "sistem", "web"),
        ("MENUNGGU_BAYAR", "MENUNGGU_BAYAR", "tengkulak", "web"),  # pilih pengambilan (biaya dikunci)
        ("MENUNGGU_BAYAR", "DIBAYAR", "xendit", "webhook"),
        ("DIBAYAR", "DIKIRIM", "petani", "whatsapp"),
        ("DIKIRIM", "DITERIMA", "tengkulak", "web"),
        ("DITERIMA", "DITERIMA", "sistem", "sistem"),  # disbursement dibuat
        ("DITERIMA", "SELESAI", "xendit", "webhook"),
    ]


def test_double_confirmation_is_idempotent(client, login, gw):
    P, T, oid, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    assert client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T).json()["berubah"] is True
    r = client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=wa("tengkulak"))
    assert r.status_code == 200 and r.json()["berubah"] is False and r.json()["status"] == "DITERIMA"
    assert len(gw.disb) == 1  # tidak ada pencairan kedua
    # callback ganda juga idempoten
    assert pay(client, gw, eid).json()["changed"] is False
    finish_disb(client, gw)
    assert finish_disb(client, gw).json()["changed"] is False


def test_wrong_party_rejected(client, login, gw):
    P, T, oid, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    assert client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=T).status_code == 403          # tengkulak bukan pengirim
    assert client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=wa("petani")).status_code == 403  # petani via WA
    assert client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T).status_code == 409          # belum DIKIRIM
    assert client.get(f"/api/escrow/{eid}", headers=login("tengkulak2")).status_code == 404           # bukan pihak terkait
    assert client.get(f"/api/escrow/{eid}", headers=wa("petani_cianjur")).status_code == 404
    assert client.get("/api/escrow", headers=login("tengkulak2")).json()["items"] == []
    # token layanan salah / nomor tak terdaftar
    assert client.get("/api/escrow", headers={"X-Service-Token": "salah", "X-WA-Phone": PHONES["petani"]}).status_code == 401
    assert client.get("/api/escrow", headers={"X-Service-Token": SERVICE, "X-WA-Phone": "081299999999"}).status_code == 403
    assert client.get("/api/escrow", headers={"X-Service-Token": SERVICE, "X-WA-Phone": PHONES["wa_farmer"]}).status_code == 200
    assert client.get("/api/escrow", headers={"X-Service-Token": SERVICE, "X-WA-Phone": PHONES["admin"]}).status_code == 403
    assert client.get("/api/escrow").status_code == 401


def test_webhook_with_bad_token_rejected(client, login, gw):
    _, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    inv = list(gw.invoices.values())[0]
    inv["status"] = "PAID"
    assert callback(client, "invoice", {"id": inv["id"], "external_id": eid, "status": "PAID"}, token="palsu").status_code == 401
    assert client.post("/api/webhooks/xendit/invoice", json={"id": inv["id"], "external_id": eid}).status_code == 401
    assert client.get(f"/api/escrow/{eid}", headers=T).json()["status"] == "MENUNGGU_BAYAR"


def test_webhook_payload_is_rechecked_with_api(client, login, gw):
    """Payload bilang PAID tapi API Xendit masih PENDING -> status tidak berubah (pertahanan lapis kedua)."""
    _, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    inv = list(gw.invoices.values())[0]
    r = callback(client, "invoice", {"id": inv["id"], "external_id": eid, "status": "PAID"})
    assert r.json()["changed"] is False
    assert client.get(f"/api/escrow/{eid}", headers=T).json()["status"] == "MENUNGGU_BAYAR"
    # invoice milik escrow lain / tak dikenal diabaikan
    assert callback(client, "invoice", {"id": "invX", "external_id": eid, "status": "PAID"}).json()["ok"] is False


def test_invoice_expired(client, login, gw):
    P, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    assert pay(client, gw, eid, "EXPIRED").json()["changed"] is True
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    assert d["status"] == "KEDALUWARSA" and d["aksi_tersedia"] == []
    assert client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P).status_code == 409


def test_disbursement_failure_and_admin_retry(client, login, gw):
    P, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    finish_disb(client, gw, "FAILED")
    A = login("admin")
    d = client.get(f"/api/escrow/{eid}", headers=A).json()
    assert d["status"] == "PENCAIRAN_GAGAL" and d["pencairan_gagal_kode"] == "INVALID_DESTINATION"
    assert d["aksi_tersedia"] == ["cairkan-ulang"]
    assert client.post(f"/api/escrow/{eid}/cairkan-ulang", headers=T).status_code == 403
    r = client.post(f"/api/escrow/{eid}/cairkan-ulang", headers=A)
    assert r.status_code == 200 and r.json()["status"] == "DITERIMA"
    assert len(gw.disb) == 2 and gw.disb["disb2"]["external_id"] == f"{eid}-2"
    # callback terlambat dari disbursement pertama diabaikan
    assert callback(client, "disbursement", {"id": "disb1", "external_id": f"{eid}-1", "status": "COMPLETED"}).json()["ok"] is False
    finish_disb(client, gw)
    assert client.get(f"/api/escrow/{eid}", headers=A).json()["status"] == "SELESAI"
    lst = client.get("/api/escrow?status=SELESAI", headers=A).json()
    assert len(lst["items"]) == 1 and lst["counts"] == {"SELESAI": 1}


def test_missing_payout_account_goes_to_pencairan_gagal(client, login, sql, gw):
    P, T, _, trx = deal(client, login)
    sql("delete from akun_pencairan_petani")
    eid = trx["escrowId"]
    pay(client, gw, eid)
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    d = client.get(f"/api/escrow/{eid}", headers=login("admin")).json()
    assert d["status"] == "PENCAIRAN_GAGAL" and d["pencairan_gagal_kode"] == "AKUN_PENCAIRAN_BELUM_ADA" and not gw.disb


def test_report_problem_blocks_payout(client, login, gw):
    P, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    assert client.post(f"/api/escrow/{eid}/lapor-masalah", headers=T, json={"catatan": "x"}).status_code == 422
    r = client.post(f"/api/escrow/{eid}/lapor-masalah", headers=wa("tengkulak"), json={"catatan": "Berat kurang  300 kg"})
    assert r.status_code == 200 and r.json()["status"] == "SENGKETA" and r.json()["catatan_masalah"] == "Berat kurang 300 kg"
    assert not gw.disb
    assert client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T).status_code == 409
    A = login("admin")
    assert client.get(f"/api/escrow/{eid}", headers=A).json()["aksi_tersedia"] == ["selesaikan-sengketa"]
    assert client.post(f"/api/escrow/{eid}/selesaikan-sengketa", headers=A).json()["status"] == "DITERIMA"
    assert len(gw.disb) == 1


def test_audit_log_is_append_only(client, login, sql, gw):
    import psycopg
    deal(client, login)
    with pytest.raises(psycopg.errors.RaiseException):
        sql("update escrow_event set kanal = 'web'")
    with pytest.raises(psycopg.errors.RaiseException):
        sql("delete from escrow_event")


def test_invoice_failure_can_be_retried(client, login, gw):
    gw.fail_invoice = True
    _, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    d = client.get(f"/api/escrow/{eid}", headers=T).json()
    assert d["status"] == "MENUNGGU_BAYAR" and d["aksi_tersedia"] == ["buat-invoice"]
    assert client.post(f"/api/escrow/{eid}/buat-invoice", headers=T).status_code == 502
    gw.fail_invoice = False
    assert client.post(f"/api/escrow/{eid}/buat-invoice", headers=T).json()["aksi_tersedia"] == ["bayar"]


def test_admin_reconciliation_pulls_status(client, login, gw):
    _, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    list(gw.invoices.values())[0]["status"] = "PAID"  # callback terlewat
    assert client.post(f"/api/escrow/{eid}/rekonsiliasi", headers=T).status_code == 403
    assert client.post(f"/api/escrow/{eid}/rekonsiliasi", headers=login("admin")).json()["status"] == "DIBAYAR"


def test_wa_notifications_and_chat_session(client, login, sql, gw, monkeypatch):
    """Tanpa webhook n8n: notifikasi dikirim langsung via WAHA; sesi chat diarahkan ke alur escrow."""
    from backend import wa as wamod
    texts, polls = [], []
    monkeypatch.setenv("WAHA_URL", "https://waha.example")
    monkeypatch.setattr(wamod, "send_text", lambda phone, text: texts.append((phone, text)))
    monkeypatch.setattr(wamod, "send_poll", lambda phone, name, options: polls.append((phone, name, options)) or "POLL1")
    P, T, oid, trx = deal(client, login)
    eid = trx["escrowId"]
    tk, pt = e164(PHONES["tengkulak"]), e164(PHONES["petani"])
    to_t = [t for p, t in texts if p == tk]
    assert "checkout-staging.xendit.co" in to_t[-1] and "Kontak WhatsApp petani" not in to_t[-1]
    assert "Menunggu tengkulak memilih cara pengambilan" in [t for p, t in texts if p == pt][-1]
    assert "Total tagihan: *Rp13.065.000*" in to_t[-1]
    pay(client, gw, eid)
    assert [x for x in polls if x[0] == pt][-1][2][0] == "1. Gabah sudah dikirim"
    row = sql("select step, context from chat_sessions where phone = %s", (pt,))[0]
    assert row["step"] == "escrow_action" and row["context"]["escrow_id"] == eid and row["context"]["actions"] == ["konfirmasi-kirim"]
    assert row["context"]["poll_id"] == "POLL1"
    # petani konfirmasi lewat WA: petani tidak dikirimi notifikasi ganda, tengkulak dapat poll terima/masalah
    n_before = len([1 for p, _ in texts if p == pt])
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=wa("petani"))
    assert len([1 for p, _ in texts if p == pt]) == n_before
    assert polls[-1][0] == tk and polls[-1][2][:2] == ["1. Sudah diterima", "2. Ada masalah"]


def test_notifications_go_to_n8n_when_configured(client, login, gw, monkeypatch):
    from backend import escrow
    sent = []
    monkeypatch.setenv("N8N_ESCROW_WEBHOOK_URL", "https://n8n.example/webhook/escrow")
    monkeypatch.setenv("N8N_ESCROW_WEBHOOK_TOKEN", "rahasia-keluar")
    monkeypatch.setattr(escrow, "_deliver_n8n", lambda url, body: sent.append(body) or True)
    _, _, _, trx = deal(client, login)
    assert sent[0]["event"] == "MENUNGGU_BAYAR" and sent[0]["escrow_id"] == trx["escrowId"]
    assert {m["chatId"] for m in sent[0]["messages"]} == {e164(PHONES["tengkulak"])[1:] + "@c.us", e164(PHONES["petani"])[1:] + "@c.us"}
    assert sent[0]["messages"][0]["poll"]["options"][:2] == ["1. Ambil sendiri", "2. Diantar"]
    # setelah memilih di web: tagihan hanya dikirim ke tengkulak
    assert len(sent) == 2 and [m["chatId"] for m in sent[1]["messages"]] == [e164(PHONES["tengkulak"])[1:] + "@c.us"]


def test_mock_mode_simulation(client, login, monkeypatch, sql, gw):
    from backend import xendit
    monkeypatch.setenv("TEMUTANI_PAYMENT_MOCK", "1")
    import importlib
    importlib.reload(xendit)
    try:
        _, T, _, trx = deal(client, login)
        eid = trx["escrowId"]
        d = client.get(f"/api/escrow/{eid}", headers=T).json()
        assert "/api/escrow/checkout/" in d["invoice_url"]
        A = login("admin")
        assert client.post(f"/api/escrow/{eid}/simulasi", headers=T, json={"event": "PAID"}).status_code == 403
        assert client.post(f"/api/escrow/{eid}/simulasi", headers=A, json={"event": "PAID"}).json()["status"] == "DIBAYAR"
    finally:
        monkeypatch.delenv("TEMUTANI_PAYMENT_MOCK")
        importlib.reload(xendit)


def _to_diterima(client, login, gw):
    P, T, oid, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    return P, T, eid


def test_lost_disbursement_response_never_pays_twice(client, login, sql, gw):
    """Xendit membuat disbursement tetapi respons hilang: status tetap DITERIMA (bukan gagal), konfirmasi/rekonsiliasi
    berulang tidak membuat disbursement kedua, dan callback yang datang belakangan tetap diterima."""
    P, T, eid = _to_diterima(client, login, gw)
    gw.lose_response = True
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    A = login("admin")
    d = client.get(f"/api/escrow/{eid}", headers=A).json()
    assert d["status"] == "DITERIMA" and d["disbursement_id"] == f"PENDING:{eid}-1" and len(gw.disb) == 1
    gw.lose_response = False
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)                  # idempoten
    assert client.post(f"/api/escrow/{eid}/rekonsiliasi", headers=A).status_code == 200  # menemukan disbursement yang sama
    assert len(gw.disb) == 1
    assert client.get(f"/api/escrow/{eid}", headers=A).json()["disbursement_id"] == "disb1"
    finish_disb(client, gw)
    assert client.get(f"/api/escrow/{eid}", headers=A).json()["status"] == "SELESAI"


def test_early_callback_while_pending_is_accepted(client, login, gw):
    P, T, eid = _to_diterima(client, login, gw)
    gw.lose_response = True
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    r = finish_disb(client, gw)  # callback COMPLETED sebelum id disbursement tersimpan
    assert r.json() == {"ok": True, "changed": True}
    d = client.get(f"/api/escrow/{eid}", headers=login("admin")).json()
    assert d["status"] == "SELESAI" and d["disbursement_id"] == "disb1"


def test_reconcile_resends_with_same_key_when_not_found(client, login, sql, gw):
    P, T, eid = _to_diterima(client, login, gw)
    gw.lose_response = True
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    gw.disb.clear()  # Xendit ternyata tidak menerima permintaan
    gw.lose_response = False
    client.post(f"/api/escrow/{eid}/rekonsiliasi", headers=login("admin"))
    assert [d["external_id"] for d in gw.disb.values()] == [f"{eid}-1"]


def test_buyer_without_active_account_can_confirm_via_wa(client, login, sql, gw):
    P, T, eid = _to_diterima(client, login, gw)
    sql("update users set status = 'rejected' where phone = %s", (e164(PHONES["tengkulak"]),))
    r = client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=wa("tengkulak"))
    assert r.status_code == 200 and r.json()["status"] == "DITERIMA"
    # tetap tidak bisa melihat escrow orang lain
    assert client.get("/api/escrow", headers=wa("tengkulak")).json()["items"][0]["id"] == eid


def test_invoice_callback_when_invoice_id_not_saved(client, login, sql, gw):
    _, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    sql("update escrow_transaksi set invoice_id = null where id = %s", (eid,))
    gw.invoices["inv1"]["status"] = "PAID"
    assert callback(client, "invoice", {"id": "inv1", "external_id": eid, "status": "PAID"}).json()["changed"] is True
    assert sql("select invoice_id from escrow_transaksi where id = %s", (eid,))[0]["invoice_id"] == "inv1"
    # invoice milik escrow lain tidak diterima
    sql("update escrow_transaksi set invoice_id = null, status = 'MENUNGGU_BAYAR' where id = %s", (eid,))
    gw.invoices["inv9"] = {"id": "inv9", "external_id": "lain", "status": "PAID"}
    assert callback(client, "invoice", {"id": "inv9", "external_id": eid, "status": "PAID"}).json()["ok"] is False


def test_n8n_webhook_requires_separate_token(client, login, gw, monkeypatch):
    from backend import escrow
    sent = []
    monkeypatch.setenv("N8N_ESCROW_WEBHOOK_URL", "https://n8n.example/webhook/escrow")
    monkeypatch.delenv("N8N_ESCROW_WEBHOOK_TOKEN", raising=False)
    monkeypatch.setattr(escrow, "_deliver_n8n", lambda url, body: sent.append(body) or True)
    deal(client, login)
    assert sent == []  # tanpa rahasia keluar: kirim langsung via WAHA (cadangan)


def test_mock_checkout_page_and_auto_disbursement(client, login, monkeypatch, sql, gw):
    """Mode simulasi: tautan bayar = halaman checkout backend tanpa login (token), pencairan selesai otomatis."""
    from backend import xendit
    import importlib
    monkeypatch.setenv("TEMUTANI_PAYMENT_MOCK", "1")
    importlib.reload(xendit)
    try:
        sql("delete from akun_pencairan_petani")  # simulasi tidak butuh akun pencairan
        P, T, _, trx = deal(client, login)
        eid = trx["escrowId"]
        url = client.get(f"/api/escrow/{eid}", headers=T).json()["invoice_url"]
        assert f"/api/escrow/checkout/{eid}?t=" in url
        path = url[url.index("/api/"):]
        page = client.get(path)
        assert page.status_code == 200 and "MODE SIMULASI" in page.text and "21.300.000" not in page.text
        assert client.get(f"/api/escrow/checkout/{eid}?t=salah").status_code == 404
        assert client.post(f"/api/escrow/checkout/{eid}?t=salah").status_code == 404
        r = client.post(path)
        assert r.status_code == 200 and "Pembayaran berhasil" in r.text
        assert client.get(f"/api/escrow/{eid}", headers=T).json()["status"] == "DIBAYAR"
        assert "Pembayaran berhasil" not in client.post(path).text  # bayar ulang tidak mengubah apa pun
        client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
        client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
        assert client.get(f"/api/escrow/{eid}", headers=P).json()["status"] == "SELESAI"
    finally:
        monkeypatch.delenv("TEMUTANI_PAYMENT_MOCK")
        importlib.reload(xendit)


def test_checkout_disabled_without_mock(client, login, gw):
    _, T, _, trx = deal(client, login)
    from backend import escrow
    assert client.get(escrow.checkout_url(trx["escrowId"]).split("api.temutani.web.id")[1]).status_code == 404


def test_escrow_changes_appear_in_activity_feed(client, login, gw):
    P, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    acts_p = client.get("/api/state", headers=P).json()["activities"]
    acts_t = client.get("/api/state", headers=T).json()["activities"]
    k = trx["offerId"].replace("OFF", "ESC")
    assert acts_p[0]["title"] == f"Pembayaran masuk escrow {k}" and "13.000.000" in acts_p[0]["note"]
    assert acts_t[0]["title"] == f"Pembayaran masuk escrow {k}"
    assert any(a["title"] == f"Escrow dibuat {k}" for a in acts_t)
    assert client.get("/api/state", headers=login("tengkulak2")).json()["activities"] == []


def test_n8n_payload_carries_waha_session(client, login, gw, monkeypatch):
    from backend import escrow
    sent = []
    monkeypatch.setenv("N8N_ESCROW_WEBHOOK_URL", "https://n8n.example/webhook/escrow")
    monkeypatch.setenv("N8N_ESCROW_WEBHOOK_TOKEN", "x")
    monkeypatch.setenv("WAHA_SESSION", "session_abc")
    monkeypatch.setattr(escrow, "_deliver_n8n", lambda url, body: sent.append(body) or True)
    deal(client, login)
    assert sent[-1]["session"] == "session_abc"


def test_payouts_v2_webhook_envelope(client, login, gw):
    """Akun Xendit baru memakai Payouts v2: callback {event, data: {id, reference_id, status}}."""
    P, T, eid = _to_diterima(client, login, gw)
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    d = list(gw.disb.values())[-1]
    d["status"] = "SUCCEEDED"
    body = {"event": "payout.succeeded", "business_id": "x", "data": {"id": d["id"], "reference_id": d["external_id"], "status": "SUCCEEDED"}}
    assert callback(client, "disbursement", body).json() == {"ok": True, "changed": True}
    assert client.get(f"/api/escrow/{eid}", headers=P).json()["status"] == "SELESAI"


def test_xendit_test_and_save_dummy_payload_is_acknowledged(client, gw):
    """Tombol 'Test and save' di dashboard Xendit mengirim contoh payload: dibalas 200 tanpa mengubah apa pun."""
    assert callback(client, "invoice", {"id": "579c8d61f23fa4ca35e52da4", "external_id": "invoice_123124123", "status": "PAID"}).status_code == 200
    assert callback(client, "disbursement", {"event": "payout.succeeded", "data": {"id": "disb-1", "reference_id": "myref-1", "status": "SUCCEEDED"}}).status_code == 200


def test_payout_request_shape(monkeypatch):
    from backend import xendit
    seen = {}
    monkeypatch.delenv("TEMUTANI_PAYMENT_MOCK", raising=False)
    monkeypatch.setattr(xendit, "_request", lambda method, path, payload=None, headers=None, timeout=15.0:
                        seen.update(method=method, path=path, payload=payload, headers=headers) or {"id": "disb-9", "reference_id": payload["reference_id"], "status": "ACCEPTED"})
    out = xendit.create_disbursement("abc-1", 6000, "BCA", "Asep", "123", "Pencairan escrow")
    assert seen["path"] == "/v2/payouts" and seen["headers"] == {"Idempotency-key": "abc-1"}
    assert seen["payload"]["channel_code"] == "ID_BCA" and seen["payload"]["channel_properties"] == {"account_holder_name": "Asep", "account_number": "123"}
    assert out["external_id"] == "abc-1" and xendit.channel_code("ID_DANA") == "ID_DANA"


def test_final_notifications_return_chat_to_main_menu(client, login, sql, gw, monkeypatch):
    """Pesan tanpa tindakan lanjutan (mis. transaksi selesai) mengembalikan sesi chat ke menu utama + poll menu."""
    from backend import wa as wamod
    polls = []
    monkeypatch.setenv("WAHA_URL", "https://waha.example")
    monkeypatch.setattr(wamod, "send_text", lambda phone, text: None)
    monkeypatch.setattr(wamod, "send_poll", lambda phone, name, options: polls.append((phone, options)) or "POLL9")
    P, T, _, trx = deal(client, login)
    eid = trx["escrowId"]
    pay(client, gw, eid)
    tk, pt = e164(PHONES["tengkulak"]), e164(PHONES["petani"])
    # tengkulak tidak punya tindakan saat DIBAYAR: sesinya kembali ke menu utama
    assert sql("select step from chat_sessions where phone = %s", (tk,))[0]["step"] is None
    assert polls[-1] == (tk, ["1. Lihat stok gabah", "2. Ajukan penawaran", "3. Status penawaran saya", "4. Transaksi saya"])
    client.post(f"/api/escrow/{eid}/konfirmasi-kirim", headers=P)
    client.post(f"/api/escrow/{eid}/konfirmasi-terima", headers=T)
    finish_disb(client, gw)
    for ph in (tk, pt):
        row = sql("select step, context from chat_sessions where phone = %s", (ph,))[0]
        assert row["step"] is None and set(row["context"]) <= {"poll_id"}  # hanya id poll menu, tanpa konteks escrow
    assert polls[-1][1][0] in ("1. Update stok gabah", "1. Lihat stok gabah")
