"""Autentikasi sederhana Temu Tani: nomor HP + password.

* Password disimpan sebagai hash PBKDF2-HMAC-SHA256 (pustaka standar, tanpa dependensi baru).
* Token sesi bersifat stateless: payload JSON (base64url) + tanda tangan HMAC-SHA256.
  Kunci diambil dari env TEMUTANI_SECRET. Wajib di-set di produksi (Vercel), karena kunci
  acak per proses membuat token tidak valid ketika instance serverless berganti.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from typing import Optional

log = logging.getLogger("temutani.auth")

PBKDF2_ITERATIONS = 200_000
TOKEN_TTL_SECONDS = 7 * 24 * 3600

_SECRET = os.getenv("TEMUTANI_SECRET", "").encode()
if not _SECRET:
    _SECRET = secrets.token_bytes(32)
    log.warning("TEMUTANI_SECRET belum di-set; memakai kunci acak per proses (token hilang saat restart).")


# ---------------------------------------------------------------------------
# Nomor HP
# ---------------------------------------------------------------------------
def normalize_phone(raw: str) -> Optional[str]:
    """'+62 812-3456-7890' / '6281234567890' / '081234567890' -> '081234567890'. None bila tidak valid."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("62"):
        digits = "0" + digits[2:]
    elif digits.startswith("8"):
        digits = "0" + digits
    if not re.fullmatch(r"08\d{8,12}", digits):  # 10-14 digit, format seluler Indonesia
        return None
    return digits


def mask_phone(phone: str) -> str:
    return phone[:4] + "••••" + phone[-3:]


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(user_id: str, role: str) -> str:
    payload = _b64(json.dumps({"u": user_id, "r": role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    sig = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def read_token(token: str) -> Optional[dict]:
    """Kembalikan {'u','r','exp'} bila tanda tangan sah dan belum kedaluwarsa."""
    try:
        payload, sig = token.split(".", 1)
        expected = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_unb64(payload))
        if int(data.get("exp", 0)) < time.time():
            return None
        return data
    except (ValueError, json.JSONDecodeError):
        return None
