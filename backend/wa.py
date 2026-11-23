"""Pengiriman pesan WhatsApp via WAHA (WhatsApp HTTP API).

Env:
  WAHA_URL       contoh https://waha.domainanda.com   (wajib untuk kirim kode verifikasi)
  WAHA_API_KEY   nilai header X-Api-Key WAHA            (opsional, sesuai konfigurasi WAHA)
  WAHA_SESSION   nama sesi WAHA                         (default "default")
  TEMUTANI_OTP_DEV=1  mode pengembangan: bila WAHA belum di-set, kode dikembalikan di respons API
                      (JANGAN aktifkan di produksi).
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger("temutani.wa")


class WhatsAppError(RuntimeError):
    pass


def configured() -> bool:
    return bool(os.getenv("WAHA_URL", "").strip())


def dev_mode() -> bool:
    return os.getenv("TEMUTANI_OTP_DEV", "") == "1"


def chat_id(phone_e164: str) -> str:
    """'+6281234567890' -> '6281234567890@c.us' (format chatId WAHA)."""
    return phone_e164.lstrip("+") + "@c.us"


def send_text(phone_e164: str, text: str, timeout: float = 10.0) -> None:
    base = os.getenv("WAHA_URL", "").strip().rstrip("/")
    if not base:
        raise WhatsAppError("WAHA_URL belum di-set.")
    body = json.dumps({"session": os.getenv("WAHA_SESSION", "default"), "chatId": chat_id(phone_e164), "text": text}).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    api_key = os.getenv("WAHA_API_KEY", "").strip()
    if api_key:
        headers["X-Api-Key"] = api_key
    req = urllib.request.Request(base + "/api/sendText", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status >= 300:
                raise WhatsAppError(f"WAHA membalas status {resp.status}.")
    except urllib.error.HTTPError as e:
        log.warning("WAHA HTTP %s: %s", e.code, e.read()[:300])
        raise WhatsAppError(f"WAHA membalas status {e.code}.") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        log.warning("WAHA tidak dapat dihubungi: %s", e)
        raise WhatsAppError("Server WhatsApp tidak dapat dihubungi.") from e
