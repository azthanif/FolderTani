"""Penyimpanan: file lokal per langkah (selalu) + Supabase (opsional, lewat REST PostgREST)."""
from __future__ import annotations

import csv
import json
import re
import logging
from pathlib import Path
from typing import Iterable

import requests

log = logging.getLogger("news.storage")


# ---------------------------------------------------------------- file lokal
def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    tmp = path.with_suffix(path.suffix + ".tmp")
    n = 0
    with open(tmp, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
            n += 1
    tmp.replace(path)                      # atomik: file setengah jadi tidak pernah terbaca langkah berikutnya
    return n


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    log.warning("Baris rusak dilewati di %s", path.name)
    return out


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- Supabase
class Supabase:
    """Klien PostgREST minimal. Memakai service_role key: hanya untuk server/pipeline, jangan di frontend."""

    def __init__(self, url: str, key: str, timeout: int = 30):
        if not url or not key:
            raise ValueError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set")
        m = re.search(r"supabase\.com/dashboard/project/([a-z0-9]+)", url)
        if m:  # URL dashboard tertempel: ubah ke URL API proyek
            log.warning("SUPABASE_URL berisi URL dashboard; memakai https://%s.supabase.co", m.group(1))
            url = f"https://{m.group(1)}.supabase.co"
        url = url.rstrip("/").removesuffix("/rest/v1")
        if not re.match(r"^https?://[^/]+$", url):
            raise ValueError(f"SUPABASE_URL tidak valid: {url!r} (contoh: https://<project-ref>.supabase.co)")
        self.base = url + "/rest/v1"
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        self.timeout = timeout

    def _check(self, r: requests.Response) -> list | dict:
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {r.request.method} {r.url} -> {r.status_code}: {r.text[:300]}")
        return r.json() if r.text else []

    def upsert(self, table: str, rows: list[dict], on_conflict: str, chunk: int = 200) -> list[dict]:
        out: list[dict] = []
        for i in range(0, len(rows), chunk):
            r = self.s.post(f"{self.base}/{table}", params={"on_conflict": on_conflict},
                            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
                            data=json.dumps(rows[i:i + chunk], default=str), timeout=self.timeout)
            out += self._check(r)
        return out

    def insert_ignore(self, table: str, rows: list[dict], on_conflict: str) -> list[dict]:
        r = self.s.post(f"{self.base}/{table}", params={"on_conflict": on_conflict},
                        headers={"Prefer": "resolution=ignore-duplicates,return=representation"},
                        data=json.dumps(rows, default=str), timeout=self.timeout)
        return self._check(r)

    def select(self, table: str, params: dict) -> list[dict]:
        return self._check(self.s.get(f"{self.base}/{table}", params=params, timeout=self.timeout))

    def update(self, table: str, match: dict, values: dict) -> list[dict]:
        params = {k: f"eq.{v}" for k, v in match.items()}
        r = self.s.patch(f"{self.base}/{table}", params=params, headers={"Prefer": "return=representation"},
                         data=json.dumps(values, default=str), timeout=self.timeout)
        return self._check(r)


def supabase_from_ctx(ctx) -> Supabase | None:
    sc = ctx.cfg["storage"]["supabase"]
    if not sc.get("enabled"):
        return None
    return Supabase(ctx.secret(sc["url_env"]), ctx.secret(sc["key_env"]))