"""Temu Tani API (FastAPI) di atas database Supabase (PostgreSQL).

Web dan chatbot WhatsApp berbagi tabel yang sama:
  users (petani/tengkulak/admin), stocks (1 baris/petani = total), stock_batches (sisa per tanggal panen),
  stock_logs (riwayat), requests + offers + offer_events (negosiasi), price_predictions, otp_codes.
Skema: db/migrations/*.sql.

Jalankan lokal:  DATABASE_URL=postgresql://... uvicorn backend.main:app --reload
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from . import auth, pricing, wa
from .db import DatabaseNotConfigured, set_log_context, tx
from .news import load_news
from .store import BlobStore

log = logging.getLogger("temutani")

BASE_DIR = Path(__file__).resolve().parent
ON_VERCEL = bool(os.getenv("VERCEL"))
_default_data = Path("/tmp/temutani") if ON_VERCEL else BASE_DIR / "data" / "runtime"
DATA_DIR = Path(os.getenv("TEMUTANI_DATA_DIR", _default_data))
NEWS_CSV = Path(os.getenv("TEMUTANI_NEWS_CSV", BASE_DIR / "data" / "berita.csv"))
CHATBOT_MAX_BYTES = 2_000_000

WIB = timezone(timedelta(hours=7))
REGIONS = ("Garut", "Cianjur")  # wilayah layanan (sesuai constraint database)
GRAIN = "GKP"
MONTHS = ("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")
STATUS_WEB = {"FARMER_TURN": "Menunggu Petani", "BUYER_TURN": "Penawaran Balik", "AGREED": "Disepakati", "FAILED": "Ditolak"}
STATUS_ADMIN = {"FARMER_TURN": "Menunggu", "BUYER_TURN": "Penawaran Balik", "AGREED": "Disetujui", "FAILED": "Ditolak"}

chatbot_store = BlobStore(DATA_DIR / "chatbot_state.json")  # simulasi chatbot di halaman /chatbot (bukan WA asli)

app = FastAPI(title="Temu Tani API", version="2.0.0", description="Backend Temu Tani (Supabase/PostgreSQL).")

_origins = [o.strip() for o in os.getenv("TEMUTANI_CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )


# ---------------------------------------------------------------------------
# Utilitas
# ---------------------------------------------------------------------------
def err(status: int, message: str):
    raise HTTPException(status_code=status, detail=message)


def now_iso() -> str:
    return datetime.now(WIB).isoformat(timespec="seconds")


def iso(ts: Optional[datetime]) -> Optional[str]:
    return ts.astimezone(WIB).isoformat(timespec="seconds") if ts else None


def fmt_number(n: float) -> str:
    return f"{n:,.0f}".replace(",", ".") if float(n).is_integer() else f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def rupiah(n: float) -> str:
    return "Rp" + fmt_number(round(n))


def id_date(d: date | datetime) -> str:
    if isinstance(d, datetime):
        d = d.astimezone(WIB).date()
    return f"{d.day:02d} {MONTHS[d.month - 1]} {d.year}"


def id_time(ts: datetime) -> str:
    return ts.astimezone(WIB).strftime("%H:%M")


def code_to_id(code: str, prefix: str) -> int:
    """'OFF-12' -> 12. Kode tidak valid -> 404."""
    head, _, num = (code or "").partition("-")
    if head != prefix or not num.isdigit():
        err(404, "Data tidak ditemukan.")
    return int(num)


def buyer_key(phone: str, tengkulak: dict[str, dict]) -> str:
    """ID pembeli di frontend: UUID akun tengkulak bila terdaftar, selain itu ID samaran dari nomor WA."""
    u = tengkulak.get(phone)
    return str(u["id"]) if u else "WA-" + hashlib.sha256(phone.encode()).hexdigest()[:10]


def buyer_label(phone: str, tengkulak: dict[str, dict]) -> str:
    u = tengkulak.get(phone)
    return u["name"] if u else "Pembeli WhatsApp ••" + phone[-3:]


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    fields = ", ".join(str(e["loc"][-1]) for e in exc.errors())
    return JSONResponse(status_code=422, content={"detail": f"Data belum valid ({fields}).", "errors": exc.errors()})


@app.exception_handler(DatabaseNotConfigured)
async def db_missing_handler(_: Request, exc: DatabaseNotConfigured):
    return JSONResponse(status_code=503, content={"detail": "Database belum dikonfigurasi (DATABASE_URL)."})


@app.exception_handler(psycopg.OperationalError)
async def db_down_handler(_: Request, exc: psycopg.OperationalError):
    log.error("Database tidak dapat dihubungi: %s", exc)
    return JSONResponse(status_code=503, content={"detail": "Database sedang tidak dapat dihubungi. Coba lagi sebentar."})


# ---------------------------------------------------------------------------
# Autentikasi
# ---------------------------------------------------------------------------
class Actor(BaseModel):
    role: Literal["petani", "tengkulak", "admin"]
    user: str          # UUID users.id
    phone: str         # +62...
    name: str
    kabupaten: Optional[str] = None
    kecamatan: Optional[str] = None
    consent: bool = False


USER_COLS = "id, phone, role, name, display_name, kabupaten, kecamatan, contact_sharing_consent, password_hash"


def _actor_from_row(u: dict) -> Actor:
    return Actor(role=u["role"], user=str(u["id"]), phone=u["phone"], name=u["name"],
                 kabupaten=u["kabupaten"], kecamatan=u["kecamatan"], consent=u["contact_sharing_consent"])


def _bearer_user(authorization: str) -> Optional[dict]:
    if not authorization.lower().startswith("bearer "):
        return None
    data = auth.read_token(authorization[7:].strip())
    if not data:
        err(401, "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.")
    with tx() as cur:
        cur.execute(f"select {USER_COLS} from users where id = %s", (data["u"],))
        u = cur.fetchone()
    if not u or u["role"] != data.get("r") or not u["password_hash"] or auth.password_fingerprint(u["password_hash"]) != data.get("pv"):
        err(401, "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.")
    return u


def get_actor(authorization: str = Header(default="", alias="Authorization")) -> Actor:
    u = _bearer_user(authorization)
    if not u:
        err(401, "Silakan masuk terlebih dahulu.")
    return _actor_from_row(u)


def optional_actor(authorization: str = Header(default="", alias="Authorization")) -> Optional[Actor]:
    u = _bearer_user(authorization)
    return _actor_from_row(u) if u else None


def require(actor: Actor, *roles: str) -> None:
    if actor.role not in roles:
        err(403, "Aksi ini tidak diizinkan untuk peran Anda.")


def _session(u: dict) -> dict:
    return {
        "token": auth.issue_token(str(u["id"]), u["role"], u["password_hash"]),
        "user": {
            "id": str(u["id"]), "role": u["role"], "phone": auth.from_e164(u["phone"]), "name": u["name"],
            "region": u["kabupaten"] or "", "district": u["kecamatan"] or "", "shareContact": u["contact_sharing_consent"],
        },
    }


# ---------------------------------------------------------------------------
# Query bersama
# ---------------------------------------------------------------------------
def ai_reference(cur, kabupaten: Optional[str]) -> dict[str, int]:
    """Harga wajar terbaru dari price_predictions (bulan berjalan atau sebelumnya); fallback simulasi."""
    if not kabupaten:
        return {}
    cur.execute(
        "select price_per_kg from price_predictions where kabupaten = %s and grain_type = 'GKP'"
        " and period <= date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date order by period desc, id desc limit 1",
        (kabupaten,),
    )
    row = cur.fetchone()
    if row:
        return {GRAIN: row["price_per_kg"]}
    return dict(pricing.AI_REFERENCE.get(kabupaten, {}))


def tengkulak_by_phone(cur, phones: set[str]) -> dict[str, dict]:
    if not phones:
        return {}
    cur.execute("select id, phone, name from users where role = 'tengkulak' and phone = any(%s)", (list(phones),))
    return {r["phone"]: r for r in cur.fetchall()}


def stock_rows(cur, where: str, params: tuple) -> list[dict]:
    cur.execute(
        f"""select s.id, s.farmer_id, s.quantity_kg, s.available_date, u.kabupaten, u.kecamatan, u.name, u.display_name,
                   (select max(b.harvest_date) from stock_batches b where b.stock_id = s.id and b.quantity_kg > 0) as last_harvest
            from stocks s join users u on u.id = s.farmer_id
            where s.grain_type = 'GKP' and {where} order by s.id""",
        params,
    )
    return cur.fetchall()


def stock_view(s: dict) -> dict:
    qty = s["quantity_kg"]
    return {
        "id": f"STK-{s['id']}", "farmerId": str(s["farmer_id"]), "region": s["kabupaten"], "type": GRAIN,
        "volume": qty, "available": qty, "harvest": (s["last_harvest"] or s["available_date"]).isoformat(),
        "status": "Tersedia" if qty > 0 else "Habis", "moisture": None,
    }


def offer_rows(cur, where: str, params: tuple) -> tuple[list[dict], dict[int, list[dict]]]:
    cur.execute(
        f"""select o.*, r.buyer_phone, u.kabupaten as farmer_kab, u.name as farmer_name, u.display_name as farmer_display,
                   u.phone as farmer_phone, u.contact_sharing_consent as farmer_consent
            from offers o join requests r on r.id = o.request_id join users u on u.id = o.farmer_id
            where {where} order by o.created_at, o.id""",
        params,
    )
    offers = cur.fetchall()
    events: dict[int, list[dict]] = {o["id"]: [] for o in offers}
    if offers:
        cur.execute("select * from offer_events where offer_id = any(%s) order by created_at, id", (list(events),))
        for e in cur.fetchall():
            events[e["offer_id"]].append(e)
    return offers, events


def offer_view(o: dict, events: list[dict], buyer_id: str, ai_ref: Optional[int]) -> dict:
    history, last_buyer = [], o["initial_price"]
    for e in events:
        who = {"buyer": "Pembeli", "farmer": "Petani", "system": "Sistem"}[e["actor"]]
        if e["action"] == "initial":
            label = "Penawaran awal dikirim"
            last_buyer = e["price"] or last_buyer
        elif e["action"] == "counter":
            label = "Harga balik diajukan" if e["actor"] == "farmer" else "Penawaran baru diajukan"
            if e["actor"] == "buyer":
                last_buyer = e["price"] or last_buyer
        elif e["action"] == "accept":
            label = "Harga disepakati"
        else:
            label = "Stok tidak mencukupi, penawaran gagal" if e["note"] == "insufficient_stock" else "Penawaran ditolak"
        history.append({"at": iso(e["created_at"]), "actor": who, "label": label, "price": e["price"] if e["action"] != "fail" else None})
    view = {
        "id": o["code"], "buyerId": buyer_id, "farmerId": str(o["farmer_id"]), "stockId": f"STK-{o['stock_id']}",
        "volume": o["qty_kg"], "initialBid": o["initial_price"], "currentBid": last_buyer,
        "counter": o["current_price"] if o["current_by"] == "farmer" else None,
        "status": STATUS_WEB[o["status"]], "created": iso(o["created_at"]), "history": history,
    }
    if o["status"] == "AGREED":
        view["agreedPrice"] = o["agreed_price"]
    if ai_ref is not None:
        view["aiRef"] = ai_ref
    return view


def trx_view(o: dict, buyer_id: str, contact: Optional[str]) -> dict:
    return {
        "id": f"TRX-{o['id']}", "offerId": o["code"], "buyerId": buyer_id, "farmerId": str(o["farmer_id"]),
        "stockId": f"STK-{o['stock_id']}", "volume": o["qty_kg"], "price": o["agreed_price"],
        "date": o["agreed_at"].astimezone(WIB).date().isoformat(), "contact": contact,
    }


def activity_feed(offers: list[dict], events: dict[int, list[dict]], logs: list[dict]) -> list[dict]:
    feed = []
    for o in offers:
        for e in events[o["id"]]:
            if e["action"] == "initial":
                title, note = f"Penawaran baru {o['code']}", f"{fmt_number(o['qty_kg'])} kg GKP • {o['farmer_kab']} • {rupiah(e['price'])}/kg"
            elif e["action"] == "counter":
                who = "Petani mengajukan harga balik" if e["actor"] == "farmer" else "Pembeli mengajukan harga baru"
                title, note = f"{who} {o['code']}", f"{rupiah(e['price'])}/kg"
            elif e["action"] == "accept":
                title, note = f"Kesepakatan baru {o['code']}", f"TRX-{o['id']} • {fmt_number(o['qty_kg'])} kg"
            else:
                title, note = f"Penawaran tidak berlanjut {o['code']}", "Stok tidak mencukupi" if e["note"] == "insufficient_stock" else "Penawaran ditolak"
            feed.append({"id": f"EVT-{e['id']}", "at": iso(e["created_at"]), "title": title, "note": note})
    for x in logs:
        sign = "+" if x["delta_kg"] >= 0 else "−"
        feed.append({"id": f"LOG-{x['id']}", "at": iso(x["created_at"]), "title": x["activity"],
                     "note": f"{sign}{fmt_number(abs(x['delta_kg']))} kg • total {fmt_number(x['total_kg'])} kg"})
    feed.sort(key=lambda a: a["at"], reverse=True)
    return feed[:12]


def state_version(cur) -> int:
    cur.execute(
        """select extract(epoch from greatest(
              (select max(updated_at) from offers), (select max(updated_at) from stocks),
              (select max(created_at) from stock_logs), (select max(updated_at) from users),
              (select max(created_at) from offer_events), 'epoch'::timestamptz)) * 1000 as v"""
    )
    return int(cur.fetchone()["v"])


def snapshot(cur, actor: Actor) -> dict:
    base = {"version": state_version(cur), "actor": {"role": actor.role, "user": actor.user}}
    if actor.role == "petani":
        stocks = stock_rows(cur, "s.farmer_id = %s", (actor.user,))
        cur.execute(
            "select b.id, b.harvest_date, b.quantity_kg from stock_batches b join stocks s on s.id = b.stock_id"
            " where s.farmer_id = %s and b.quantity_kg > 0 order by b.harvest_date, b.id",
            (actor.user,),
        )
        batches = [{"id": f"BAT-{b['id']}", "harvest": b["harvest_date"].isoformat(), "volume": b["quantity_kg"]} for b in cur.fetchall()]
        cur.execute("select * from stock_logs where farmer_id = %s order by created_at desc, id desc limit 200", (actor.user,))
        logs = cur.fetchall()
        offers, events = offer_rows(cur, "o.farmer_id = %s", (actor.user,))
        tk = tengkulak_by_phone(cur, {o["buyer_phone"] for o in offers})
        ref = ai_reference(cur, actor.kabupaten)
        buyers = {buyer_key(o["buyer_phone"], tk): buyer_label(o["buyer_phone"], tk) for o in offers}
        return {
            **base,
            "farmers": [{"id": actor.user, "name": actor.name, "region": actor.kabupaten, "village": actor.kecamatan}],
            "buyers": [{"id": k, "label": v} for k, v in buyers.items()],
            "stocks": [stock_view(s) for s in stocks],
            "batches": batches,
            "stockLog": [{"id": f"LOG-{x['id']}", "farmerId": actor.user, "at": iso(x["created_at"]), "activity": x["activity"],
                          "harvest": x["harvest_date"].isoformat() if x["harvest_date"] else None,
                          "delta": x["delta_kg"], "total": x["total_kg"]} for x in logs],
            "offers": [offer_view(o, events[o["id"]], buyer_key(o["buyer_phone"], tk), o.get("ai") or ref.get(GRAIN)) for o in offers],
            "transactions": [trx_view(o, buyer_key(o["buyer_phone"], tk), auth.from_e164(o["buyer_phone"])) for o in offers if o["status"] == "AGREED"],
            "activities": activity_feed(offers, events, logs[:12]),
            "aiReference": ref,
        }
    if actor.role == "tengkulak":
        offers, events = offer_rows(cur, "r.buyer_phone = %s", (actor.phone,))
        offered_stock = list({o["stock_id"] for o in offers})
        stocks = stock_rows(cur, "(s.quantity_kg > 0 or s.id = any(%s))", (offered_stock,))
        farmers = {str(s["farmer_id"]): s for s in stocks}
        for o in offers:  # petani yang stoknya sudah habis tetapi pernah ditawar
            farmers.setdefault(str(o["farmer_id"]), {"display_name": o["farmer_display"], "kabupaten": o["farmer_kab"], "kecamatan": None})
        return {
            **base,
            # Nama petani untuk pembeli memakai display_name (sesuai kebijakan privasi chatbot).
            "farmers": [{"id": fid, "name": f["display_name"], "region": f["kabupaten"], "village": f.get("kecamatan") or ""} for fid, f in farmers.items()],
            "buyers": [{"id": actor.user, "label": actor.name}],
            "stocks": [stock_view(s) for s in stocks],
            # aiRef (harga wajar AI) privat untuk petani: tidak pernah dikirim ke pembeli.
            "offers": [offer_view(o, events[o["id"]], actor.user, None) for o in offers],
            "transactions": [trx_view(o, actor.user, auth.from_e164(o["farmer_phone"]) if o["farmer_consent"] else None)
                             for o in offers if o["status"] == "AGREED"],
            "activities": activity_feed(offers, events, []),
        }
    err(403, "Snapshot peran hanya untuk petani atau tengkulak.")


def result(actor: Actor, message: str, **extra) -> dict:
    with tx() as cur:
        return {"state": snapshot(cur, actor), "message": message, **extra}


# ---------------------------------------------------------------------------
# Skema input
# ---------------------------------------------------------------------------
def _clean(v: Optional[str]) -> Optional[str]:
    return " ".join(v.split()) if isinstance(v, str) else v


class RegisterIn(BaseModel):
    role: Literal["petani", "tengkulak"]
    name: str = Field(min_length=3, max_length=80)
    phone: str = Field(min_length=9, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    region: Optional[str] = Field(default=None, max_length=60)    # kabupaten (petani)
    district: Optional[str] = Field(default=None, max_length=60)  # kecamatan (petani)

    @field_validator("name", "region", "district")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        return _clean(v)


class LoginIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)
    password: str = Field(min_length=1, max_length=128)


class ProfileIn(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    region: Optional[str] = Field(default=None, max_length=60)
    district: Optional[str] = Field(default=None, max_length=60)
    shareContact: Optional[bool] = None

    @field_validator("name", "region", "district")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        return _clean(v)


class OtpIn(BaseModel):
    purpose: Literal["reset_password", "change_password"]
    phone: Optional[str] = Field(default=None, max_length=20)  # wajib untuk reset_password


class ResetPasswordIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=128)


class StockIn(BaseModel):
    volume: int = Field(gt=0, le=10_000_000)  # kg
    harvest: date


class StockRemainingItem(BaseModel):
    id: str
    volume: int = Field(ge=0, le=10_000_000)


class StockRemainingIn(BaseModel):
    items: list[StockRemainingItem] = Field(min_length=1, max_length=100)


class OfferIn(BaseModel):
    stockId: str
    volume: int = Field(gt=0, le=10_000_000)
    price: int = Field(gt=0, le=1_000_000)


class PriceIn(BaseModel):
    price: int = Field(gt=0, le=1_000_000)


def _valid_phone(raw: str) -> str:
    local = auth.normalize_phone(raw)
    if not local:
        err(400, "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.")
    return auth.to_e164(local)


def _valid_region(region: Optional[str], district: Optional[str]) -> tuple[str, str]:
    kab = pricing.canonical_region(region or "")
    if kab not in REGIONS:
        err(400, "Kabupaten harus Garut atau Cianjur.")
    if not district or len(district) < 2:
        err(400, "Kecamatan wajib diisi.")
    return kab, district


# ---------------------------------------------------------------------------
# Endpoint umum
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["umum"])
def health():
    try:
        with tx() as cur:
            cur.execute("select 1")
        database = "ok"
    except Exception:  # noqa: BLE001
        database = "error"
    return {"status": "ok", "database": database, "whatsapp": "configured" if wa.configured() else "not_configured", "time": now_iso()}


# ---------------------------------------------------------------------------
# Akun
# ---------------------------------------------------------------------------
@app.post("/api/auth/register", tags=["akun"], status_code=201)
def register(body: RegisterIn):
    phone = _valid_phone(body.phone)
    kab, kec = _valid_region(body.region, body.district) if body.role == "petani" else (None, None)
    password_hash = auth.hash_password(body.password)
    with tx() as cur:
        cur.execute("select password_hash from users where phone = %s", (phone,))
        existing = cur.fetchone()
        if existing:
            if not existing["password_hash"]:
                err(409, "Nomor ini sudah terdaftar melalui WhatsApp. Gunakan menu Lupa Password untuk membuat password.")
            err(409, "Nomor HP sudah terdaftar. Silakan masuk.")
        cur.execute(
            f"insert into users (phone, role, name, display_name, kabupaten, kecamatan, password_hash)"
            f" values (%s, %s, %s, %s, %s, %s, %s) returning {USER_COLS}",
            (phone, body.role, body.name, body.name, kab, kec, password_hash),
        )
        user = cur.fetchone()
        if body.role == "petani":
            cur.execute("insert into stocks (farmer_id, grain_type, quantity_kg) values (%s, 'GKP', 0) on conflict do nothing", (user["id"],))
    return _session(user)


@app.post("/api/auth/login", tags=["akun"])
def login(body: LoginIn):
    local = auth.normalize_phone(body.phone)
    user = None
    if local:
        with tx() as cur:
            cur.execute(f"select {USER_COLS} from users where phone = %s", (auth.to_e164(local),))
            user = cur.fetchone()
    if user and not user["password_hash"]:
        err(401, "Akun ini belum memiliki password. Gunakan menu Lupa Password untuk membuatnya.")
    if not user or not auth.verify_password(body.password, user["password_hash"]):
        err(401, "Nomor HP atau password salah.")
    return _session(user)


@app.get("/api/auth/me", tags=["akun"])
def me(actor: Actor = Depends(get_actor)):
    with tx() as cur:
        cur.execute(f"select {USER_COLS} from users where id = %s", (actor.user,))
        return _session(cur.fetchone())["user"]


@app.put("/api/auth/profile", tags=["akun"])
def update_profile(body: ProfileIn, actor: Actor = Depends(get_actor)):
    kab, kec = _valid_region(body.region, body.district) if actor.role == "petani" else (None, None)
    with tx() as cur:
        cur.execute(
            f"""update users set
                   display_name = case when display_name = name then %s else display_name end,
                   name = %s,
                   kabupaten = coalesce(%s, kabupaten), kecamatan = coalesce(%s, kecamatan),
                   contact_sharing_consent = case when role = 'petani' then coalesce(%s, contact_sharing_consent) else contact_sharing_consent end
                where id = %s returning {USER_COLS}""",
            (body.name, body.name, kab, kec, body.shareContact, actor.user),
        )
        user = cur.fetchone()
    return {**_session(user), "message": "Profil berhasil diperbarui."}


# ---- Kode verifikasi WhatsApp -------------------------------------------------
@app.post("/api/auth/otp", tags=["akun"])
def request_otp(body: OtpIn, actor: Optional[Actor] = Depends(optional_actor)):
    if body.purpose == "change_password":
        if not actor:
            err(401, "Silakan masuk terlebih dahulu.")
        phone = actor.phone
    else:
        if not body.phone:
            err(400, "Nomor HP wajib diisi.")
        phone = _valid_phone(body.phone)
    if not wa.configured() and not wa.dev_mode():
        err(503, "Pengiriman kode via WhatsApp belum dikonfigurasi. Hubungi admin Temu Tani.")
    generic = {"message": f"Jika nomor terdaftar, kode verifikasi dikirim ke WhatsApp {auth.mask_phone(auth.from_e164(phone))}.",
               "expiresIn": auth.OTP_TTL_SECONDS}
    code = auth.new_otp()
    with tx() as cur:
        cur.execute("select id from users where phone = %s", (phone,))
        if not cur.fetchone():
            return generic  # tidak membocorkan nomor mana yang terdaftar
        cur.execute(
            "select count(*) as n, max(created_at) as last from otp_codes where phone = %s and purpose = %s and created_at > now() - interval '1 hour'",
            (phone, body.purpose),
        )
        rate = cur.fetchone()
        if rate["n"] >= auth.OTP_MAX_PER_HOUR:
            err(429, "Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.")
        if rate["last"]:
            wait = auth.OTP_COOLDOWN_SECONDS - int((datetime.now(timezone.utc) - rate["last"]).total_seconds())
            if wait > 0:
                err(429, f"Tunggu {wait} detik sebelum meminta kode baru.")
        cur.execute("update otp_codes set used_at = now() where phone = %s and purpose = %s and used_at is null", (phone, body.purpose))
        cur.execute(
            "insert into otp_codes (phone, purpose, code_hash, expires_at) values (%s, %s, %s, now() + make_interval(secs => %s)) returning id",
            (phone, body.purpose, auth.hash_otp(phone, body.purpose, code), auth.OTP_TTL_SECONDS),
        )
        otp_id = cur.fetchone()["id"]
    if wa.configured():
        text = (f"Kode verifikasi Temu Tani: *{code}*\n\nBerlaku 5 menit untuk "
                f"{'mengatur ulang' if body.purpose == 'reset_password' else 'mengubah'} password. Jangan berikan kode ini kepada siapa pun.")
        try:
            wa.send_text(phone, text)
        except wa.WhatsAppError:
            with tx() as cur:
                cur.execute("update otp_codes set used_at = now() where id = %s", (otp_id,))
            err(502, "Kode gagal dikirim ke WhatsApp. Coba lagi beberapa saat lagi.")
        return generic
    return {**generic, "devCode": code}  # TEMUTANI_OTP_DEV=1 dan WAHA belum di-set (hanya lokal)


def _consume_otp(phone: str, purpose: str, code: str) -> None:
    """Validasi kode; percobaan salah tetap tercatat (commit) sebelum error dikembalikan."""
    outcome = "ok"
    with tx() as cur:
        cur.execute(
            "select id, code_hash, attempts from otp_codes where phone = %s and purpose = %s and used_at is null"
            " and expires_at > now() order by created_at desc limit 1 for update",
            (phone, purpose),
        )
        row = cur.fetchone()
        if not row:
            outcome = "missing"
        elif row["attempts"] >= auth.OTP_MAX_ATTEMPTS:
            cur.execute("update otp_codes set used_at = now() where id = %s", (row["id"],))
            outcome = "locked"
        elif auth.hash_otp(phone, purpose, code) != row["code_hash"]:
            cur.execute("update otp_codes set attempts = attempts + 1 where id = %s", (row["id"],))
            outcome = "wrong"
        else:
            cur.execute("update otp_codes set used_at = now() where id = %s", (row["id"],))
    if outcome == "missing":
        err(400, "Kode verifikasi tidak berlaku atau sudah kedaluwarsa. Minta kode baru.")
    if outcome == "locked":
        err(429, "Terlalu banyak percobaan. Minta kode baru.")
    if outcome == "wrong":
        err(400, "Kode verifikasi salah.")


def _set_password(user_id: str, password: str) -> dict:
    with tx() as cur:
        cur.execute(f"update users set password_hash = %s where id = %s returning {USER_COLS}", (auth.hash_password(password), user_id))
        return cur.fetchone()


@app.post("/api/auth/password/reset", tags=["akun"])
def reset_password(body: ResetPasswordIn):
    phone = _valid_phone(body.phone)
    _consume_otp(phone, "reset_password", body.code)
    with tx() as cur:
        cur.execute("select id from users where phone = %s", (phone,))
        row = cur.fetchone()
    if not row:
        err(400, "Kode verifikasi salah.")
    return {**_session(_set_password(str(row["id"]), body.password)), "message": "Password berhasil diatur ulang."}


@app.post("/api/auth/password/change", tags=["akun"])
def change_password(body: ChangePasswordIn, actor: Actor = Depends(get_actor)):
    _consume_otp(actor.phone, "change_password", body.code)
    # Token baru (sidik password berubah): sesi di perangkat lain otomatis keluar.
    return {**_session(_set_password(actor.user, body.password)), "message": "Password berhasil diubah."}


# ---------------------------------------------------------------------------
# Harga & berita
# ---------------------------------------------------------------------------
@app.get("/api/prices", tags=["harga"])
def get_prices(wilayah: Optional[str] = Query(default=None), actor: Actor = Depends(get_actor)):
    """Prediksi harga AI. Petani dikunci ke kabupatennya; tengkulak tidak berhak."""
    require(actor, "petani", "admin")
    with tx() as cur:
        current = {r: ai_reference(cur, r).get(GRAIN) for r in REGIONS}
    if actor.role == "petani":
        payload = pricing.price_payload([actor.kabupaten] if actor.kabupaten in REGIONS else [], current)
        payload["lockedArea"] = actor.kabupaten
        return payload
    if wilayah and wilayah not in REGIONS:
        err(404, "Wilayah tidak tersedia.")
    payload = pricing.price_payload([wilayah] if wilayah else list(REGIONS), current)
    payload["lockedArea"] = None
    return payload


@app.get("/api/berita", tags=["berita"])
def get_news(dari: Optional[str] = Query(default=None, alias="from"), sampai: Optional[str] = Query(default=None, alias="to")):
    if not NEWS_CSV.exists():
        err(503, "File berita.csv belum tersedia di server.")
    items = load_news(NEWS_CSV)
    if dari:
        items = [n for n in items if n["tanggal"] >= dari]
    if sampai:
        items = [n for n in items if n["tanggal"] <= sampai]
    if not items and not (dari or sampai):
        err(503, "berita.csv berhasil dibaca, tetapi tidak ada baris berita yang valid.")
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Admin: ringkasan dari data asli database
# ---------------------------------------------------------------------------
@app.get("/api/admin/dashboard", tags=["admin"])
def get_admin_dashboard(actor: Actor = Depends(get_actor)):
    require(actor, "admin")
    with tx() as cur:
        stocks = stock_rows(cur, "true", ())
        offers, events = offer_rows(cur, "true", ())
        tk = tengkulak_by_phone(cur, {o["buyer_phone"] for o in offers})
        refs = {r: ai_reference(cur, r).get(GRAIN) for r in REGIONS}
        cur.execute(
            "select l.*, u.name, u.kabupaten from stock_logs l join users u on u.id = l.farmer_id order by l.created_at desc limit 30"
        )
        logs = cur.fetchall()
    open_offers: dict[int, int] = {}
    for o in offers:
        if o["status"] in ("FARMER_TURN", "BUYER_TURN"):
            open_offers[o["stock_id"]] = open_offers.get(o["stock_id"], 0) + 1
    count_offers: dict[int, int] = {}
    for o in offers:
        count_offers[o["stock_id"]] = count_offers.get(o["stock_id"], 0) + 1

    def a_stock(s):
        status = "Terjual" if s["quantity_kg"] == 0 else "Dalam Negosiasi" if open_offers.get(s["id"]) else "Tersedia"
        return {"id": f"STK-{s['id']}", "farmer": s["name"], "location": s["kabupaten"], "type": GRAIN, "volume": s["quantity_kg"],
                "harvest": id_date(s["last_harvest"] or s["available_date"]), "status": status, "offers": count_offers.get(s["id"], 0)}

    def a_offer(o):
        hist = [[{"initial": "Penawaran dikirim", "counter": "Petani ajukan penawaran balik" if e["actor"] == "farmer" else "Pembeli ajukan harga baru",
                  "accept": "Kesepakatan tercapai", "fail": "Stok tidak mencukupi" if e["note"] == "insufficient_stock" else "Penawaran ditolak"}[e["action"]],
                  f"{id_date(e['created_at'])} · {id_time(e['created_at'])}",
                  f"{rupiah(e['price'])}/kg" if e["price"] and e["action"] != "fail" else "-"] for e in events[o["id"]]]
        buyer_price = next((e["price"] for e in reversed(events[o["id"]]) if e["actor"] == "buyer" and e["price"]), o["initial_price"])
        item = {"id": o["code"], "buyer": buyer_label(o["buyer_phone"], tk), "location": o["farmer_kab"], "farmer": o["farmer_name"],
                "stock": f"STK-{o['stock_id']}", "volume": o["qty_kg"], "price": buyer_price, "ai": refs.get(o["farmer_kab"]),
                "status": STATUS_ADMIN[o["status"]], "date": id_date(o["created_at"]), "time": id_time(o["created_at"]), "history": hist}
        if o["current_by"] == "farmer" and o["status"] != "AGREED":
            item["counter"] = o["current_price"]
        return item

    trx = [{"id": f"TRX-{o['id']}", "farmer": o["farmer_name"], "buyer": buyer_label(o["buyer_phone"], tk), "location": o["farmer_kab"],
            "stock": f"STK-{o['stock_id']}", "volume": o["qty_kg"], "price": o["agreed_price"], "date": id_date(o["agreed_at"]),
            "status": "Disepakati"} for o in reversed(offers) if o["status"] == "AGREED"]
    ev = []
    for o in offers:
        for e in events[o["id"]]:
            kind, icon, title = {
                "initial": ("Penawaran", "handshake", f"{buyer_label(o['buyer_phone'], tk)} mengajukan penawaran"),
                "counter": ("Negosiasi", "arrow-left-right", f"{o['farmer_name'] if e['actor'] == 'farmer' else buyer_label(o['buyer_phone'], tk)} mengajukan harga balik"),
                "accept": ("Negosiasi", "handshake", f"Kesepakatan {o['code']} tercapai"),
                "fail": ("Negosiasi", "message-circle-warning", f"Penawaran {o['code']} tidak berlanjut"),
            }[e["action"]]
            ev.append((e["created_at"], {"icon": icon, "title": title, "note": f"{o['code']} · {o['farmer_kab']} · {rupiah(e['price'] or o['current_price'])}/kg",
                                         "time": id_time(e["created_at"]), "kind": kind, "status": "Berhasil", "location": o["farmer_kab"]}))
    for x in logs:
        ev.append((x["created_at"], {"icon": "refresh-cw" if x["delta_kg"] < 0 else "package-plus", "title": f"{x['name']}: {x['activity']}",
                                     "note": f"{'+' if x['delta_kg'] >= 0 else '−'}{fmt_number(abs(x['delta_kg']))} kg · total {fmt_number(x['total_kg'])} kg",
                                     "time": id_time(x["created_at"]), "kind": "Stok", "status": "Berhasil", "location": x["kabupaten"]}))
    ev.sort(key=lambda t: t[0], reverse=True)
    return {
        "stocks": [a_stock(s) for s in stocks],
        "offers": [a_offer(o) for o in reversed(offers)],
        "transactions": trx,
        "events": [e for _, e in ev[:20]],
    }


# ---------------------------------------------------------------------------
# Dashboard petani & tengkulak
# ---------------------------------------------------------------------------
@app.get("/api/state", tags=["peran"])
def get_state(actor: Actor = Depends(get_actor)):
    with tx() as cur:
        return snapshot(cur, actor)


@app.get("/api/state/version", tags=["peran"])
def get_state_version():
    """Endpoint ringan untuk polling sinkronisasi (perubahan dari web maupun chatbot WA)."""
    with tx() as cur:
        return {"version": state_version(cur)}


def _own_stock(cur, farmer_id: str, harvest: date) -> dict:
    cur.execute(
        "insert into stocks (farmer_id, grain_type, quantity_kg, available_date) values (%s, 'GKP', 0, %s)"
        " on conflict (farmer_id, grain_type) do nothing",
        (farmer_id, harvest),
    )
    cur.execute("select * from stocks where farmer_id = %s and grain_type = 'GKP' for update", (farmer_id,))
    return cur.fetchone()


@app.post("/api/stocks", tags=["petani"])
def add_stock(body: StockIn, actor: Actor = Depends(get_actor)):
    """Tambah hasil panen. Panen di tanggal yang sama digabung ke batch yang sudah ada."""
    require(actor, "petani")
    with tx() as cur:
        s = _own_stock(cur, actor.user, body.harvest)
        cur.execute(
            "insert into stock_batches (stock_id, harvest_date, quantity_kg) values (%s, %s, %s)"
            " on conflict (stock_id, harvest_date) do update set quantity_kg = stock_batches.quantity_kg + excluded.quantity_kg returning id",
            (s["id"], body.harvest, body.volume),
        )
        batch_id = cur.fetchone()["id"]
        set_log_context(cur, "Tambah panen", "web", body.harvest.isoformat(), batch_synced=True)
        cur.execute(
            "update stocks set quantity_kg = quantity_kg + %s, available_date = greatest(available_date, %s) where id = %s",
            (body.volume, body.harvest, s["id"]),
        )
        set_log_context(cur)
    return result(actor, "Stok gabah berhasil ditambahkan.", id=f"BAT-{batch_id}")


@app.put("/api/stocks/remaining", tags=["petani"])
def update_stock_remaining(body: StockRemainingIn, actor: Actor = Depends(get_actor)):
    """Perbarui sisa stok per tanggal panen. Setiap perubahan tercatat di riwayat (stock_logs)."""
    require(actor, "petani")
    changed = 0
    with tx() as cur:
        for item in body.items:
            cur.execute(
                "select b.id, b.stock_id, b.harvest_date, b.quantity_kg from stock_batches b join stocks s on s.id = b.stock_id"
                " where b.id = %s and s.farmer_id = %s for update of b, s",
                (code_to_id(item.id, "BAT"), actor.user),
            )
            b = cur.fetchone()
            if not b:
                err(404, "Stok tidak ditemukan.")
            delta = item.volume - b["quantity_kg"]
            if delta == 0:
                continue
            cur.execute("update stock_batches set quantity_kg = %s where id = %s", (item.volume, b["id"]))
            set_log_context(cur, "Update stok", "web", b["harvest_date"].isoformat(), batch_synced=True)
            cur.execute("update stocks set quantity_kg = quantity_kg + %s where id = %s", (delta, b["stock_id"]))
            changed += 1
        set_log_context(cur)
        cur.execute(
            "delete from stock_batches where quantity_kg = 0 and stock_id in (select id from stocks where farmer_id = %s)", (actor.user,)
        )
    return result(actor, "Stok berhasil diperbarui." if changed else "Tidak ada perubahan stok.")


# ---------------------------------------------------------------------------
# Penawaran & negosiasi (memakai tabel & fungsi yang sama dengan chatbot WA)
# ---------------------------------------------------------------------------
@app.post("/api/offers", tags=["tengkulak"])
def create_offer(body: OfferIn, actor: Actor = Depends(get_actor)):
    require(actor, "tengkulak")
    with tx() as cur:
        cur.execute(
            "select s.id, s.farmer_id, s.quantity_kg, u.kabupaten from stocks s join users u on u.id = s.farmer_id"
            " where s.id = %s for update of s",
            (code_to_id(body.stockId, "STK"),),
        )
        s = cur.fetchone()
        if not s or s["quantity_kg"] <= 0:
            err(409, "Stok tidak lagi tersedia.")
        if s["quantity_kg"] < body.volume:
            err(409, f"Volume yang Anda tawarkan ({fmt_number(body.volume)} kg) melebihi stok tersedia ({fmt_number(s['quantity_kg'])} kg GKP).")
        # Skema chatbot: setiap penawaran terkait satu permintaan (requests). Dari web dibuat otomatis.
        cur.execute(
            "insert into requests (buyer_phone, kabupaten, need_kg, initial_price, offered_kg) values (%s, %s, %s, %s, %s) returning id",
            (actor.phone, s["kabupaten"], body.volume, body.price, body.volume),
        )
        req_id = cur.fetchone()["id"]
        cur.execute(
            "insert into offers (request_id, stock_id, farmer_id, qty_kg, initial_price, current_price, current_by, status)"
            " values (%s, %s, %s, %s, %s, %s, 'buyer', 'FARMER_TURN') returning id, code",
            (req_id, s["id"], s["farmer_id"], body.volume, body.price, body.price),
        )
        o = cur.fetchone()
        cur.execute("insert into offer_events (offer_id, actor, action, price, note) values (%s, 'buyer', 'initial', %s, 'web')", (o["id"], body.price))
    return result(actor, "Penawaran dikirim kepada petani.", id=o["code"])


def _own_offer(cur, actor: Actor, code: str) -> dict:
    cur.execute(
        "select o.*, r.buyer_phone from offers o join requests r on r.id = o.request_id where o.id = %s for update of o",
        (code_to_id(code, "OFF"),),
    )
    o = cur.fetchone()
    owner_ok = o and (str(o["farmer_id"]) == actor.user if actor.role == "petani" else o["buyer_phone"] == actor.phone)
    if not owner_ok:
        err(404, "Penawaran tidak ditemukan.")
    return o


def _accept(actor: Actor, code: str, who: str, message: str) -> dict:
    with tx() as cur:
        o = _own_offer(cur, actor, code)
        cur.execute("select accept_offer(%s, %s) as r", (o["id"], who))
        res = cur.fetchone()["r"]
    # Commit dulu: bila stok kurang, fungsi accept_offer menandai penawaran gagal (perilaku chatbot).
    if not res.get("ok"):
        if res.get("reason") == "insufficient_stock":
            err(409, "Stok sudah berkurang. Penawaran tidak dapat disetujui.")
        err(409, "Status penawaran sudah berubah.")
    return result(actor, message, id=f"TRX-{o['id']}")


@app.post("/api/offers/{offer_id}/accept", tags=["petani"])
def accept_offer(offer_id: str, actor: Actor = Depends(get_actor)):
    require(actor, "petani")
    return _accept(actor, offer_id, "farmer", "Penawaran berhasil disepakati.")


@app.post("/api/offers/{offer_id}/accept-counter", tags=["tengkulak"])
def accept_counter(offer_id: str, actor: Actor = Depends(get_actor)):
    require(actor, "tengkulak")
    return _accept(actor, offer_id, "buyer", "Harga balik disepakati.")


@app.post("/api/offers/{offer_id}/reject", tags=["petani"])
def reject_offer(offer_id: str, actor: Actor = Depends(get_actor)):
    require(actor, "petani")
    with tx() as cur:
        o = _own_offer(cur, actor, offer_id)
        if o["status"] != "FARMER_TURN":
            err(409, "Status penawaran sudah berubah.")
        cur.execute("update offers set status = 'FAILED' where id = %s", (o["id"],))
        cur.execute("insert into offer_events (offer_id, actor, action, price, note) values (%s, 'farmer', 'fail', %s, 'rejected')",
                    (o["id"], o["current_price"]))
    return result(actor, "Penawaran ditolak.")


@app.post("/api/offers/{offer_id}/counter", tags=["petani", "tengkulak"])
def counter_offer(offer_id: str, body: PriceIn, actor: Actor = Depends(get_actor)):
    """Petani: ajukan harga balik. Tengkulak: tawar lagi setelah harga balik petani."""
    require(actor, "petani", "tengkulak")
    p = body.price
    with tx() as cur:
        o = _own_offer(cur, actor, offer_id)
        if actor.role == "petani":
            if o["status"] != "FARMER_TURN":
                err(409, "Penawaran tidak bisa diubah.")
            if p <= o["current_price"]:
                err(400, f"Harga balik harus lebih tinggi dari harga yang diajukan pembeli ({rupiah(o['current_price'])}/kg).")
            cur.execute("update offers set current_price = %s, current_by = 'farmer', status = 'BUYER_TURN' where id = %s", (p, o["id"]))
            cur.execute("insert into offer_events (offer_id, actor, action, price, note) values (%s, 'farmer', 'counter', %s, 'web')", (o["id"], p))
            message = "Harga balik berhasil dikirim."
        else:
            if o["status"] != "BUYER_TURN":
                err(409, "Penawaran tidak bisa diubah.")
            if p < o["initial_price"]:
                err(400, f"Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda ({rupiah(o['initial_price'])}/kg).")
            cur.execute("update offers set current_price = %s, current_by = 'buyer', status = 'FARMER_TURN' where id = %s", (p, o["id"]))
            cur.execute("insert into offer_events (offer_id, actor, action, price, note) values (%s, 'buyer', 'counter', %s, 'web')", (o["id"], p))
            message = "Harga penawaran baru dikirim."
    return result(actor, message)


# ---------------------------------------------------------------------------
# Chatbot (simulasi di halaman /chatbot, bukan WhatsApp asli)
# ---------------------------------------------------------------------------
@app.get("/api/chatbot/state", tags=["chatbot"])
def get_chatbot_state():
    return {"state": chatbot_store.get()}


@app.put("/api/chatbot/state", tags=["chatbot"])
async def put_chatbot_state(request: Request):
    raw = await request.body()
    if len(raw) > CHATBOT_MAX_BYTES:
        err(413, "State chatbot terlalu besar.")
    import json

    try:
        payload = json.loads(raw)
    except ValueError:
        err(400, "JSON tidak valid.")
    if not isinstance(payload, dict) or payload.get("v") != 8:
        err(400, "Format state chatbot tidak dikenali.")
    chatbot_store.put(payload)
    return {"ok": True}


@app.delete("/api/chatbot/state", tags=["chatbot"])
def delete_chatbot_state():
    chatbot_store.clear()
    return {"ok": True}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
def api_not_found(path: str):
    err(404, "Endpoint API tidak ditemukan.")
