"""Escrow Temu Tani: konfirmasi pembayaran (Xendit) dan penerimaan (petani + tengkulak), web + WhatsApp.

FastAPI adalah satu-satunya penulis tabel escrow (db/migrations/006_escrow.sql). Web memanggil dengan sesi
login; n8n (workflow "temu tani escrow") memanggil dengan token layanan + nomor WA pengguna. Keduanya masuk
ke handler yang sama, sehingga status selalu satu.

Siklus:  MENUNGGU_BAYAR -> DIBAYAR -> DIKIRIM -> DITERIMA -> SELESAI
         KEDALUWARSA (invoice tak dibayar), SENGKETA (lapor masalah), PENCAIRAN_GAGAL (disbursement gagal)

Aturan:
  * transisi hanya yang ada di TRANSISI, oleh pelaku yang berhak (selain itu 403 / 409);
  * UPDATE ... WHERE status = <lama> sehingga dua request bersamaan tidak sama-sama berhasil;
  * konfirmasi ganda idempoten: status sudah di tujuan -> kembalikan status sekarang tanpa perubahan;
  * setiap perubahan dicatat di escrow_event (pelaku + kanal + payload).

Env tambahan:
  TEMUTANI_SERVICE_TOKEN       token layanan untuk n8n (header X-Service-Token) dan header ke webhook n8n
  N8N_ESCROW_WEBHOOK_URL       URL Webhook (Trigger B) workflow "temu tani escrow"; kosong = kirim langsung via WAHA
  N8N_ESCROW_WEBHOOK_TOKEN     rahasia header X-Temutani-Token ke webhook n8n (berbeda dari TEMUTANI_SERVICE_TOKEN)
  ESCROW_INVOICE_HOURS         umur invoice sebelum kedaluwarsa (default 24 jam)
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator

from . import auth, wa, xendit
from .db import read, tx

log = logging.getLogger("temutani.escrow")
router = APIRouter()

STATUS_LABEL = {
    "MENUNGGU_BAYAR": "Menunggu Pembayaran", "DIBAYAR": "Dana di Escrow", "DIKIRIM": "Gabah Dikirim",
    "DITERIMA": "Dana Dicairkan", "SELESAI": "Selesai", "KEDALUWARSA": "Kedaluwarsa",
    "SENGKETA": "Ditinjau Admin", "PENCAIRAN_GAGAL": "Pencairan Tertunda",
}
TIMESTAMP_COL = {"DIBAYAR": "dibayar_pada", "DIKIRIM": "dikirim_pada", "DITERIMA": "diterima_pada", "SELESAI": "selesai_pada"}

# (dari, ke) -> pelaku yang berhak
TRANSISI: dict[tuple[str, str], set[str]] = {
    ("MENUNGGU_BAYAR", "DIBAYAR"): {"xendit", "admin"},
    ("MENUNGGU_BAYAR", "KEDALUWARSA"): {"xendit", "sistem", "admin"},
    ("DIBAYAR", "DIKIRIM"): {"petani"},
    ("DIKIRIM", "DITERIMA"): {"tengkulak"},
    ("DIKIRIM", "SENGKETA"): {"tengkulak"},
    ("DITERIMA", "SELESAI"): {"xendit", "admin"},
    ("DITERIMA", "PENCAIRAN_GAGAL"): {"xendit", "sistem", "admin"},
    ("PENCAIRAN_GAGAL", "DITERIMA"): {"admin"},
    ("SENGKETA", "DITERIMA"): {"admin"},
}

AKSI = {  # aksi -> (dari, ke, peran)
    "konfirmasi-kirim": ("DIBAYAR", "DIKIRIM", "petani"),
    "konfirmasi-terima": ("DIKIRIM", "DITERIMA", "tengkulak"),
    "lapor-masalah": ("DIKIRIM", "SENGKETA", "tengkulak"),
    "cairkan-ulang": ("PENCAIRAN_GAGAL", "DITERIMA", "admin"),
    "selesaikan-sengketa": ("SENGKETA", "DITERIMA", "admin"),
}

COLS = """e.*, o.code as offer_code, p.name as petani_name, p.display_name as petani_display, p.phone as petani_phone,
          p.kabupaten, coalesce(t.name, 'Pembeli WhatsApp') as tengkulak_name"""
FROM = """from escrow_transaksi e join offers o on o.id = e.offer_id join users p on p.id = e.petani_id
          left join users t on t.phone = e.tengkulak_phone and t.role = 'tengkulak'"""


def _m():
    from . import main  # impor tunda: main meng-include router ini
    return main


def invoice_hours() -> int:
    try:
        return max(1, int(os.getenv("ESCROW_INVOICE_HOURS", "24")))
    except ValueError:
        return 24


def kode(row: dict) -> str:
    return f"ESC-{row['offer_id']}"


# ---- Mode simulasi: halaman checkout pengganti halaman bayar Xendit -----------------
def _checkout_token(escrow_id) -> str:
    return hmac.new(auth._SECRET, f"checkout:{escrow_id}".encode(), hashlib.sha256).hexdigest()[:32]


def checkout_url(escrow_id) -> str:
    base = os.getenv("TEMUTANI_API_URL", "https://api.temutani.web.id").rstrip("/")
    return f"{base}/api/escrow/checkout/{escrow_id}?t={_checkout_token(escrow_id)}"


def invoice_url(row: dict) -> Optional[str]:
    """Tautan bayar. Mode simulasi: halaman checkout backend (tanpa login, dilindungi token)."""
    if not row["invoice_url"] and not row["invoice_id"]:
        return None
    if xendit.mock_mode() and str(row["invoice_id"] or "").startswith("mock-"):
        return checkout_url(row["id"])
    return row["invoice_url"]


# ---------------------------------------------------------------------------
# Pelaku
# ---------------------------------------------------------------------------
class Pelaku(BaseModel):
    role: Literal["petani", "tengkulak", "admin"]
    user: str
    phone: str
    name: str
    kanal: Literal["web", "whatsapp"]


def _service_ok(token: str) -> bool:
    expected = os.getenv("TEMUTANI_SERVICE_TOKEN", "").strip()
    return bool(expected and token) and hmac.compare_digest(expected.encode(), token.strip().encode())


def get_pelaku(
    authorization: str = Header(default="", alias="Authorization"),
    x_service_token: str = Header(default="", alias="X-Service-Token"),
    x_wa_phone: str = Header(default="", alias="X-WA-Phone"),
) -> Pelaku:
    m = _m()
    if x_service_token:
        if not _service_ok(x_service_token):
            m.err(401, "Token layanan tidak valid.")
        local = auth.normalize_phone(x_wa_phone)
        if not local:
            m.err(400, "Header X-WA-Phone wajib berisi nomor WhatsApp pengguna.")
        with read() as cur:
            cur.execute("select id, role, name, phone, status from users where phone = %s", (auth.to_e164(local),))
            u = cur.fetchone()
        if not u or u["status"] != "approved":
            # Pembeli yang tercatat di escrow tetap boleh mengonfirmasi lewat WA walau akunnya tidak aktif/tidak ada,
            # agar dana tidak tertahan selamanya. Hak aksesnya hanya atas escrow dengan nomor yang sama.
            with read() as cur:
                cur.execute("select 1 from escrow_transaksi where tengkulak_phone = %s limit 1", (auth.to_e164(local),))
                pembeli = cur.fetchone()
            if pembeli and (not u or u["role"] == "tengkulak"):
                return Pelaku(role="tengkulak", user=str(u["id"]) if u else "", phone=auth.to_e164(local),
                              name=(u["name"] if u else "Pembeli WhatsApp"), kanal="whatsapp")
            m.err(403, "Nomor WhatsApp belum terdaftar atau belum disetujui.")
        if u["role"] not in ("petani", "tengkulak"):
            m.err(403, "Aksi escrow lewat WhatsApp hanya untuk petani dan tengkulak.")
        return Pelaku(role=u["role"], user=str(u["id"]), phone=u["phone"], name=u["name"], kanal="whatsapp")
    a = m.get_actor(authorization)
    return Pelaku(role=a.role, user=a.user, phone=a.phone, name=a.name, kanal="web")


def _pihak(row: dict, p: Pelaku) -> Optional[str]:
    """'petani' / 'tengkulak' / 'admin' bila p berhak atas escrow ini, selain itu None."""
    if p.role == "admin":
        return "admin"
    if p.role == "petani" and str(row["petani_id"]) == p.user:
        return "petani"
    if p.role == "tengkulak" and row["tengkulak_phone"] == p.phone:
        return "tengkulak"
    return None


def aksi_tersedia(row: dict, peran: Optional[str]) -> list[str]:
    s = row["status"]
    out: list[str] = []
    if peran == "tengkulak":
        if s == "MENUNGGU_BAYAR" and invoice_url(row):
            out.append("bayar")
        if s == "DIKIRIM":
            out += ["konfirmasi-terima", "lapor-masalah"]
    elif peran == "petani":
        if s == "DIBAYAR":
            out.append("konfirmasi-kirim")
    elif peran == "admin":
        if s == "PENCAIRAN_GAGAL":
            out.append("cairkan-ulang")
        if s == "SENGKETA":
            out.append("selesaikan-sengketa")
        if s in ("MENUNGGU_BAYAR", "DITERIMA"):
            out.append("rekonsiliasi")
    if peran in ("tengkulak", "admin") and s == "MENUNGGU_BAYAR" and not invoice_url(row):
        out.append("buat-invoice")
    return out


# ---------------------------------------------------------------------------
# Query & tampilan
# ---------------------------------------------------------------------------
def _lookup(cur, ref: str, lock: bool = False) -> Optional[dict]:
    """ref = UUID escrow atau 'ESC-<offer_id>'."""
    if ref.upper().startswith("ESC-") and ref[4:].isdigit():
        where, val = "e.offer_id = %s", int(ref[4:])
    else:
        try:
            val = str(UUID(ref))
        except ValueError:
            return None
        where = "e.id = %s"
    cur.execute(f"select {COLS} {FROM} where {where}" + (" for update of e" if lock else ""), (val,))
    return cur.fetchone()


def _get_row(ref: str) -> Optional[dict]:
    with read() as cur:
        return _lookup(cur, ref)


def view(row: dict, peran: Optional[str], riwayat: Optional[list[dict]] = None) -> dict:
    m = _m()
    berat = float(row["berat_kg"])
    out = {
        "id": str(row["id"]), "kode": kode(row), "offerId": row["offer_code"], "trxId": f"TRX-{row['offer_id']}",
        "status": row["status"], "statusLabel": STATUS_LABEL[row["status"]],
        "nilai": int(row["nilai"]), "harga_per_kg": row["harga_per_kg"], "berat_kg": int(berat) if berat.is_integer() else berat,
        "petani": row["petani_name"] if peran in ("petani", "admin") else row["petani_display"],
        "kabupaten": row["kabupaten"], "tengkulak": row["tengkulak_name"],
        "invoice_kedaluwarsa_pada": m.iso(row["invoice_kedaluwarsa_pada"]),
        "dibuat_pada": m.iso(row["dibuat_pada"]), "dibayar_pada": m.iso(row["dibayar_pada"]),
        "dikirim_pada": m.iso(row["dikirim_pada"]), "diterima_pada": m.iso(row["diterima_pada"]),
        "selesai_pada": m.iso(row["selesai_pada"]), "catatan_masalah": row["catatan_masalah"],
        "aksi_tersedia": aksi_tersedia(row, peran),
    }
    if peran in ("tengkulak", "admin"):
        out["invoice_url"] = invoice_url(row)
    if peran == "admin":
        out.update({"invoice_id": row["invoice_id"], "disbursement_id": row["disbursement_id"],
                    "pencairan_percobaan": row["pencairan_percobaan"], "pencairan_gagal_kode": row["pencairan_gagal_kode"],
                    "petani_phone": auth.from_e164(row["petani_phone"]), "tengkulak_phone": auth.from_e164(row["tengkulak_phone"])})
    # Kontak dibagikan setelah dana aman di escrow agar kedua pihak bisa mengatur pengiriman.
    if peran in ("petani", "tengkulak") and row["status"] not in ("MENUNGGU_BAYAR", "KEDALUWARSA"):
        out["kontak"] = auth.from_e164(row["tengkulak_phone"] if peran == "petani" else row["petani_phone"])
    if riwayat is not None:
        out["riwayat"] = [{"dari_status": r["dari_status"], "ke_status": r["ke_status"], "label": STATUS_LABEL[r["ke_status"]],
                           "pelaku": r["pelaku"], "kanal": r["kanal"], "dibuat_pada": m.iso(r["dibuat_pada"])} for r in riwayat]
    return out


def _riwayat(cur, escrow_id) -> list[dict]:
    cur.execute("select dari_status, ke_status, pelaku, kanal, dibuat_pada from escrow_event where escrow_id = %s order by dibuat_pada, id",
                (escrow_id,))
    return cur.fetchall()


def detail(ref: str, peran: Optional[str]) -> dict:
    with read() as cur:
        row = _lookup(cur, ref)
        return view(row, peran, _riwayat(cur, row["id"]))


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------
def _event(cur, escrow_id, dari: Optional[str], ke: str, pelaku: str, kanal: str, payload: Optional[dict] = None) -> None:
    cur.execute(
        "insert into escrow_event (escrow_id, dari_status, ke_status, pelaku, kanal, payload) values (%s, %s, %s, %s, %s, %s::jsonb)",
        (escrow_id, dari, ke, pelaku, kanal, json.dumps(payload or {}, default=str)),
    )


def transisi(cur, escrow_id, dari: str, ke: str, pelaku: str, kanal: str, payload: Optional[dict] = None,
             extra: Optional[dict] = None, guard: Optional[dict] = None) -> bool:
    """Ubah status secara atomik. False bila status sudah bukan `dari` (request lain menang duluan)."""
    if pelaku not in TRANSISI.get((dari, ke), set()):
        raise ValueError(f"Transisi {dari} -> {ke} oleh {pelaku} tidak sah")
    sets, params = ["status = %s"], [ke]
    if ke in TIMESTAMP_COL:
        sets.append(f"{TIMESTAMP_COL[ke]} = now()")
    for col, val in (extra or {}).items():
        sets.append(f"{col} = %s")
        params.append(val)
    where, wparams = ["id = %s", "status = %s"], [escrow_id, dari]
    for col, val in (guard or {}).items():  # kolom dari konstanta internal, nilai selalu parameter
        if val is None:
            where.append(f"{col} is null")
        else:
            where.append(f"{col} = %s")
            wparams.append(val)
    cur.execute(f"update escrow_transaksi set {', '.join(sets)} where {' and '.join(where)} returning id", (*params, *wparams))
    if not cur.fetchone():
        return False
    _event(cur, escrow_id, dari, ke, pelaku, kanal, payload)
    return True


# ---------------------------------------------------------------------------
# Pembuatan escrow + invoice
# ---------------------------------------------------------------------------
def buat_escrow(offer_id: int, pelaku: str = "sistem", kanal: str = "sistem") -> tuple[dict, bool]:
    """Buat escrow untuk kesepakatan (idempoten per offer). -> (row, baru_dibuat). Invoice dibuat setelah commit."""
    m = _m()
    with tx() as cur:
        cur.execute(
            "select o.id, o.status, o.agreed_price, o.qty_kg, o.farmer_id, r.buyer_phone from offers o join requests r on r.id = o.request_id"
            " where o.id = %s for update of o",
            (offer_id,),
        )
        o = cur.fetchone()
        if not o:
            m.err(404, "Penawaran tidak ditemukan.")
        if o["status"] != "AGREED":
            m.err(409, "Escrow hanya bisa dibuat untuk penawaran yang sudah disepakati.")
        cur.execute("select id from users where phone = %s and role = 'tengkulak'", (o["buyer_phone"],))
        t = cur.fetchone()
        cur.execute(
            "insert into escrow_transaksi (offer_id, petani_id, tengkulak_phone, tengkulak_id, harga_per_kg, berat_kg, nilai)"
            " values (%s, %s, %s, %s, %s, %s, %s) on conflict (offer_id) do nothing returning id",
            (o["id"], o["farmer_id"], o["buyer_phone"], t["id"] if t else None, o["agreed_price"], o["qty_kg"],
             o["agreed_price"] * o["qty_kg"]),
        )
        created = cur.fetchone()
        if created:
            _event(cur, created["id"], None, "MENUNGGU_BAYAR", pelaku if pelaku in ("petani", "tengkulak", "admin") else "sistem",
                   kanal, {"offer_id": o["id"]})
    row = _get_row(f"ESC-{offer_id}")
    if not row["invoice_id"] and row["status"] == "MENUNGGU_BAYAR":
        row = buat_invoice(row)
    return row, bool(created)


def buat_invoice(row: dict) -> dict:
    """Buat invoice Xendit bila belum ada. Gagal -> escrow tetap MENUNGGU_BAYAR tanpa tautan (bisa dicoba ulang)."""
    m = _m()
    if not xendit.configured():
        log.warning("Xendit belum dikonfigurasi; escrow %s dibuat tanpa invoice", row["id"])
        return row
    try:
        inv = xendit.create_invoice(
            external_id=str(row["id"]), amount=int(row["nilai"]),
            description=f"Escrow Temu Tani {kode(row)} ({row['offer_code']}): {m.fmt_number(float(row['berat_kg']))} kg GKP x {m.rupiah(row['harga_per_kg'])}/kg",
            duration_seconds=invoice_hours() * 3600,
            success_redirect_url=f"{m.WEB_URL}/tengkulak/transaksi?escrow={row['id']}",
        )
    except xendit.XenditError:
        log.exception("Invoice Xendit gagal dibuat untuk escrow %s", row["id"])
        return row
    exp = inv.get("expiry_date")
    with tx() as cur:
        cur.execute(
            "update escrow_transaksi set invoice_id = %s, invoice_url = %s, invoice_kedaluwarsa_pada = %s"
            " where id = %s and invoice_id is null",
            (inv["id"], inv.get("invoice_url"), datetime.fromisoformat(exp.replace("Z", "+00:00")) if exp else None, row["id"]),
        )
    return _get_row(str(row["id"]))


# ---------------------------------------------------------------------------
# Pencairan
# ---------------------------------------------------------------------------
PENDING = "PENDING:"  # penanda disbursement sedang dibuat (sebelum Xendit membalas), agar tidak pernah ada klaim kedua


def ext_id(escrow_id, percobaan: int) -> str:
    """external_id disbursement = idempotency key: '<uuid escrow>-<percobaan>'."""
    return f"{escrow_id}-{percobaan}"


def cairkan(escrow_id) -> None:
    """Dipanggil setelah status DITERIMA di-commit. Klaim atomik: percobaan naik dan penanda PENDING ditulis dalam
    transaksi yang sama, jadi panggilan kedua (konfirmasi ganda, rekonsiliasi) tidak pernah membuat disbursement baru
    selama disbursement sebelumnya belum dipastikan GAGAL."""
    with tx() as cur:
        cur.execute(
            "update escrow_transaksi set pencairan_percobaan = pencairan_percobaan + 1, pencairan_gagal_kode = null,"
            " disbursement_id = %s || id::text || '-' || (pencairan_percobaan + 1)"
            " where id = %s and status = 'DITERIMA' and disbursement_id is null returning pencairan_percobaan",
            (PENDING, escrow_id),
        )
        claim = cur.fetchone()
    if claim:
        _kirim_disbursement(escrow_id, claim["pencairan_percobaan"])


def _kirim_disbursement(escrow_id, percobaan: int) -> None:
    """Buat disbursement untuk percobaan yang sudah diklaim. Aman diulang dengan percobaan yang sama (idempotency key)."""
    ext = ext_id(escrow_id, percobaan)
    marker = PENDING + ext
    with read() as cur:
        cur.execute("select e.nilai, e.offer_id, a.kode_bank, a.nama_pemilik, a.nomor_akun from escrow_transaksi e"
                    " left join akun_pencairan_petani a on a.petani_id = e.petani_id where e.id = %s", (escrow_id,))
        info = cur.fetchone()
    gagal_kode, disb, tidak_pasti = None, None, False
    if not info["kode_bank"] and xendit.mock_mode():
        info = {**info, "kode_bank": "BCA", "nama_pemilik": "Petani (simulasi)", "nomor_akun": "0000000000"}
    if not info["kode_bank"]:
        gagal_kode = "AKUN_PENCAIRAN_BELUM_ADA"
    elif not xendit.configured():
        gagal_kode = "XENDIT_BELUM_DIKONFIGURASI"
    else:
        try:
            disb = xendit.create_disbursement(
                external_id=ext, amount=int(info["nilai"]), bank_code=info["kode_bank"],
                account_holder_name=info["nama_pemilik"], account_number=info["nomor_akun"],
                description=f"Pencairan escrow Temu Tani ESC-{info['offer_id']}",
            )
        except xendit.XenditError as e:
            if e.uncertain:
                tidak_pasti = True  # mungkin sudah dibuat di Xendit: jangan tandai gagal, jangan naikkan percobaan
            else:
                gagal_kode = e.code
    ok = False
    with tx() as cur:
        if disb and disb.get("id"):
            cur.execute("update escrow_transaksi set disbursement_id = %s where id = %s and disbursement_id = %s returning id",
                        (disb["id"], escrow_id, marker))
            if cur.fetchone():
                _event(cur, escrow_id, "DITERIMA", "DITERIMA", "sistem", "sistem",
                       {"disbursement_id": disb["id"], "external_id": ext, "percobaan": percobaan})
        elif tidak_pasti or disb is not None:
            _event(cur, escrow_id, "DITERIMA", "DITERIMA", "sistem", "sistem",
                   {"disbursement": "status_belum_pasti", "external_id": ext, "percobaan": percobaan})
            log.warning("Disbursement %s belum pasti; tunggu callback atau rekonsiliasi admin", ext)
        else:
            ok = transisi(cur, escrow_id, "DITERIMA", "PENCAIRAN_GAGAL", "sistem", "sistem", {"kode": gagal_kode, "external_id": ext},
                          {"pencairan_gagal_kode": gagal_kode, "disbursement_id": None}, guard={"disbursement_id": marker})
    if ok:
        kabari(str(escrow_id))
    elif disb and disb.get("id") and xendit.mock_mode():
        # Simulasi: disbursement langsung berhasil, seperti callback COMPLETED di test mode Xendit.
        row = _get_row(str(escrow_id))
        if row and row["disbursement_id"] == disb["id"]:
            terapkan_disbursement(row, "COMPLETED", {"sumber": "simulasi", "status": "COMPLETED"}, "webhook", "xendit")


# ---------------------------------------------------------------------------
# Notifikasi WhatsApp
# ---------------------------------------------------------------------------
HINT = "Ketuk pilihan di bawah, atau balas dengan angka."


def pesan(row: dict) -> list[dict]:
    """Pesan WA per status (PRD: "Aksi per status"). -> [{phone, text, poll?, step?, context?}]"""
    m = _m()
    k, nilai = kode(row), m.rupiah(int(row["nilai"]))
    info = (f"*{k}* ({row['offer_code']}) • {row['kabupaten']} • GKP • {m.fmt_number(float(row['berat_kg']))} kg\n"
            f"Harga: *{m.rupiah(row['harga_per_kg'])}/kg* • Nilai: *{nilai}*")
    web_t, web_p = f"{m.WEB_URL}/tengkulak/transaksi", f"{m.WEB_URL}/petani/transaksi"
    P, T = row["petani_phone"], row["tengkulak_phone"]
    s = row["status"]
    out: list[dict] = []
    if s == "MENUNGGU_BAYAR":
        exp = f"\nBatas bayar: *{m.id_date(row['invoice_kedaluwarsa_pada'])} {m.id_time(row['invoice_kedaluwarsa_pada'])} WIB*" if row["invoice_kedaluwarsa_pada"] else ""
        bayar = (f"💳 Bayar ke escrow lewat tautan ini:\n{invoice_url(row)}{exp}" if invoice_url(row)
                 else f"Tautan pembayaran sedang disiapkan. Cek di web: {web_t}")
        out.append({"phone": T, "text": f"✅ *Harga disepakati dengan {row['petani_display']}!*\n\n{info}\n\n{bayar}\n\n"
                                        "Dana Anda ditahan aman di escrow Temu Tani dan baru diteruskan ke petani setelah Anda "
                                        "mengonfirmasi gabah diterima."})
        out.append({"phone": P, "text": f"✅ *Harga sudah disepakati!*\n\n{info}\n\n⏳ Menunggu pembayaran tengkulak ke escrow.\n"
                                        "Kami kabari begitu dana aman di escrow. *Jangan kirim gabah sebelum ada kabar tersebut.*"})
    elif s == "DIBAYAR":
        out.append({"phone": P, "text": f"💰 *Dana {nilai} sudah aman di escrow.*\n\n{info}\n\nSilakan kirim/serahkan gabah ke tengkulak.\n"
                                        f"📱 Kontak tengkulak: {m._wa_contact(T)}\n\n"
                                        f"Setelah gabah diserahkan, konfirmasi lewat pilihan di bawah atau di web: {web_p}\n{HINT}",
                    "poll": {"name": f"Konfirmasi {k}:", "options": ["1. Gabah sudah dikirim", "0. Kembali ke menu"]},
                    "step": "escrow_action", "context": {"escrow_id": str(row["id"]), "kode": k, "actions": ["konfirmasi-kirim"]}})
        out.append({"phone": T, "text": f"🧾 *Pembayaran diterima.* Dana {nilai} ditahan di escrow.\n\n{info}\n\n"
                                        f"📱 Kontak petani: {m._wa_contact(P)}\nKoordinasikan waktu & lokasi serah terima gabah."})
    elif s == "DIKIRIM":
        out.append({"phone": T, "text": f"🚚 *{row['petani_display']} sudah mengirim gabah.*\n\n{info}\n\n"
                                        "Setelah gabah Anda terima dan cek, konfirmasi lewat pilihan di bawah. "
                                        f"Dana baru diteruskan ke petani setelah konfirmasi Anda.\nBisa juga di web: {web_t}\n{HINT}",
                    "poll": {"name": f"Konfirmasi {k}:", "options": ["1. Sudah diterima", "2. Ada masalah", "0. Kembali ke menu"]},
                    "step": "escrow_action", "context": {"escrow_id": str(row["id"]), "kode": k, "actions": ["konfirmasi-terima", "lapor-masalah"]}})
    elif s == "DITERIMA":
        tunggu = ("⏳ Pencairan diproses bank/Xendit, biasanya *beberapa menit* (bisa lebih lama di luar jam operasional bank). "
                  "Kami kabari lagi begitu dana masuk.")
        out.append({"phone": P, "text": f"📦 *Gabah sudah diterima tengkulak.* Dana {nilai} sedang dicairkan ke rekening Anda.\n\n{info}\n\n{tunggu}"})
        out.append({"phone": T, "text": f"📦 Terima kasih, penerimaan gabah *{k}* sudah dikonfirmasi. Dana {nilai} sedang diteruskan ke petani.\n\n{info}"})
    elif s == "SELESAI":
        out.append({"phone": P, "text": f"🎉 *Dana {nilai} sudah masuk ke rekening Anda.*\n\n{info}\n\nTransaksi selesai. Terima kasih!"})
        out.append({"phone": T, "text": f"✅ Transaksi *{k}* selesai. Dana sudah diteruskan ke petani. Terima kasih!"})
    elif s == "KEDALUWARSA":
        msg = f"⌛ Tagihan escrow *{k}* kedaluwarsa karena belum dibayar sampai batas waktu.\n\n{info}"
        out += [{"phone": P, "text": msg}, {"phone": T, "text": msg}]
    elif s == "SENGKETA":
        note = f"\nCatatan tengkulak: _{row['catatan_masalah']}_" if row["catatan_masalah"] else ""
        msg = f"⚠️ Transaksi *{k}* sedang *ditinjau admin* karena tengkulak melaporkan masalah.{note}\n\n{info}\n\nDana tetap ditahan di escrow sampai admin selesai meninjau."
        out += [{"phone": P, "text": msg}, {"phone": T, "text": msg}]
    elif s == "PENCAIRAN_GAGAL":
        out.append({"phone": P, "text": f"⏳ Pencairan dana {nilai} untuk *{k}* *tertunda*. Admin Temu Tani sedang menanganinya; dana tetap aman."})
    return out


def _deliver_n8n(url: str, body: dict) -> bool:
    # Rahasia keluar terpisah dari token layanan masuk: bocornya token ini tidak memberi akses ke API escrow.
    headers = {"Content-Type": "application/json", "X-Temutani-Token": os.getenv("N8N_ESCROW_WEBHOOK_TOKEN", "")}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status < 300
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        log.warning("Webhook n8n escrow gagal: %s", e)
        return False


def kabari(ref: str, kecuali: Optional[str] = None) -> None:
    """Kirim notifikasi status terbaru. `kecuali` = nomor yang sudah dibalas langsung (pelaku dari WA)."""
    m = _m()
    try:
        row = _get_row(ref)
        if not row:
            return
        msgs = [x for x in pesan(row) if x["phone"] != kecuali]
        if not msgs:
            return
        with tx() as cur:  # sesi chatbot penerima: balasan angka/vote langsung masuk ke alur escrow
            for x in msgs:
                if "step" in x:
                    m._set_chat_step(cur, x["phone"], x["step"], x.get("context") or {})
        url = os.getenv("N8N_ESCROW_WEBHOOK_URL", "").strip()
        body = {"event": row["status"], "escrow_id": str(row["id"]), "kode": kode(row),
                "session": os.getenv("WAHA_SESSION", "").strip(),  # nama sesi WAHA yang sama dengan backend
                "messages": [{"phone": x["phone"], "chatId": wa.chat_id(x["phone"]), "text": x["text"], "poll": x.get("poll")} for x in msgs]}
        if url and os.getenv("N8N_ESCROW_WEBHOOK_TOKEN", "").strip() and _deliver_n8n(url, body):
            return
        for x in msgs:  # cadangan: langsung ke WAHA
            if x.get("poll"):
                m._notify_poll(x["phone"], x["text"], x["poll"])
            else:
                m._notify(x["phone"], x["text"])
    except Exception:  # noqa: BLE001 - notifikasi tidak boleh membatalkan perubahan status
        log.exception("Notifikasi escrow %s gagal", ref)


# ---------------------------------------------------------------------------
# Callback Xendit (dipakai webhook, rekonsiliasi, dan simulasi)
# ---------------------------------------------------------------------------
def terapkan_invoice(row: dict, status: str, payload: dict, kanal: str = "webhook", pelaku: str = "xendit") -> bool:
    status = (status or "").upper()
    ke = "DIBAYAR" if status in ("PAID", "SETTLED") else "KEDALUWARSA" if status == "EXPIRED" else None
    if not ke or row["status"] != "MENUNGGU_BAYAR":
        return False
    with tx() as cur:
        ok = transisi(cur, row["id"], "MENUNGGU_BAYAR", ke, pelaku, kanal, payload)
    if ok:
        kabari(str(row["id"]))
    return ok


def terapkan_disbursement(row: dict, status: str, payload: dict, kanal: str = "webhook", pelaku: str = "xendit",
                          disbursement_id: Optional[str] = None) -> bool:
    """Hanya untuk disbursement aktif (guard: disbursement_id saat ini). FAILED -> PENCAIRAN_GAGAL membuka percobaan baru."""
    status = (status or "").upper()
    ke = "SELESAI" if status in ("COMPLETED", "SUCCEEDED") else "PENCAIRAN_GAGAL" if status in ("FAILED", "REVERSED", "CANCELLED") else None
    if not ke or row["status"] != "DITERIMA" or not row["disbursement_id"]:
        return False
    extra = {"disbursement_id": disbursement_id or row["disbursement_id"]} if ke == "SELESAI" else \
        {"pencairan_gagal_kode": payload.get("failure_code") or "FAILED", "disbursement_id": None}
    with tx() as cur:
        ok = transisi(cur, row["id"], "DITERIMA", ke, pelaku, kanal, payload, extra, guard={"disbursement_id": row["disbursement_id"]})
    if ok:
        kabari(str(row["id"]))
    return ok


def _aktif_cocok(row: dict, disb_id: str, ext: str) -> bool:
    """Callback/hasil Xendit milik disbursement yang sedang aktif (id tersimpan, atau penanda PENDING percobaan ini)."""
    cur = row["disbursement_id"] or ""
    return bool(cur) and (cur == disb_id or cur == PENDING + ext)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
class BuatEscrowIn(BaseModel):
    offer_id: str = Field(min_length=1, max_length=30)   # 'OFF-12' atau '12'
    notify: bool = True                                   # n8n mengirim balasan sendiri -> false


class LaporIn(BaseModel):
    catatan: str = Field(min_length=3, max_length=500)

    @field_validator("catatan")
    @classmethod
    def _strip(cls, v: str) -> str:
        return " ".join(v.split())


class SimulasiIn(BaseModel):
    event: Literal["PAID", "EXPIRED", "COMPLETED", "FAILED"]


def _offer_id(raw: str) -> int:
    raw = raw.strip().upper()
    if raw.startswith("OFF-"):
        raw = raw[4:]
    if not raw.isdigit():
        _m().err(404, "Penawaran tidak ditemukan.")
    return int(raw)


def _row_for(ref: str, p: Pelaku) -> tuple[dict, str]:
    m = _m()
    row = _get_row(ref)
    peran = _pihak(row, p) if row else None
    if not row or not peran:
        m.err(404, "Transaksi escrow tidak ditemukan.")
    return row, peran


@router.post("/api/escrow", tags=["escrow"], status_code=201)
def create_escrow(body: BuatEscrowIn, p: Pelaku = Depends(get_pelaku)):
    """Buat escrow + invoice untuk kesepakatan (idempoten). Otomatis dipanggil saat deal di web; n8n memanggil setelah "Setuju"."""
    m = _m()
    oid = _offer_id(body.offer_id)
    with read() as cur:
        cur.execute("select o.farmer_id, r.buyer_phone from offers o join requests r on r.id = o.request_id where o.id = %s", (oid,))
        o = cur.fetchone()
    if not o or not (p.role == "admin" or (p.role == "petani" and str(o["farmer_id"]) == p.user)
                     or (p.role == "tengkulak" and o["buyer_phone"] == p.phone)):
        m.err(404, "Penawaran tidak ditemukan.")
    row, baru = buat_escrow(oid, p.role, p.kanal)
    if baru and body.notify:
        kabari(str(row["id"]))
    return {**detail(str(row["id"]), _pihak(row, p)), "baru": baru}


@router.get("/api/escrow", tags=["escrow"])
def list_escrow(status: Optional[str] = None, p: Pelaku = Depends(get_pelaku)):
    m = _m()
    where, params = [], []
    if p.role == "petani":
        where.append("e.petani_id = %s")
        params.append(p.user)
    elif p.role == "tengkulak":
        where.append("e.tengkulak_phone = %s")
        params.append(p.phone)
    if status:
        wanted = [s.strip().upper() for s in status.split(",") if s.strip()]
        if any(s not in STATUS_LABEL for s in wanted):
            m.err(400, "Status escrow tidak dikenali.")
        where.append("e.status::text = any(%s)")
        params.append(wanted)
    with read() as cur:
        cur.execute(f"select {COLS} {FROM} where {' and '.join(where) or 'true'} order by e.dibuat_pada desc limit 200", tuple(params))
        rows = cur.fetchall()
        counts = {}
        if p.role == "admin":
            cur.execute("select status::text as s, count(*)::int as n from escrow_transaksi group by 1")
            counts = {r["s"]: r["n"] for r in cur.fetchall()}
    return {"items": [view(r, _pihak(r, p)) for r in rows], "counts": counts}


@router.get("/api/escrow/{ref}", tags=["escrow"])
def get_escrow(ref: str, p: Pelaku = Depends(get_pelaku)):
    row, peran = _row_for(ref, p)
    return detail(str(row["id"]), peran)


def _aksi(ref: str, aksi: str, p: Pelaku, payload: dict, extra: Optional[dict] = None) -> dict:
    m = _m()
    dari, ke, peran_wajib = AKSI[aksi]
    row, peran = _row_for(ref, p)
    if peran != peran_wajib:
        m.err(403, "Aksi ini tidak diizinkan untuk peran Anda.")
    if row["status"] == ke:  # konfirmasi ganda (mis. web lalu WA): idempoten
        return {**detail(str(row["id"]), peran), "berubah": False, "message": f"Status sudah {STATUS_LABEL[ke]}."}
    if row["status"] != dari:
        m.err(409, f"Status transaksi sudah berubah ({STATUS_LABEL[row['status']]}).")
    pelaku = "admin" if peran == "admin" else peran
    with tx() as cur:
        ok = transisi(cur, row["id"], dari, ke, pelaku, p.kanal, {"oleh": p.user, **payload}, extra)
    if not ok:
        fresh = _get_row(str(row["id"]))
        if fresh["status"] == ke:
            return {**detail(str(row["id"]), peran), "berubah": False, "message": f"Status sudah {STATUS_LABEL[ke]}."}
        m.err(409, f"Status transaksi sudah berubah ({STATUS_LABEL[fresh['status']]}).")
    kabari(str(row["id"]), kecuali=p.phone if p.kanal == "whatsapp" else None)
    if ke == "DITERIMA":
        cairkan(row["id"])
    return {**detail(str(row["id"]), peran), "berubah": True, "message": f"Status diperbarui: {STATUS_LABEL[ke]}."}


@router.post("/api/escrow/{ref}/konfirmasi-kirim", tags=["escrow"])
def konfirmasi_kirim(ref: str, p: Pelaku = Depends(get_pelaku)):
    return _aksi(ref, "konfirmasi-kirim", p, {})


@router.post("/api/escrow/{ref}/konfirmasi-terima", tags=["escrow"])
def konfirmasi_terima(ref: str, p: Pelaku = Depends(get_pelaku)):
    return _aksi(ref, "konfirmasi-terima", p, {})


@router.post("/api/escrow/{ref}/lapor-masalah", tags=["escrow"])
def lapor_masalah(ref: str, body: LaporIn, p: Pelaku = Depends(get_pelaku)):
    return _aksi(ref, "lapor-masalah", p, {"catatan": body.catatan}, {"catatan_masalah": body.catatan})


@router.post("/api/escrow/{ref}/cairkan-ulang", tags=["escrow"])
def cairkan_ulang(ref: str, p: Pelaku = Depends(get_pelaku)):
    return _aksi(ref, "cairkan-ulang", p, {})


@router.post("/api/escrow/{ref}/selesaikan-sengketa", tags=["escrow"])
def selesaikan_sengketa(ref: str, p: Pelaku = Depends(get_pelaku)):
    """Admin memutuskan dana diteruskan ke petani setelah meninjau laporan (refund di luar cakupan: manual)."""
    return _aksi(ref, "selesaikan-sengketa", p, {})


@router.post("/api/escrow/{ref}/buat-invoice", tags=["escrow"])
def buat_invoice_ulang(ref: str, p: Pelaku = Depends(get_pelaku)):
    m = _m()
    row, peran = _row_for(ref, p)
    if peran not in ("tengkulak", "admin"):
        m.err(403, "Aksi ini tidak diizinkan untuk peran Anda.")
    if row["status"] != "MENUNGGU_BAYAR":
        m.err(409, f"Status transaksi sudah berubah ({STATUS_LABEL[row['status']]}).")
    row = buat_invoice(row)
    if not invoice_url(row):
        m.err(502, "Tautan pembayaran belum bisa dibuat. Coba lagi beberapa saat lagi.")
    return detail(str(row["id"]), peran)


@router.post("/api/escrow/{ref}/rekonsiliasi", tags=["escrow"])
def rekonsiliasi(ref: str, p: Pelaku = Depends(get_pelaku)):
    """Admin: tarik status terbaru dari Xendit bila callback terlewat (tunnel/backend mati)."""
    m = _m()
    row, peran = _row_for(ref, p)
    if peran != "admin":
        m.err(403, "Aksi ini tidak diizinkan untuk peran Anda.")
    try:
        if row["status"] == "MENUNGGU_BAYAR" and row["invoice_id"]:
            inv = xendit.get_invoice(row["invoice_id"])
            terapkan_invoice(row, inv.get("status"), {"sumber": "rekonsiliasi", "status": inv.get("status")}, "web", "admin")
        elif row["status"] == "DITERIMA" and (row["disbursement_id"] or "").startswith(PENDING):
            # Hasil pembuatan disbursement belum pasti: cari di Xendit dengan external_id yang sama.
            ext = row["disbursement_id"][len(PENDING):]
            found = xendit.find_disbursements(ext)
            if not found:
                _kirim_disbursement(row["id"], row["pencairan_percobaan"])  # idempotency key sama: aman diulang
            else:
                d = found[0]
                if str(d.get("status", "")).upper() in ("COMPLETED", "SUCCEEDED", "FAILED"):
                    terapkan_disbursement(row, d.get("status"), {"sumber": "rekonsiliasi", "status": d.get("status"),
                                                                 "failure_code": d.get("failure_code")}, "web", "admin", d.get("id"))
                else:
                    with tx() as cur:
                        cur.execute("update escrow_transaksi set disbursement_id = %s where id = %s and disbursement_id = %s",
                                    (d["id"], row["id"], row["disbursement_id"]))
        elif row["status"] == "DITERIMA" and row["disbursement_id"]:
            d = xendit.get_disbursement(row["disbursement_id"])
            terapkan_disbursement(row, d.get("status"), {"sumber": "rekonsiliasi", "status": d.get("status"),
                                                         "failure_code": d.get("failure_code")}, "web", "admin")
        elif row["status"] == "DITERIMA":
            cairkan(row["id"])
    except xendit.XenditError as e:
        m.err(502, f"Status Xendit belum bisa diambil ({e.code}).")
    return detail(str(row["id"]), peran)


@router.post("/api/escrow/{ref}/simulasi", tags=["escrow"])
def simulasi(ref: str, body: SimulasiIn, p: Pelaku = Depends(get_pelaku)):
    """Hanya mode simulasi (TEMUTANI_PAYMENT_MOCK=1, tanpa akun Xendit): admin menggerakkan status seperti callback Xendit."""
    m = _m()
    if not xendit.mock_mode():
        m.err(404, "Endpoint API tidak ditemukan.")
    row, peran = _row_for(ref, p)
    if peran != "admin":
        m.err(403, "Aksi ini tidak diizinkan untuk peran Anda.")
    payload = {"sumber": "simulasi", "status": body.event}
    if body.event in ("PAID", "EXPIRED"):
        terapkan_invoice(row, body.event, payload, "web", "admin")
    else:
        terapkan_disbursement(row, body.event, {**payload, "failure_code": "SIMULASI" if body.event == "FAILED" else None}, "web", "admin")
    return detail(str(row["id"]), peran)


# ---- Webhook Xendit -----------------------------------------------------------
async def _callback_body(request: Request, token: str) -> dict:
    m = _m()
    if not xendit.verify_callback_token(token):
        m.err(401, "Token callback tidak valid.")
    try:
        body = json.loads(await request.body() or b"{}")
    except ValueError:
        m.err(400, "JSON tidak valid.")
    if not isinstance(body, dict):
        m.err(400, "JSON tidak valid.")
    return body


@router.post("/api/webhooks/xendit/invoice", tags=["webhook"])
async def webhook_invoice(request: Request, x_callback_token: str = Header(default="", alias="x-callback-token")):
    body = await _callback_body(request, x_callback_token)
    ext, inv_id = str(body.get("external_id") or ""), str(body.get("id") or "")
    row = _get_row(ext) if ext else None
    if not row or (row["invoice_id"] and inv_id and row["invoice_id"] != inv_id):
        log.warning("Callback invoice tidak dikenali: external_id=%s id=%s", ext, inv_id)
        return {"ok": False, "ignored": "unknown_invoice"}
    status = str(body.get("status") or "")
    if not xendit.mock_mode():
        check_id = row["invoice_id"] or inv_id
        try:  # pertahanan lapis kedua: status dari API, bukan dari payload
            inv = xendit.get_invoice(check_id)
        except xendit.XenditError:
            log.warning("Cek ulang invoice %s gagal; callback ditolak sementara", check_id)
            _m().err(503, "Status invoice belum bisa diverifikasi.")  # non-2xx -> Xendit mengulang callback
        if str(inv.get("external_id") or "") != str(row["id"]):
            log.warning("Invoice %s bukan milik escrow %s", check_id, row["id"])
            return {"ok": False, "ignored": "external_id_mismatch"}
        status = str(inv.get("status") or "")
        if not row["invoice_id"]:  # simpan invoice yang sempat gagal tersimpan saat dibuat
            with tx() as cur:
                cur.execute("update escrow_transaksi set invoice_id = %s, invoice_url = coalesce(invoice_url, %s)"
                            " where id = %s and invoice_id is null", (check_id, inv.get("invoice_url"), row["id"]))
    changed = terapkan_invoice(row, status, {"callback": body, "status_terverifikasi": status})
    return {"ok": True, "changed": changed}



@router.post("/api/webhooks/xendit/disbursement", tags=["webhook"])
async def webhook_disbursement(request: Request, x_callback_token: str = Header(default="", alias="x-callback-token")):
    raw = await _callback_body(request, x_callback_token)
    # Payouts v2: {"event": "payout.succeeded", "data": {id, reference_id, status, failure_code}};
    # Disbursement lama: {id, external_id, status, failure_code} di level atas.
    body = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    ext = str(body.get("reference_id") or body.get("external_id") or "")
    disb_id = str(body.get("id") or "")
    row = _get_row(ext.rsplit("-", 1)[0]) if ext.count("-") >= 5 else None  # '<uuid>-<percobaan>'
    if not row or not disb_id or not _aktif_cocok(row, disb_id, ext):
        log.warning("Callback disbursement tidak dikenali/kedaluwarsa: external_id=%s id=%s", ext, disb_id)
        return {"ok": False, "ignored": "unknown_or_stale_disbursement"}
    status = str(body.get("status") or "")
    if not xendit.mock_mode():
        try:
            d = xendit.get_disbursement(disb_id)
        except xendit.XenditError:
            _m().err(503, "Status pencairan belum bisa diverifikasi.")
        if str(d.get("reference_id") or d.get("external_id") or ext) != ext:
            log.warning("Callback disbursement %s: external_id tidak cocok dengan API", disb_id)
            return {"ok": False, "ignored": "external_id_mismatch"}
        status = str(d.get("status") or "")
        body.setdefault("failure_code", d.get("failure_code"))
    changed = terapkan_disbursement(row, status, {"callback": raw, "status_terverifikasi": status,
                                                  "failure_code": body.get("failure_code")}, disbursement_id=disb_id)
    return {"ok": True, "changed": changed}


def _checkout_page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><style>
body{{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f3f6f4;color:#1f3b2b;display:grid;place-items:center;min-height:100vh}}
.card{{background:#fff;border-radius:16px;box-shadow:0 8px 30px #0001;padding:28px;width:min(420px,92vw)}}
.tag{{display:inline-block;font-size:12px;font-weight:700;background:#fff4d6;color:#8a6200;border-radius:99px;padding:4px 10px}}
h1{{font-size:20px;margin:10px 0 4px}} .muted{{color:#6b7a70;font-size:13px}} .row{{display:flex;justify-content:space-between;margin:10px 0;font-size:14px}}
.total{{font-size:26px;font-weight:800;margin:14px 0}} button,.btn{{display:block;width:100%;text-align:center;border:0;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none}}
button{{background:#2f7d4f;color:#fff}} .btn{{background:#eef4f0;color:#1f3b2b;margin-top:10px}} .ok{{background:#e3f1e7;color:#1f6b3d}}
</style></head><body><div class="card">{body}</div></body></html>""")


def _checkout_row(escrow_id: str, t: str) -> dict:
    m = _m()
    if not xendit.mock_mode():
        m.err(404, "Endpoint API tidak ditemukan.")
    row = _get_row(escrow_id)
    if not row or not hmac.compare_digest(_checkout_token(row["id"]), t or ""):
        m.err(404, "Tautan pembayaran tidak valid.")
    return row


def _checkout_body(row: dict, notice: str = "") -> str:
    m = _m()
    web = f"{m.WEB_URL}/tengkulak/transaksi?escrow={row['id']}"
    head = (f'<span class="tag">MODE SIMULASI (tanpa uang sungguhan)</span><h1>Bayar escrow {kode(row)}</h1>'
            f'<div class="muted">Temu Tani • {html.escape(row["offer_code"])} • {html.escape(row["kabupaten"] or "")}</div>'
            f'<div class="row"><span>Petani</span><b>{html.escape(row["petani_display"])}</b></div>'
            f'<div class="row"><span>Berat</span><b>{m.fmt_number(float(row["berat_kg"]))} kg</b></div>'
            f'<div class="row"><span>Harga</span><b>{m.rupiah(row["harga_per_kg"])}/kg</b></div>'
            f'<div class="total">{m.rupiah(int(row["nilai"]))}</div>')
    if row["status"] == "MENUNGGU_BAYAR":
        return head + (f'<form method="post"><button type="submit">Bayar {m.rupiah(int(row["nilai"]))} (simulasi)</button></form>'
                       '<p class="muted">Dana ditahan di escrow dan baru diteruskan ke petani setelah Anda mengonfirmasi gabah diterima.</p>')
    msg = notice or f"Status transaksi: {STATUS_LABEL[row['status']]}."
    return head + f'<p class="btn ok">{html.escape(msg)}</p><a class="btn" href="{html.escape(web)}">Buka transaksi di web Temu Tani</a>'


@router.get("/api/escrow/checkout/{escrow_id}", include_in_schema=False)
def checkout_page(escrow_id: str, t: str = ""):
    row = _checkout_row(escrow_id, t)
    return _checkout_page(f"Bayar {kode(row)}", _checkout_body(row))


@router.post("/api/escrow/checkout/{escrow_id}", include_in_schema=False)
def checkout_pay(escrow_id: str, t: str = ""):
    """Mode simulasi: meniru tengkulak membayar di halaman Xendit lalu callback invoice PAID."""
    row = _checkout_row(escrow_id, t)
    changed = terapkan_invoice(row, "PAID", {"sumber": "checkout_simulasi", "status": "PAID"}, "webhook", "xendit")
    row = _get_row(str(row["id"]))
    notice = "Pembayaran berhasil. Dana aman di escrow; petani sudah diberi tahu." if changed else ""
    return _checkout_page(f"Bayar {kode(row)}", _checkout_body(row, notice))
