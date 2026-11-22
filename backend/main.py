"""Temu Tani API (FastAPI).

Menyajikan:
  * /api/...  JSON API (data + aturan bisnis yang dulu berjalan di browser)
  * /         frontend statis (HTML/CSS/JS asli, tampilan tidak berubah)

Jalankan:  uvicorn backend.main:app --reload     (dari folder proyek)

CATATAN KEAMANAN: identitas peran dikirim lewat header X-Demo-Role / X-Demo-User.
Ini SIMULASI, bukan autentikasi. Produksi wajib memakai login/OTP + token terverifikasi.
"""
from __future__ import annotations

import logging
import math
import os
import secrets
import string
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import auth, pricing
from .news import load_news
from .seed import SCHEMA_VERSION, admin_data, role_demo_data
from .store import BlobStore, JsonStore

log = logging.getLogger("temutani")

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
ON_VERCEL = bool(os.getenv("VERCEL"))
# Folder `public/` disajikan langsung oleh CDN Vercel; secara lokal disajikan FastAPI (lihat bawah).
FRONTEND_DIR = Path(os.getenv("TEMUTANI_FRONTEND_DIR", PROJECT_DIR / "public"))
# Filesystem Vercel Functions read-only kecuali /tmp (dan /tmp tidak permanen, lihat README).
_default_data = Path("/tmp/temutani") if ON_VERCEL else BASE_DIR / "data" / "runtime"
DATA_DIR = Path(os.getenv("TEMUTANI_DATA_DIR", _default_data))
NEWS_CSV = Path(os.getenv("TEMUTANI_NEWS_CSV", BASE_DIR / "data" / "berita.csv"))
CHATBOT_MAX_BYTES = 2_000_000

STOCK_STATUSES = ("Tersedia", "Akan Panen", "Ditutup")
GRAIN_TYPES = ("GKP",)  # hanya Gabah Kering Panen
UNIT = "kg"  # satuan volume seluruh API
EPS = 1e-8

store = JsonStore(DATA_DIR / "role_demo.json", role_demo_data)
if store.read().get("schema") != SCHEMA_VERSION:  # file runtime lama (ton/GKG, tanpa akun) -> data awal baru
    store.reset()
chatbot_store = BlobStore(DATA_DIR / "chatbot_state.json")

app = FastAPI(
    title="Temu Tani API",
    version="1.0.0",
    description="Backend prototipe Temu Tani. Semua data adalah simulasi.",
)

_origins = [o.strip() for o in os.getenv("TEMUTANI_CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:  # hanya perlu bila frontend di-host terpisah (mis. Netlify/Vercel)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "X-Demo-Role", "X-Demo-User"],
    )


# ---------------------------------------------------------------------------
# Utilitas
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def uid(prefix: str, existing: set[str]) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        candidate = f"{prefix}-" + "".join(secrets.choice(alphabet) for _ in range(5))
        if candidate not in existing:
            return candidate


def round2(x: float) -> float:
    return pricing.js_round(x * 100) / 100


def fmt_number(n: float) -> str:
    """Setara toLocaleString('id-ID', {maximumFractionDigits: 2})."""
    s = f"{round2(n):,.2f}".rstrip("0").rstrip(".")
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def js_num(n: float) -> str:
    """Setara String(number) di JavaScript: 2.0 -> '2', 2.5 -> '2.5'."""
    return str(int(n)) if float(n).is_integer() else repr(float(n))


def rupiah(n: float) -> str:
    return "Rp" + f"{int(round(n)):,}".replace(",", ".")


def find(items: list[dict], item_id: str) -> Optional[dict]:
    return next((x for x in items if x.get("id") == item_id), None)


def availability(db: dict, stock: dict) -> float:
    committed = sum(t["volume"] for t in db["transactions"] if t["stockId"] == stock["id"])
    return max(0.0, round2(stock["volume"] - committed))


def log_stock(db: dict, farmer_id: str, activity: str, delta: float) -> None:
    """Catat perubahan total stok fisik petani (untuk tabel Riwayat Perubahan Stok)."""
    log = db.setdefault("stockLog", [])
    total = sum(s["volume"] for s in db["stocks"] if s["farmerId"] == farmer_id)
    log.append({"id": uid("LOG", {x["id"] for x in log}), "farmerId": farmer_id, "at": now_iso(),
                "activity": activity, "delta": delta, "total": total})


def append_event(db: dict, title: str, note: str) -> None:
    ids = {a["id"] for a in db["activities"]}
    db["activities"].insert(0, {"id": uid("EVT", ids), "at": now_iso(), "title": title, "note": note})
    db["activities"] = db["activities"][:30]


def err(status: int, message: str):
    raise HTTPException(status_code=status, detail=message)


# ---------------------------------------------------------------------------
# Identitas demo (BUKAN autentikasi)
# ---------------------------------------------------------------------------
class Actor(BaseModel):
    role: Literal["petani", "tengkulak", "admin"]
    user: str


DEFAULT_USER = {"petani": "F-001", "tengkulak": "GUEST-001", "admin": "ADMIN-1"}


def get_actor(
    authorization: str = Header(default="", alias="Authorization"),
    x_demo_role: str = Header(default="", alias="X-Demo-Role"),
    x_demo_user: str = Header(default="", alias="X-Demo-User"),
) -> Actor:
    # 1) Token login (Authorization: Bearer <token>) diutamakan.
    if authorization.lower().startswith("bearer "):
        data = auth.read_token(authorization[7:].strip())
        if not data or data.get("r") not in ("petani", "tengkulak"):
            err(401, "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.")
        db = store.read()
        pool = db["farmers"] if data["r"] == "petani" else db["buyers"]
        if not find(pool, data["u"]):
            err(401, "Akun tidak ditemukan. Silakan masuk kembali.")
        return Actor(role=data["r"], user=data["u"])
    # 2) Fallback header demo (dipakai dashboard admin & tes). SIMULASI, bukan autentikasi.
    role = x_demo_role.strip().lower()
    if role not in DEFAULT_USER:
        err(401, "Peran demo tidak dikenali. Kirim header X-Demo-Role: petani | tengkulak | admin.")
    user = x_demo_user.strip() or DEFAULT_USER[role]
    if role in ("petani", "tengkulak"):
        db = store.read()
        pool = db["farmers"] if role == "petani" else db["buyers"]
        if not find(pool, user):
            err(403, "Identitas demo tidak ditemukan.")
    return Actor(role=role, user=user)


def require(actor: Actor, role: str) -> None:
    if actor.role != role:
        err(403, "Aksi ini tidak diizinkan untuk peran Anda.")


# ---------------------------------------------------------------------------
# Snapshot per peran: server hanya mengirim data yang boleh dilihat peran tsb.
# ---------------------------------------------------------------------------
def _with_contact(db: dict, t: dict, counterpart_id: str) -> dict:
    """Nomor HP lawan transaksi, hanya untuk pihak dalam kesepakatan (pembayaran dilakukan di luar sistem)."""
    user = next((u for u in db.get("users", []) if u["id"] == counterpart_id), None)
    return {**t, "contact": user["phone"] if user else None}


def snapshot(db: dict, actor: Actor) -> dict:
    stocks = [{**s, "available": availability(db, s)} for s in db["stocks"]]
    base = {
        "version": db["version"],
        "actor": actor.model_dump(),
        "farmers": db["farmers"],
        "buyers": db["buyers"],
        "activities": db["activities"],
    }
    if actor.role == "petani":
        farmer = find(db["farmers"], actor.user)
        return {
            **base,
            "stocks": [s for s in stocks if s["farmerId"] == actor.user],
            "stockLog": [x for x in db.get("stockLog", []) if x["farmerId"] == actor.user][::-1],  # terbaru dulu
            "offers": [o for o in db["offers"] if o["farmerId"] == actor.user],
            "transactions": [_with_contact(db, t, t["buyerId"]) for t in db["transactions"] if t["farmerId"] == actor.user],
            "aiReference": pricing.AI_REFERENCE.get(farmer["region"], {}),
        }
    if actor.role == "tengkulak":
        # Referensi harga AI privat untuk petani: dibuang di server, bukan sekadar disembunyikan di HTML.
        offers = [{k: v for k, v in o.items() if k != "aiRef"} for o in db["offers"] if o["buyerId"] == actor.user]
        return {
            **base,
            "stocks": stocks,
            "offers": offers,
            "transactions": [_with_contact(db, t, t["farmerId"]) for t in db["transactions"] if t["buyerId"] == actor.user],
        }
    err(403, "Snapshot peran hanya untuk petani atau tengkulak.")


def result(db: dict, actor: Actor, message: str, **extra) -> dict:
    return {"state": snapshot(db, actor), "message": message, **extra}


# ---------------------------------------------------------------------------
# Skema input
# ---------------------------------------------------------------------------
class StockIn(BaseModel):
    type: Literal["GKP"] = "GKP"
    volume: float = Field(gt=0)
    harvest: str = Field(min_length=8, max_length=10)
    status: Literal["Tersedia", "Akan Panen", "Ditutup"] = "Tersedia"
    moisture: Optional[float] = Field(default=None, ge=0, le=100)

    @field_validator("volume")
    @classmethod
    def finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Volume tidak valid.")
        return v


class OfferIn(BaseModel):
    stockId: str
    volume: float = Field(gt=0)
    price: int = Field(gt=0)


class StockTotalIn(BaseModel):
    volume: float = Field(ge=0)  # total stok fisik terkini (kg)


class PriceIn(BaseModel):
    price: int = Field(gt=0)


class RegisterIn(BaseModel):
    role: Literal["petani", "tengkulak"]
    name: str = Field(min_length=3, max_length=80)
    phone: str = Field(min_length=9, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    # Wajib untuk petani; diabaikan untuk tengkulak.
    region: Optional[str] = Field(default=None, max_length=60)    # kota/kabupaten
    district: Optional[str] = Field(default=None, max_length=60)  # kecamatan

    @field_validator("name", "region", "district")
    @classmethod
    def strip(cls, v: Optional[str]) -> Optional[str]:
        return " ".join(v.split()) if isinstance(v, str) else v


class LoginIn(BaseModel):
    phone: str = Field(min_length=9, max_length=20)
    password: str = Field(min_length=1, max_length=128)


# ---------------------------------------------------------------------------
# Error handler: pesan validasi dalam bahasa Indonesia dan ringkas
# ---------------------------------------------------------------------------
from fastapi.exceptions import RequestValidationError  # noqa: E402


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    fields = ", ".join(str(e["loc"][-1]) for e in exc.errors())
    return JSONResponse(status_code=422, content={"detail": f"Data belum valid ({fields}).", "errors": exc.errors()})


# ---------------------------------------------------------------------------
# Endpoint umum
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["umum"])
def health():
    return {"status": "ok", "time": now_iso()}


# ---------------------------------------------------------------------------
# Akun: daftar & masuk (nomor HP + password)
# ---------------------------------------------------------------------------
def _session(db: dict, user: dict) -> dict:
    if user["role"] == "petani":
        f = find(db["farmers"], user["id"]) or {}
        profile = {"name": f.get("name", ""), "region": f.get("region", ""), "district": f.get("village", "")}
    else:
        b = find(db["buyers"], user["id"]) or {}
        profile = {"name": b.get("label", "")}
    return {
        "token": auth.issue_token(user["id"], user["role"]),
        "user": {"id": user["id"], "role": user["role"], "phone": user["phone"], **profile},
    }


@app.post("/api/auth/register", tags=["akun"], status_code=201)
def register(body: RegisterIn):
    phone = auth.normalize_phone(body.phone)
    if not phone:
        err(400, "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.")
    if body.role == "petani" and (not body.region or len(body.region) < 2 or not body.district or len(body.district) < 2):
        err(400, "Kota/kabupaten dan kecamatan wajib diisi untuk petani.")
    password_hash = auth.hash_password(body.password)  # di luar lock: PBKDF2 sengaja lambat
    with store.transaction() as db:
        users = db.setdefault("users", [])
        if any(u["phone"] == phone for u in users):
            err(409, "Nomor HP sudah terdaftar. Silakan masuk.")
        if body.role == "petani":
            uid_ = uid("F", {f["id"] for f in db["farmers"]})
            region = pricing.canonical_region(body.region)
            db["farmers"].append({"id": uid_, "name": body.name, "region": region, "village": body.district})
            append_event(db, "Petani baru terdaftar", f"{body.district}, {region}")
        else:
            uid_ = uid("B", {b["id"] for b in db["buyers"]})
            db["buyers"].append({"id": uid_, "label": body.name})
            append_event(db, "Tengkulak baru terdaftar", auth.mask_phone(phone))
        user = {"id": uid_, "role": body.role, "phone": phone, "passwordHash": password_hash, "created": now_iso()}
        users.append(user)
    return _session(db, user)


@app.post("/api/auth/login", tags=["akun"])
def login(body: LoginIn):
    phone = auth.normalize_phone(body.phone)
    db = store.read()
    user = next((u for u in db.get("users", []) if u["phone"] == phone), None) if phone else None
    # Pesan sama untuk nomor tak terdaftar & password salah (tidak membocorkan nomor yang terdaftar).
    if not user or not auth.verify_password(body.password, user["passwordHash"]):
        err(401, "Nomor HP atau password salah.")
    return _session(db, user)


@app.get("/api/auth/me", tags=["akun"])
def me(actor: Actor = Depends(get_actor)):
    db = store.read()
    user = next((u for u in db.get("users", []) if u["id"] == actor.user), None)
    if not user:
        err(401, "Akun tidak ditemukan.")
    return _session(db, user)["user"]


@app.get("/api/prices", tags=["harga"])
def get_prices(wilayah: Optional[str] = Query(default=None), actor: Actor = Depends(get_actor)):
    """Prediksi harga AI. Petani dikunci ke kabupatennya; tengkulak tidak berhak."""
    if actor.role == "tengkulak":
        err(403, "Prediksi harga AI hanya tersedia untuk petani dan admin.")
    if actor.role == "petani":
        region = find(store.read()["farmers"], actor.user)["region"]
        regions = [region] if region in pricing.REGIONS else []
        payload = pricing.price_payload(regions)
        payload["lockedArea"] = region
        return payload
    if wilayah and wilayah not in pricing.REGIONS:
        err(404, "Wilayah tidak tersedia.")
    payload = pricing.price_payload([wilayah] if wilayah else list(pricing.REGIONS))
    payload["lockedArea"] = None
    return payload


@app.get("/api/berita", tags=["berita"])
def get_news(
    dari: Optional[str] = Query(default=None, alias="from"),
    sampai: Optional[str] = Query(default=None, alias="to"),
):
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


@app.get("/api/admin/dashboard", tags=["admin"])
def get_admin_dashboard(actor: Actor = Depends(get_actor)):
    require(actor, "admin")
    return admin_data()


# ---------------------------------------------------------------------------
# Dashboard petani & tengkulak
# ---------------------------------------------------------------------------
@app.get("/api/state", tags=["peran"])
def get_state(actor: Actor = Depends(get_actor)):
    return snapshot(store.read(), actor)


@app.get("/api/state/version", tags=["peran"])
def get_state_version():
    """Endpoint ringan untuk polling sinkronisasi antar-tab/perangkat."""
    return {"version": store.read()["version"]}


@app.post("/api/demo/reset", tags=["peran"])
def reset_demo(actor: Actor = Depends(get_actor)):
    if actor.role not in ("petani", "tengkulak"):
        err(403, "Aksi ini tidak diizinkan untuk peran Anda.")
    # Data transaksi dikembalikan ke awal, tetapi akun yang sudah mendaftar tetap dipertahankan.
    keep = store.read()
    seed = role_demo_data()
    seed_users = {u["id"] for u in seed["users"]}
    with store.transaction() as db:
        db.clear()
        db.update(seed)
        for key in ("farmers", "buyers"):
            ids = {x["id"] for x in db[key]}
            db[key].extend(x for x in keep.get(key, []) if x["id"] not in ids)
        db["users"].extend(u for u in keep.get("users", []) if u["id"] not in seed_users)
    return result(db, actor, "Data simulasi dikembalikan.")


@app.post("/api/stocks", tags=["petani"])
def create_stock(body: StockIn, actor: Actor = Depends(get_actor)):
    require(actor, "petani")
    with store.transaction() as db:
        farmer = find(db["farmers"], actor.user)
        stock = {
            "id": uid("STK", {s["id"] for s in db["stocks"]}),
            "farmerId": actor.user,
            "region": farmer["region"],
            "type": body.type,
            "volume": body.volume,
            "harvest": body.harvest,
            "status": body.status,
            "moisture": body.moisture or None,
        }
        db["stocks"].append(stock)
        log_stock(db, actor.user, "Tambah panen", body.volume)
        append_event(db, "Stok baru ditambahkan", f"{fmt_number(body.volume)} kg {body.type} • {farmer['region']}")
    return result(db, actor, "Stok gabah berhasil ditambahkan.", id=stock["id"])


@app.put("/api/stocks/total", tags=["petani"])
def update_stock_total(body: StockTotalIn, actor: Actor = Depends(get_actor)):
    """Perbarui total stok fisik petani. Selisih diterapkan ke listing milik petani:
    penambahan masuk ke listing terbaru; pengurangan diambil dari bagian yang belum dialokasikan
    (listing terbaru dulu). Total tidak boleh kurang dari volume yang sudah disepakati."""
    require(actor, "petani")
    with store.transaction() as db:
        own = sorted((s for s in db["stocks"] if s["farmerId"] == actor.user), key=lambda s: s["harvest"], reverse=True)
        current = sum(s["volume"] for s in own)
        committed = sum(s["volume"] - availability(db, s) for s in own)
        if body.volume + EPS < committed:
            err(400, f"Total stok tidak boleh kurang dari volume yang sudah dialokasikan ({fmt_number(committed)} kg).")
        delta = body.volume - current
        if abs(delta) <= EPS:
            return result(db, actor, "Tidak ada perubahan stok.")
        farmer = find(db["farmers"], actor.user)
        if delta > 0:
            if own:
                own[0]["volume"] += delta
            else:
                db["stocks"].append({
                    "id": uid("STK", {s["id"] for s in db["stocks"]}), "farmerId": actor.user, "region": farmer["region"],
                    "type": "GKP", "volume": delta, "harvest": pricing.today_wib(), "status": "Tersedia", "moisture": None,
                })
        else:
            need = -delta
            for s in own:
                take = min(need, availability(db, s))
                s["volume"] -= take
                need -= take
                if need <= EPS:
                    break
            # Listing kosong yang tidak dirujuk penawaran mana pun dihapus.
            referenced = {o["stockId"] for o in db["offers"]}
            db["stocks"] = [s for s in db["stocks"] if not (s["farmerId"] == actor.user and s["volume"] <= EPS and s["id"] not in referenced)]
        log_stock(db, actor.user, "Update stok", delta)
        append_event(db, "Stok diperbarui", f"Total {fmt_number(body.volume)} kg GKP • {farmer['region']}")
    return result(db, actor, "Stok berhasil diperbarui.")


@app.put("/api/stocks/{stock_id}", tags=["petani"])
def update_stock(stock_id: str, body: StockIn, actor: Actor = Depends(get_actor)):
    require(actor, "petani")
    with store.transaction() as db:
        s = find(db["stocks"], stock_id)
        if not s or s["farmerId"] != actor.user:
            err(404, "Stok tidak ditemukan.")
        committed = s["volume"] - availability(db, s)
        if body.volume + EPS < committed:
            err(400, "Volume harus positif dan tidak kurang dari volume yang telah disepakati.")
        delta = body.volume - s["volume"]
        s.update({
            "type": s["type"] if committed > 0 else body.type,  # jenis dikunci bila sudah ada kesepakatan
            "volume": body.volume,
            "harvest": body.harvest,
            "status": body.status,
            "moisture": body.moisture or None,
        })
        if abs(delta) > EPS:
            log_stock(db, actor.user, "Update stok", delta)
        farmer = find(db["farmers"], actor.user)
        append_event(db, "Stok diperbarui", f"{fmt_number(body.volume)} kg {s['type']} • {farmer['region']}")
    return result(db, actor, "Stok berhasil diperbarui.", id=stock_id)


@app.post("/api/offers", tags=["tengkulak"])
def create_offer(body: OfferIn, actor: Actor = Depends(get_actor)):
    require(actor, "tengkulak")
    with store.transaction() as db:
        s = find(db["stocks"], body.stockId)
        if not s or s["status"] != "Tersedia":
            err(409, "Data penawaran tidak valid atau stok tidak mencukupi.")
        avail = availability(db, s)
        if avail + EPS < body.volume:
            err(409, f"Volume yang Anda tawarkan ({fmt_number(body.volume)} kg) melebihi stok tersedia ({fmt_number(avail)} kg {s['type']}).")
        ts = now_iso()
        offer = {
            "id": uid("OFF", {o["id"] for o in db["offers"]}),
            "buyerId": actor.user, "farmerId": s["farmerId"], "stockId": s["id"],
            "volume": body.volume, "initialBid": body.price, "currentBid": body.price, "counter": None,
            "aiRef": pricing.AI_REFERENCE.get(s["region"], {}).get(s["type"]),  # dihitung server, tak pernah dikirim ke pembeli
            "status": "Menunggu Petani", "created": ts,
            "history": [{"at": ts, "actor": "Pembeli", "label": "Penawaran awal dikirim", "price": body.price}],
        }
        db["offers"].append(offer)
        append_event(db, "Penawaran baru " + offer["id"], f"{fmt_number(body.volume)} kg {s['type']} • {s['region']}")
    return result(db, actor, "Penawaran dikirim kepada petani.", id=offer["id"])


def _own_offer(db: dict, actor: Actor, offer_id: str) -> dict:
    o = find(db["offers"], offer_id)
    owner = "farmerId" if actor.role == "petani" else "buyerId"
    if not o or o[owner] != actor.user:
        err(404, "Penawaran tidak ditemukan.")
    return o


def _agree(db: dict, actor: Actor, o: dict, price: int) -> dict:
    """Kesepakatan + alokasi stok dalam satu transaksi (cegah overselling)."""
    if o["status"] == "Disepakati":
        err(409, "Penawaran sudah disepakati.")
    s = find(db["stocks"], o["stockId"])
    if not s or s["status"] != "Tersedia" or availability(db, s) + EPS < o["volume"]:
        err(409, "Stok sudah berkurang. Penawaran tidak dapat disetujui.")
    o["status"] = "Disepakati"
    o["agreedPrice"] = price
    o["history"].append({"at": now_iso(), "actor": "Petani" if actor.role == "petani" else "Pembeli", "label": "Harga disepakati", "price": price})
    tx = {
        "id": uid("TRX", {t["id"] for t in db["transactions"]}),
        "offerId": o["id"], "buyerId": o["buyerId"], "farmerId": o["farmerId"], "stockId": o["stockId"],
        "volume": o["volume"], "price": price, "date": pricing.today_wib(),
    }
    db["transactions"].append(tx)
    append_event(db, "Kesepakatan baru " + o["id"], f"{tx['id']} • {fmt_number(o['volume'])} kg")
    return tx


@app.post("/api/offers/{offer_id}/accept", tags=["petani"])
def accept_offer(offer_id: str, actor: Actor = Depends(get_actor)):
    require(actor, "petani")
    with store.transaction() as db:
        o = _own_offer(db, actor, offer_id)
        if o["status"] != "Menunggu Petani":
            err(409, "Status penawaran sudah berubah.")
        tx = _agree(db, actor, o, o["currentBid"])
    return result(db, actor, "Penawaran berhasil disepakati.", id=tx["id"])


@app.post("/api/offers/{offer_id}/reject", tags=["petani"])
def reject_offer(offer_id: str, actor: Actor = Depends(get_actor)):
    require(actor, "petani")
    with store.transaction() as db:
        o = _own_offer(db, actor, offer_id)
        if o["status"] != "Menunggu Petani":
            err(409, "Status penawaran sudah berubah.")
        o["status"] = "Ditolak"
        o["history"].append({"at": now_iso(), "actor": "Petani", "label": "Penawaran ditolak", "price": None})
        append_event(db, "Penawaran ditolak " + offer_id, "Petani menolak tawaran")
    return result(db, actor, "Penawaran ditolak.")


@app.post("/api/offers/{offer_id}/counter", tags=["petani", "tengkulak"])
def counter_offer(offer_id: str, body: PriceIn, actor: Actor = Depends(get_actor)):
    """Petani: ajukan harga balik. Tengkulak: tawar lagi setelah harga balik petani."""
    if actor.role not in ("petani", "tengkulak"):
        err(403, "Aksi ini tidak diizinkan untuk peran Anda.")
    p = body.price
    with store.transaction() as db:
        o = _own_offer(db, actor, offer_id)
        if actor.role == "petani":
            if o["status"] != "Menunggu Petani":
                err(409, "Penawaran tidak bisa diubah.")
            if p <= o["currentBid"]:
                err(400, f"Harga balik harus lebih tinggi dari harga yang diajukan pembeli ({rupiah(o['currentBid'])}/kg).")
            o["counter"] = p
            o["status"] = "Penawaran Balik"
            o["history"].append({"at": now_iso(), "actor": "Petani", "label": "Harga balik diajukan", "price": p})
            append_event(db, "Petani mengajukan harga balik " + o["id"], rupiah(p) + "/kg")
            message = "Harga balik berhasil dikirim."
        else:
            if o["status"] != "Penawaran Balik":
                err(409, "Penawaran tidak bisa diubah.")
            if p < o["initialBid"]:
                err(400, f"Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda ({rupiah(o['initialBid'])}/kg).")
            o["currentBid"] = p
            o["counter"] = None
            o["status"] = "Menunggu Petani"
            o["history"].append({"at": now_iso(), "actor": "Pembeli", "label": "Penawaran baru diajukan", "price": p})
            append_event(db, "Pembeli mengajukan harga baru " + o["id"], rupiah(p) + "/kg")
            message = "Harga penawaran baru dikirim."
    return result(db, actor, message)


@app.post("/api/offers/{offer_id}/accept-counter", tags=["tengkulak"])
def accept_counter(offer_id: str, actor: Actor = Depends(get_actor)):
    require(actor, "tengkulak")
    with store.transaction() as db:
        o = _own_offer(db, actor, offer_id)
        if o["status"] != "Penawaran Balik" or not o.get("counter"):
            err(409, "Status penawaran sudah berubah.")
        tx = _agree(db, actor, o, o["counter"])
    return result(db, actor, "Harga balik disepakati.", id=tx["id"])


# ---------------------------------------------------------------------------
# Chatbot WhatsApp (simulasi mandiri): simpan state percakapan di server
# ---------------------------------------------------------------------------
@app.get("/api/chatbot/state", tags=["chatbot"])
def get_chatbot_state():
    return {"state": chatbot_store.get()}


@app.put("/api/chatbot/state", tags=["chatbot"])
async def put_chatbot_state(request: Request):
    raw = await request.body()
    if len(raw) > CHATBOT_MAX_BYTES:
        err(413, "State chatbot terlalu besar.")
    try:
        import json

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


# ---------------------------------------------------------------------------
# Frontend statis (dipasang TERAKHIR agar tidak menimpa /api)
# ---------------------------------------------------------------------------
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
def api_not_found(path: str):
    err(404, "Endpoint API tidak ditemukan.")


# Di Vercel, public/ sudah disajikan CDN di level platform; dokumentasi Vercel melarang
# me-mount public/ dengan app.mount(). Mount hanya dipakai saat dijalankan lokal (uvicorn).
if not ON_VERCEL and FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
elif not ON_VERCEL:  # pragma: no cover
    log.warning("Folder frontend tidak ditemukan: %s", FRONTEND_DIR)
