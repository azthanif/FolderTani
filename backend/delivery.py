"""Delivery Temu Tani: estimasi jarak garis lurus & biaya angkut, fee aplikasi, dan rincian tagihan escrow.

PRD "Fitur Delivery Temu Tani: Estimasi Jarak & Biaya Angkut" (27 Nov 2026):
  * Ambil sendiri : tagihan = nilai gabah + fee; tanpa jarak; satu termin ke petani (gabah).
  * Diantar       : tagihan = nilai gabah + biaya logistik + fee; dua termin (logistik saat DIBAYAR, gabah saat DITERIMA).
  * D             : Haversine antar koordinat kantor desa (master_desa), R = 6.371 km, dibulatkan ke 0,1 km.
  * Biaya logistik: jumlah per truk (median tarif harian + median tarif per km x D) (tarif_armada).
  * Armada        : W <= 25 t -> satu truk terkecil yang muat; W > 25 t -> floor(W/25) Tronton + satu truk terkecil
                    untuk sisa muatan. Tidak ada penolakan berdasarkan berat.
  * Fee           : ESCROW_FEE_PERSEN (default 0,5) % x nilai gabah, dibulatkan ke rupiah terdekat.

Semua angka uang dihitung dengan Decimal (tanpa galat float) lalu menjadi int rupiah.
"""
from __future__ import annotations

import math
import os
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

R_BUMI_KM = 6371.0
PENGAMBILAN = ("ambil_sendiri", "diantar")
PENGAMBILAN_LABEL = {"ambil_sendiri": "Ambil sendiri", "diantar": "Diantar"}


class DeliveryError(Exception):
    """Kesalahan input quote. status: 404 (desa tidak ada / tanpa koordinat) atau 422 (data tidak lengkap)."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def fee_rate() -> Decimal:
    try:
        persen = Decimal(os.getenv("ESCROW_FEE_PERSEN", "0.5"))
    except ArithmeticError:
        persen = Decimal("0.5")
    if persen < 0 or persen > 100:
        persen = Decimal("0.5")
    return persen / 100


def _rp(x: Decimal) -> int:
    return int(x.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# Rumus inti (murni, tanpa database)
# ---------------------------------------------------------------------------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Jarak lingkaran besar (km) antara dua titik lintang/bujur dalam derajat."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_BUMI_KM * math.asin(min(1.0, math.sqrt(h)))


def bulat_jarak(km: float) -> Decimal:
    return Decimal(str(km)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def pilih_armada(berat_kg: Decimal, tarif: list[dict]) -> list[dict]:
    """Jenis & jumlah truk untuk berat_kg (perbandingan dalam kg agar tidak ada muatan lebih).
    tarif: baris tarif_armada. -> [{...baris tarif, jumlah}] urut dari kapasitas terbesar."""
    if berat_kg <= 0:
        raise DeliveryError(422, "Berat harus lebih dari 0.")
    if not tarif:
        raise DeliveryError(422, "Tarif armada belum tersedia.")
    urut = sorted(tarif, key=lambda t: Decimal(str(t["kapasitas_ton"])))
    terbesar = urut[-1]
    kap_max = Decimal(str(terbesar["kapasitas_ton"])) * 1000

    def terkecil_muat(w: Decimal) -> dict:
        return next(t for t in urut if w <= Decimal(str(t["kapasitas_ton"])) * 1000)

    jumlah: dict[str, int] = {}
    if berat_kg > kap_max:
        n = int(berat_kg // kap_max)
        jumlah[terbesar["kode"]] = n
        sisa = berat_kg - kap_max * n
    else:
        sisa = berat_kg
    if sisa > 0:
        t = terkecil_muat(sisa)
        jumlah[t["kode"]] = jumlah.get(t["kode"], 0) + 1
    by_kode = {t["kode"]: t for t in urut}
    return [{**by_kode[k], "jumlah": n} for k, n in sorted(jumlah.items(), key=lambda kv: -Decimal(str(by_kode[kv[0]]["kapasitas_ton"])))]


def biaya_armada(armada: list[dict], jarak_km: Decimal) -> list[dict]:
    """Tambahkan biaya per baris = jumlah x (tarif harian + tarif per km x D)."""
    out = []
    for a in armada:
        per_truk = Decimal(a["tarif_harian"]) + Decimal(a["tarif_per_km"]) * jarak_km
        out.append({
            "kode": a["kode"], "nama": a["nama"], "kapasitas_ton": float(a["kapasitas_ton"]), "jumlah": a["jumlah"],
            "tarif_harian": int(a["tarif_harian"]), "tarif_per_km": int(a["tarif_per_km"]),
            "biaya_per_truk": _rp(per_truk), "biaya": _rp(per_truk * a["jumlah"]),
            "sumber": a.get("sumber"), "berlaku_mulai": str(a["berlaku_mulai"]) if a.get("berlaku_mulai") else None,
        })
    return out


def hitung(pengambilan: str, berat_kg: Decimal, harga_per_kg: int, tarif: list[dict],
           jarak_km: Optional[Decimal] = None) -> dict:
    """Rincian tagihan lengkap (tanpa I/O). jarak_km wajib untuk 'diantar'."""
    if pengambilan not in PENGAMBILAN:
        raise DeliveryError(422, "Pilihan pengambilan harus 'ambil_sendiri' atau 'diantar'.")
    if berat_kg <= 0:
        raise DeliveryError(422, "Berat harus lebih dari 0.")
    if harga_per_kg <= 0:
        raise DeliveryError(422, "Harga harus lebih dari 0.")
    nilai_gabah = _rp(Decimal(harga_per_kg) * berat_kg)
    fee = _rp(Decimal(nilai_gabah) * fee_rate())
    armada: list[dict] = []
    logistik = 0
    if pengambilan == "diantar":
        if jarak_km is None:
            raise DeliveryError(422, "Jarak belum bisa dihitung.")
        armada = biaya_armada(pilih_armada(berat_kg, tarif), jarak_km)
        logistik = sum(a["biaya"] for a in armada)
    termin = ([{"ke": 1, "jenis": "logistik", "nilai": logistik}, {"ke": 2, "jenis": "gabah", "nilai": nilai_gabah}]
              if pengambilan == "diantar" else [{"ke": 1, "jenis": "gabah", "nilai": nilai_gabah}])
    return {
        "pengambilan": pengambilan,
        "jarak_km": float(jarak_km) if pengambilan == "diantar" and jarak_km is not None else None,
        "armada": armada,
        "rincian": {"nilai_gabah": nilai_gabah, "biaya_logistik": logistik, "fee": fee},
        "total_tagihan": nilai_gabah + logistik + fee,
        "termin_petani": termin,
    }


# ---------------------------------------------------------------------------
# Akses database
# ---------------------------------------------------------------------------
def tarif_aktif(cur) -> list[dict]:
    cur.execute("select kode, nama, kapasitas_ton, tarif_harian, tarif_per_km, sumber, berlaku_mulai from tarif_armada order by kapasitas_ton")
    return cur.fetchall()


def desa(cur, kode_desa: str) -> Optional[dict]:
    cur.execute("select kode_desa, nama_desa, kecamatan, kabupaten, jenis, lat, lon, sumber_koordinat from master_desa where kode_desa = %s",
                (kode_desa,))
    return cur.fetchone()


def kode_desa_dari_nama(cur, kabupaten: Optional[str], kecamatan: Optional[str], kelurahan: Optional[str]) -> Optional[str]:
    if not (kabupaten and kecamatan and kelurahan):
        return None
    cur.execute("select kode_desa from master_desa where lower(kabupaten) = lower(%s) and lower(kecamatan) = lower(%s)"
                " and lower(nama_desa) = lower(%s)", (kabupaten, kecamatan, kelurahan))
    r = cur.fetchone()
    return r["kode_desa"] if r else None


def _titik(cur, kode: Optional[str], peran: str) -> dict:
    if not kode:
        raise DeliveryError(422, f"Desa/kelurahan {peran} belum diisi.")
    d = desa(cur, kode)
    if not d:
        raise DeliveryError(404, f"Desa/kelurahan {peran} ({kode}) tidak ditemukan.")
    if d["lat"] is None or d["lon"] is None:
        raise DeliveryError(404, f"Koordinat desa {d['nama_desa']} ({peran}) belum tersedia.")
    return d


def label_desa(d: Optional[dict]) -> Optional[str]:
    if not d:
        return None
    jenis = "Kel." if d["jenis"] == "kelurahan" else "Desa"
    return f"{jenis} {d['nama_desa']}, Kec. {d['kecamatan']}, Kab. {d['kabupaten']}"


def quote(cur, pengambilan: str, berat_kg: Decimal, harga_per_kg: int,
          kode_desa_asal: Optional[str] = None, kode_desa_tujuan: Optional[str] = None) -> dict:
    """Quote lengkap dari database (dipakai /api/delivery/quote dan saat escrow dikunci)."""
    peringatan: list[str] = []
    jarak = None
    asal = tujuan = None
    if pengambilan == "diantar":
        asal = _titik(cur, kode_desa_asal, "asal (petani)")
        tujuan = _titik(cur, kode_desa_tujuan, "tujuan (tengkulak)")
        jarak = bulat_jarak(haversine_km(asal["lat"], asal["lon"], tujuan["lat"], tujuan["lon"]))
        for k, d in (("asal", asal), ("tujuan", tujuan)):
            if d["sumber_koordinat"] == "centroid":
                peringatan.append(f"koordinat_{k}_centroid")
    out = hitung(pengambilan, berat_kg, harga_per_kg, tarif_aktif(cur) if pengambilan == "diantar" else [], jarak)
    out["berat_ton"] = float((berat_kg / 1000).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    out["harga_per_kg"] = harga_per_kg
    out["fee_persen"] = float(fee_rate() * 100)
    out["kode_desa_asal"] = asal["kode_desa"] if asal else None
    out["kode_desa_tujuan"] = tujuan["kode_desa"] if tujuan else None
    out["desa_asal"] = label_desa(asal)
    out["desa_tujuan"] = label_desa(tujuan)
    out["peringatan"] = peringatan
    return out


# ---------------------------------------------------------------------------
# Skema request (endpoint ada di escrow.py karena memakai autentikasi pelaku yang sama)
# ---------------------------------------------------------------------------
def _kode(v):
    if v is None:
        return None
    v = str(v).replace(".", "").strip()
    return v or None


class QuoteIn(BaseModel):
    pengambilan: Literal["ambil_sendiri", "diantar"]
    berat_ton: float = Field(gt=0, le=100000)  # ton, maksimal dua desimal

    @field_validator("berat_ton")
    @classmethod
    def _dua_desimal(cls, v: float) -> float:
        if Decimal(str(v)).as_tuple().exponent < -2:
            raise ValueError("Berat dalam ton maksimal dua desimal.")
        return v

    @property
    def berat_kg(self) -> Decimal:
        return Decimal(str(self.berat_ton)) * 1000
    harga_per_kg: int = Field(gt=0, le=1_000_000)
    kode_desa_asal: Optional[str] = Field(default=None, pattern=r"^\d{10}$")
    kode_desa_tujuan: Optional[str] = Field(default=None, pattern=r"^\d{10}$")

    @field_validator("kode_desa_asal", "kode_desa_tujuan", mode="before")
    @classmethod
    def _bersih(cls, v):
        return _kode(v)


class PilihIn(BaseModel):
    """Pilihan pengambilan untuk escrow yang sudah ada (berat & harga diambil dari snapshot kesepakatan)."""
    pengambilan: Literal["ambil_sendiri", "diantar"]
    kode_desa_tujuan: Optional[str] = Field(default=None, pattern=r"^\d{10}$")  # default: desa di profil tengkulak

    @field_validator("kode_desa_tujuan", mode="before")
    @classmethod
    def _bersih(cls, v):
        return _kode(v)
