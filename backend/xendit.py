"""Klien Xendit (test mode) untuk escrow Temu Tani: Invoice (tagih tengkulak) + Disbursement (cairkan ke petani).

Pustaka standar saja (urllib), sama seperti wa.py. Dokumentasi yang dipakai:
  POST /v2/invoices              buat invoice (external_id, amount, invoice_duration detik)
  GET  /v2/invoices/{id}         cek ulang status invoice (dipakai setelah callback)
  POST /disbursements            buat disbursement (header X-IDEMPOTENCY-KEY)
  GET  /disbursements/{id}       cek ulang status disbursement
Callback Xendit tidak ditandatangani HMAC: keaslian dicek dengan header x-callback-token.

Env:
  XENDIT_SECRET_KEY      kunci API development (xnd_development_...). Wajib kecuali mode simulasi.
  XENDIT_CALLBACK_TOKEN  token verifikasi callback dari dashboard Xendit (Settings > Webhooks).
  XENDIT_API_URL         default https://api.xendit.co
  TEMUTANI_PAYMENT_MOCK=1  mode simulasi tanpa akun Xendit (lokal/demo): invoice & disbursement palsu,
                           status digerakkan lewat endpoint admin /api/escrow/{id}/simulasi.
"""
from __future__ import annotations

import base64
import hmac
import json
import logging
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional

log = logging.getLogger("temutani.xendit")


class XenditError(RuntimeError):
    def __init__(self, message: str, code: str = "XENDIT_ERROR", status: int = 0):
        super().__init__(message)
        self.code = code
        self.status = status

    @property
    def uncertain(self) -> bool:
        """True bila hasil permintaan tidak diketahui (jaringan putus, 5xx): permintaan mungkin sudah diproses Xendit."""
        return self.code in ("NETWORK_ERROR", "BAD_RESPONSE") or self.status >= 500


def mock_mode() -> bool:
    return os.getenv("TEMUTANI_PAYMENT_MOCK", "") == "1"


def configured() -> bool:
    return mock_mode() or bool(os.getenv("XENDIT_SECRET_KEY", "").strip())


def verify_callback_token(received: Optional[str]) -> bool:
    """Bandingkan x-callback-token secara constant-time. Token kosong di server = semua ditolak."""
    expected = os.getenv("XENDIT_CALLBACK_TOKEN", "").strip()
    if not expected or not received:
        return False
    return hmac.compare_digest(expected.encode(), received.strip().encode())


def _request(method: str, path: str, payload: Optional[dict] = None, headers: Optional[dict] = None, timeout: float = 15.0):
    key = os.getenv("XENDIT_SECRET_KEY", "").strip()
    if not key:
        raise XenditError("XENDIT_SECRET_KEY belum di-set.", "NOT_CONFIGURED")
    base = os.getenv("XENDIT_API_URL", "https://api.xendit.co").strip().rstrip("/")
    auth = base64.b64encode(f"{key}:".encode()).decode()
    h = {"Authorization": f"Basic {auth}", "Content-Type": "application/json", "Accept": "application/json", **(headers or {})}
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        body = e.read()[:500]
        code = "XENDIT_ERROR"
        try:
            code = json.loads(body).get("error_code") or code
        except ValueError:
            pass
        log.warning("Xendit %s %s -> HTTP %s %s", method, path, e.code, body)
        raise XenditError(f"Xendit membalas status {e.code}.", code, e.code) from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        log.warning("Xendit tidak dapat dihubungi: %s", e)
        raise XenditError("Xendit tidak dapat dihubungi.", "NETWORK_ERROR") from e
    try:
        out = json.loads(raw or b"{}")
    except ValueError as e:
        raise XenditError("Respons Xendit tidak valid.", "BAD_RESPONSE") from e
    return out if isinstance(out, (dict, list)) else {}


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------
def create_invoice(external_id: str, amount: int, description: str, duration_seconds: int,
                   success_redirect_url: Optional[str] = None) -> dict:
    """-> {'id', 'invoice_url', 'expiry_date' (ISO), 'status'}"""
    if mock_mode():
        exp = datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)
        return {"id": "mock-inv-" + secrets.token_hex(8), "status": "PENDING",
                "invoice_url": (success_redirect_url or "") + ("&" if "?" in (success_redirect_url or "") else "?") + "simulasi=1",
                "expiry_date": exp.isoformat()}
    body = {"external_id": external_id, "amount": int(amount), "currency": "IDR", "description": description,
            "invoice_duration": int(duration_seconds)}
    if success_redirect_url:
        body["success_redirect_url"] = success_redirect_url
        body["failure_redirect_url"] = success_redirect_url
    return _request("POST", "/v2/invoices", body)


def get_invoice(invoice_id: str) -> dict:
    if mock_mode():
        raise XenditError("Mode simulasi tidak bisa cek ulang ke Xendit.", "MOCK")
    return _request("GET", f"/v2/invoices/{invoice_id}")


# ---------------------------------------------------------------------------
# Disbursement
# ---------------------------------------------------------------------------
def create_disbursement(external_id: str, amount: int, bank_code: str, account_holder_name: str,
                        account_number: str, description: str) -> dict:
    """-> {'id', 'status': 'PENDING', ...}. external_id dipakai juga sebagai idempotency key."""
    if mock_mode():
        return {"id": "mock-disb-" + secrets.token_hex(8), "status": "PENDING", "external_id": external_id}
    body = {"external_id": external_id, "amount": int(amount), "bank_code": bank_code,
            "account_holder_name": account_holder_name, "account_number": account_number, "description": description}
    return _request("POST", "/disbursements", body, headers={"X-IDEMPOTENCY-KEY": external_id})


def get_disbursement(disbursement_id: str) -> dict:
    if mock_mode():
        raise XenditError("Mode simulasi tidak bisa cek ulang ke Xendit.", "MOCK")
    return _request("GET", f"/disbursements/{disbursement_id}")


def find_disbursements(external_id: str) -> list[dict]:
    """GET /disbursements?external_id=... : dipakai rekonsiliasi saat hasil pembuatan disbursement tidak pasti."""
    if mock_mode():
        raise XenditError("Mode simulasi tidak bisa cek ulang ke Xendit.", "MOCK")
    from urllib.parse import quote
    try:
        out = _request("GET", f"/disbursements?external_id={quote(external_id)}")
    except XenditError as e:
        if e.status == 404:  # Xendit membalas 404 bila tidak ada disbursement dengan external_id tersebut
            return []
        raise
    return [d for d in (out if isinstance(out, list) else [out]) if isinstance(d, dict) and d.get("id")]
