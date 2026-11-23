"""Koneksi PostgreSQL (Supabase) untuk backend Temu Tani.

Env:
  DATABASE_URL  connection string Postgres. Untuk Vercel (serverless) gunakan
                Supabase *Transaction pooler* (port 6543), contoh:
                postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
                Prepared statement dimatikan (prepare_threshold=None) agar kompatibel dengan pooler.
"""
from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from typing import Iterator, Optional

from psycopg import Cursor
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool: Optional[ConnectionPool] = None
_lock = threading.Lock()


class DatabaseNotConfigured(RuntimeError):
    pass


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise DatabaseNotConfigured("DATABASE_URL belum di-set.")
    return url


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = ConnectionPool(
                    database_url(),
                    min_size=0,
                    max_size=int(os.getenv("DB_POOL_MAX", "5")),
                    kwargs={"prepare_threshold": None, "row_factory": dict_row, "autocommit": False},
                    open=True,
                    timeout=10,
                )
    return _pool


def close_pool() -> None:
    global _pool
    with _lock:
        if _pool is not None:
            _pool.close()
            _pool = None


@contextmanager
def tx() -> Iterator[Cursor]:
    """Satu transaksi: commit bila blok selesai, rollback bila ada exception."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            yield cur


def set_log_context(cur: Cursor, activity: str = "", source: str = "", harvest: str = "", offer: str = "", batch_synced: bool = False) -> None:
    """Label untuk trigger riwayat stok (berlaku sampai akhir transaksi)."""
    cur.execute(
        "select set_config('temutani.log_activity', %s, true), set_config('temutani.log_source', %s, true),"
        " set_config('temutani.log_harvest', %s, true), set_config('temutani.log_offer', %s, true),"
        " set_config('temutani.batch_synced', %s, true)",
        (activity, source, harvest, offer, "on" if batch_synced else ""),
    )
