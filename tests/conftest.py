"""Fixture tes: PostgreSQL lokal sementara dengan skema identik Supabase (db/migrations/*.sql).

Butuh binary PostgreSQL (initdb/pg_ctl). Lokasi bisa diatur lewat env PG_BIN.
Bila tidak ada, seluruh tes dilewati (skip).
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted(glob.glob(str(ROOT / "db" / "migrations" / "*.sql")))
PORT = int(os.getenv("TEST_PG_PORT", "55439"))


def _pg_bin() -> str | None:
    cands = [os.getenv("PG_BIN", "")] + sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True) + ["/opt/homebrew/bin", "/usr/local/bin"]
    for c in cands:
        if c and Path(c, "initdb").exists():
            return c
    found = shutil.which("initdb")
    return str(Path(found).parent) if found else None


def _as_pg_user(cmd: list[str]) -> list[str]:
    # initdb menolak berjalan sebagai root: jalankan sebagai user "postgres" bila perlu.
    if os.geteuid() == 0:
        return ["su", "postgres", "-c", " ".join(cmd)]
    return cmd


@pytest.fixture(scope="session")
def database_url():
    pg = _pg_bin()
    if not pg:
        pytest.skip("Binary PostgreSQL tidak ditemukan (set PG_BIN).")
    tmp = tempfile.mkdtemp(prefix="temutani-pg-")
    if os.geteuid() == 0:
        shutil.chown(tmp, "postgres")
    data = f"{tmp}/data"
    subprocess.run(_as_pg_user([f"{pg}/initdb", "-D", data, "-U", "postgres", "-A", "trust", "--no-sync", ">/dev/null"]), check=True)
    subprocess.run(_as_pg_user([f"{pg}/pg_ctl", "-D", data, "-o", f"'-p {PORT} -k {tmp} -c fsync=off'", "-l", f"{tmp}/log", "start", ">/dev/null"]), check=True)
    url = f"postgresql://postgres@localhost:{PORT}/postgres?host={tmp}"
    import psycopg

    for _ in range(50):
        try:
            with psycopg.connect(url, autocommit=True) as conn:
                # Role bawaan Supabase yang dirujuk migrasi (mis. 005 grant ke authenticated/service_role).
                for role in ("anon", "authenticated", "service_role"):
                    conn.execute(f"do $$ begin if not exists (select 1 from pg_roles where rolname = '{role}')"
                                 f" then create role {role} nologin; end if; end $$")
                for f in MIGRATIONS:
                    conn.execute(Path(f).read_text())
            break
        except psycopg.OperationalError:
            time.sleep(0.2)
    else:  # pragma: no cover
        raise RuntimeError("PostgreSQL tes gagal dijalankan.")
    yield url
    subprocess.run(_as_pg_user([f"{pg}/pg_ctl", "-D", data, "stop", "-m", "fast", ">/dev/null"]), check=False)
    shutil.rmtree(tmp, ignore_errors=True)


PASSWORD = "temutani123"
PHONES = {
    "admin": "081241831052",
    "petani": "081200000001",
    "petani_cianjur": "081200000003",
    "tengkulak": "081200000002",
    "tengkulak2": "081200000004",
    "wa_farmer": "081200000009",  # terdaftar via chatbot WA, belum punya password
}


@pytest.fixture()
def client(database_url, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("TEMUTANI_OTP_DEV", "1")
    monkeypatch.delenv("WAHA_URL", raising=False)
    monkeypatch.setenv("TEMUTANI_DATA_DIR", str(tmp_path))
    import psycopg
    from fastapi.testclient import TestClient

    from backend import auth, cache, db, main

    pw = auth.hash_password(PASSWORD)
    e = auth.to_e164
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("truncate otp_codes, stock_logs, stock_batches, offer_events, offers, requests, stocks, price_predictions, price_forecasts, price_observations, gee_features_daily, users restart identity cascade")
        conn.execute(
            """insert into users (phone, role, name, display_name, kabupaten, kecamatan, password_hash, contact_sharing_consent, status) values
               (%s,'admin','Admin Temu Tani','Admin Temu Tani',null,null,%s,false,'approved'),
               (%s,'petani','Pak Asep Hidayat','Pak Asep Hidayat','Garut','Tarogong Kidul',%s,false,'approved'),
               (%s,'petani','Bu Dewi','Petani E','Cianjur','Ciranjang',%s,true,'approved'),
               (%s,'tengkulak','Pak Budi Santoso','Pak Budi Santoso',null,null,%s,false,'approved'),
               (%s,'tengkulak','Pak Hendra','Pak Hendra',null,null,%s,false,'approved'),
               (%s,'petani','Pak Ujang','Petani B','Garut','Leles',null,false,default)""",
            (e(PHONES["admin"]), pw, e(PHONES["petani"]), pw, e(PHONES["petani_cianjur"]), pw,
             e(PHONES["tengkulak"]), pw, e(PHONES["tengkulak2"]), pw, e(PHONES["wa_farmer"])),
        )
        conn.execute(
            "insert into price_predictions (kabupaten, grain_type, period, price_per_kg, model_version) values"
            " ('Garut','GKP', date_trunc('month', now())::date, 6900, 'tes'), ('Cianjur','GKP', date_trunc('month', now())::date, 6950, 'tes')"
        )
    db.close_pool()
    cache.clear()
    with TestClient(main.app) as c:
        yield c
    db.close_pool()


@pytest.fixture()
def login(client):
    def _login(who: str) -> dict:
        r = client.post("/api/auth/login", json={"phone": PHONES[who], "password": PASSWORD})
        assert r.status_code == 200, r.text
        return {"Authorization": "Bearer " + r.json()["token"]}

    return _login


@pytest.fixture()
def sql(database_url):
    import psycopg
    from psycopg.rows import dict_row

    def _sql(query: str, params: tuple = ()):
        with psycopg.connect(database_url, autocommit=True, row_factory=dict_row) as conn:
            cur = conn.execute(query, params)
            return cur.fetchall() if cur.description else None

    return _sql
