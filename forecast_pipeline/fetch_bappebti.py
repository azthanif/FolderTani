"""
fetch_bappebti.py
-----------------
Mengambil harga GKP (Gabah Kering Panen) harian dari REST API internal Bappebti.
Tidak memerlukan browser/Playwright; API mengembalikan seluruh riwayat historis
dalam satu POST request.

Referensi endpoint ditemukan dari network inspection halaman:
  https://infoharga.bappebti.go.id/harga_komoditi_petani/

Penggunaan:
    df = fetch_harga_bappebti("CJR")          # semua data
    df = fetch_harga_bappebti("CJR", since=date(2025, 3, 1))  # hanya data baru

Kolom output: tanggal (datetime.date), harga (float, Rp/kg)
"""

import logging
from datetime import date

import pandas as pd
import requests

logger = logging.getLogger(__name__)

_API_URL = (
    "https://infoharga.bappebti.go.id"
    "/harga_komoditi_petani/getDataTableKomoditiPetaniForModal"
)
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TemuTani/1.0)",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://infoharga.bappebti.go.id/harga_komoditi_petani",
}

# Kode wilayah Bappebti untuk kabupaten yang digunakan TemuTani.
# Verifikasi kode tambahan di halaman Bappebti jika perlu.
WILAYAH = {
    "cianjur": "CJR",
    # "garut": "GRT",  # belum diverifikasi — tambahkan jika Bappebti punya data Garut
}

# Kode komoditi GKP (Gabah Kering Panen)
_KOMODITI_GKP = "K0010"


def fetch_harga_bappebti(
    wilayah_kode: str,
    since: date | None = None,
    timeout: int = 30,
) -> pd.DataFrame:
    """
    Tarik harga GKP dari Bappebti untuk satu wilayah.

    Parameters
    ----------
    wilayah_kode : str
        Kode wilayah Bappebti, mis. "CJR".
    since : date, optional
        Jika diisi, hanya mengembalikan baris dengan tanggal > since.
        Berguna untuk incremental update.
    timeout : int
        Timeout HTTP dalam detik.

    Returns
    -------
    pd.DataFrame
        Kolom: tanggal (date), harga (float).
        DataFrame kosong jika request gagal atau tidak ada data baru.
    """
    payload = {"k": _KOMODITI_GKP, "w": wilayah_kode}
    try:
        resp = requests.post(_API_URL, data=payload, headers=_HEADERS, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error("Bappebti %s: request gagal — %s", wilayah_kode, exc)
        return pd.DataFrame(columns=["tanggal", "harga"])

    rows = resp.json().get("data_all_komoditi", [])
    if not rows:
        logger.warning("Bappebti %s: data_all_komoditi kosong", wilayah_kode)
        return pd.DataFrame(columns=["tanggal", "harga"])

    df = pd.DataFrame(rows)
    df["tanggal"] = pd.to_datetime(df["datt"]).dt.date
    df["harga"] = pd.to_numeric(df["price_sms"], errors="coerce")
    df = (
        df[["tanggal", "harga"]]
        .dropna(subset=["harga"])
        .sort_values("tanggal")
        .reset_index(drop=True)
    )

    if since is not None:
        df = df[df["tanggal"] > since].reset_index(drop=True)
        logger.info("Bappebti %s: %d baris baru setelah %s", wilayah_kode, len(df), since)
    else:
        logger.info("Bappebti %s: %d baris total", wilayah_kode, len(df))

    return df
