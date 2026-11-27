"""Cache TTL di memori proses (per worker uvicorn) untuk mengurangi round trip ke database.

Database (Supabase) berada jauh dari server aplikasi, sehingga tiap query berbiaya puluhan milidetik.
Data yang jarang berubah (prakiraan harga diperbarui sekali sehari oleh pipeline, berita sekali sehari)
cukup dibaca ulang beberapa menit sekali.

Env:
  TEMUTANI_CACHE_TTL       detik untuk data harga & berita (default 300; 0 = mati)
  TEMUTANI_AUTH_CACHE_TTL  detik untuk baris user saat validasi token (default 20; 0 = mati)
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Callable

_data: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def _env_ttl(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def data_ttl() -> int:
    return _env_ttl("TEMUTANI_CACHE_TTL", 300)


def auth_ttl() -> int:
    return _env_ttl("TEMUTANI_AUTH_CACHE_TTL", 20)


def get_or_set(key: str, ttl: int, fn: Callable[[], Any]) -> Any:
    """Nilai dari cache bila masih segar; bila tidak, panggil fn() dan simpan.

    Objek yang sama dibagikan ke semua pemanggil: JANGAN diubah langsung (salin dulu bila perlu).
    """
    if ttl <= 0:
        return fn()
    now = time.monotonic()
    with _lock:
        hit = _data.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = fn()
    with _lock:
        _data[key] = (now + ttl, value)
    return value


def invalidate(prefix: str = "") -> None:
    with _lock:
        for k in [k for k in _data if k.startswith(prefix)]:
            del _data[k]


def clear() -> None:
    invalidate("")
