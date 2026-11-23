"""Langkah 2: unduh HTML sekali per URL, ekstrak teks (trafilatura, cadangan newspaper3k) -> 02_raw.jsonl.

Sopan ke server: jeda per domain, URL bergiliran antar domain, retry+backoff, robots.txt, circuit breaker.
Situs berproteksi bot dicatat BLOCKED_CHALLENGE lalu dicoba lewat arsip Wayback (tidak dibobol).
Bisa di-resume: hasil ditulis bertahap ke 02_progress.jsonl.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib import robotparser
from urllib.parse import urlparse

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .news_cleaner import is_failed
from .storage import read_jsonl, write_jsonl

log = logging.getLogger("news.gettext")

CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment|Performing security verification|"
                       r"Attention Required|Maaf, Anda tidak memiliki akses", re.I)
FINAL = {"OK", "HTTP_404", "HTTP_410", "ROBOTS_DISALLOWED", "EXTRACT_EMPTY", "NOT_HTML"}
RETRY_VIA_WAYBACK = {"BLOCKED_CHALLENGE", "DOMAIN_SKIPPED", "TIMEOUT", "CONN_ERROR", "EXTRACT_EMPTY", "HTTP_401",
                     "HTTP_403", "HTTP_429", "HTTP_500", "HTTP_502", "HTTP_503", "HTTP_504", "UNKNOWN_ERROR"}


class Fetcher:
    def __init__(self, fc: dict):
        self.fc = fc
        self._tls = threading.local()
        self.last = defaultdict(float)
        self.locks = defaultdict(threading.Lock)
        self.blocks = defaultdict(int)
        self.tripped: set[str] = set()
        self.robots: dict[str, robotparser.RobotFileParser] = {}
        self.g = threading.Lock()

    # -- jaringan
    def session(self) -> requests.Session:
        if not hasattr(self._tls, "s"):
            s = requests.Session()
            retry = Retry(total=3, connect=2, read=1, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504],
                          allowed_methods=["GET"], respect_retry_after_header=True, raise_on_status=False)
            s.mount("http://", HTTPAdapter(max_retries=retry))
            s.mount("https://", HTTPAdapter(max_retries=retry))
            s.headers.update({"User-Agent": self.fc["user_agent"], "Accept-Language": "id,en;q=0.8"})
            self._tls.s = s
        return self._tls.s

    def wait(self, domain: str) -> None:
        with self.locks[domain]:
            delay = self.last[domain] + float(self.fc["min_interval_sec"]) - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self.last[domain] = time.monotonic()

    def report(self, domain: str, blocked: bool) -> None:
        with self.g:
            self.blocks[domain] = self.blocks[domain] + 1 if blocked else 0
            if self.blocks[domain] >= int(self.fc["block_threshold"]) and domain not in self.tripped:
                self.tripped.add(domain)
                log.warning("[circuit breaker] %s memblokir %dx beruntun; sisa URL domain ini dilewati",
                            domain, self.blocks[domain])

    def allowed(self, url: str, domain: str) -> bool:
        if not self.fc["respect_robots"]:
            return True
        with self.locks["robots:" + domain]:
            if domain not in self.robots:
                rp = robotparser.RobotFileParser()
                try:
                    r = self.session().get(f"{urlparse(url).scheme}://{domain}/robots.txt", timeout=10)
                    if r.status_code in (401, 403):
                        rp.disallow_all = True               # sama dengan urllib.robotparser.read()
                    else:
                        rp.parse(r.text.splitlines() if r.status_code == 200 else [])
                except requests.RequestException:
                    rp.parse([])
                self.robots[domain] = rp
        return self.robots[domain].can_fetch(self.fc["user_agent"], url)

    def get(self, url: str, timeout: int | None = None) -> requests.Response:
        r = self.session().get(url, timeout=timeout or int(self.fc["timeout_sec"]), allow_redirects=True)
        if r.encoding is None or r.encoding.lower() == "iso-8859-1":
            r.encoding = r.apparent_encoding
        return r

    # -- satu URL
    def process(self, row: dict, source: str = "live") -> dict:
        url = row["url"]
        domain = urlparse(url).netloc.lower()
        rec = {"id": row["id"], "url": url, "source": source, "status": "", "http_code": None, "error": "",
               "fetched_at": datetime.now(timezone.utc).isoformat()}
        try:
            if source == "live":
                if domain in self.tripped:
                    return {**rec, "status": "DOMAIN_SKIPPED"}
                if not self.allowed(url, domain):
                    return {**rec, "status": "ROBOTS_DISALLOWED"}
                self.wait(domain)
                r = self.get(url)
            else:
                self.wait("archive.org")
                api = self.session().get("https://archive.org/wayback/available", params={"url": url}, timeout=20).json()
                snap = api.get("archived_snapshots", {}).get("closest", {})
                if not snap.get("available"):
                    return {**rec, "status": "WAYBACK_NOT_FOUND"}
                self.wait("archive.org")
                raw = re.sub(r"/web/(\d+)/", r"/web/\1id_/", snap["url"], count=1)   # id_ = HTML asli tanpa toolbar
                r = self.get(raw, timeout=40)
            rec["http_code"] = r.status_code
            body = r.text[:5_000_000]
            challenged = bool(CHALLENGE.search(body[:20000]) and len(body) < 60000)
            blocked = r.status_code in (401, 403, 429, 503) or challenged
            if source == "live":
                self.report(domain, blocked)
            if blocked:
                return {**rec, "status": "BLOCKED_CHALLENGE" if challenged else f"HTTP_{r.status_code}"}
            if r.status_code != 200:
                return {**rec, "status": f"HTTP_{r.status_code}"}
            if "html" not in r.headers.get("Content-Type", "text/html").lower():
                return {**rec, "status": "NOT_HTML"}
            ex = extract(body, url)
            ok = len(ex["full_text_trafilatura"]) >= 200 or len(ex["full_text"]) >= 200
            return {**rec, **ex, "status": "OK" if ok else "EXTRACT_EMPTY"}
        except requests.exceptions.Timeout:
            return {**rec, "status": "TIMEOUT"}
        except requests.exceptions.RequestException as e:
            return {**rec, "status": "TIMEOUT" if "timed out" in str(e).lower() else "CONN_ERROR", "error": str(e)[:300]}
        except Exception as e:  # noqa: BLE001 - satu URL rusak tidak boleh menghentikan seluruh batch
            return {**rec, "status": "UNKNOWN_ERROR", "error": f"{type(e).__name__}: {str(e)[:300]}"}


def extract(html: str, url: str) -> dict:
    import trafilatura
    out = {"full_text_trafilatura": "", "full_text": "", "traf_title": "", "traf_date": ""}
    try:
        out["full_text_trafilatura"] = trafilatura.extract(html, url=url, favor_recall=True, include_comments=False,
                                                           include_tables=False) or ""
        meta = trafilatura.extract_metadata(html)
        if meta:
            out["traf_title"], out["traf_date"] = meta.title or "", meta.date or ""
    except Exception:  # noqa: BLE001
        pass
    if len(out["full_text_trafilatura"]) < 500:            # cadangan newspaper3k dari HTML yang sama
        try:
            from newspaper import Article
            a = Article(url, language="id")
            a.download(input_html=html)
            a.parse()
            out["full_text"] = a.text or ""
        except Exception:  # noqa: BLE001
            pass
    return out


def _round_robin(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[urlparse(r["url"]).netloc.lower()].append(r)
    out, i = [], 0
    lists = list(groups.values())
    while any(i < len(g) for g in lists):
        out += [g[i] for g in lists if i < len(g)]
        i += 1
    return out


def _append(path, rec: dict, fh) -> None:
    fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _open_append(path):
    if path.exists() and path.stat().st_size > 0:
        with open(path, "rb") as f:
            f.seek(-1, os.SEEK_END)
            if f.read(1) != b"\n":
                with open(path, "a", encoding="utf-8") as g:
                    g.write("\n")                          # baris terakhir terpotong saat sesi putus
    return open(path, "a", encoding="utf-8")


def _latest(path) -> dict[str, dict]:
    return {r["id"]: r for r in read_jsonl(path)}


def from_extracted_csv(ctx, paths: list[str]) -> int:
    """Uji/backfill: pakai CSV yang sudah berisi full_text* (hasil notebook ekstraksi lama)."""
    urls = pd.read_csv(ctx.path("01_urls.csv"), dtype=str).fillna("")
    have = pd.concat([pd.read_csv(p, dtype=str).fillna("") for p in paths]).drop_duplicates("id").set_index("id")
    recs = []
    for r in urls.to_dict("records"):
        src = have.loc[r["id"]] if r["id"] in have.index else None
        rec = {"id": r["id"], "url": r["url"], "source": "csv", "http_code": None, "error": "",
               "full_text_trafilatura": "", "full_text": "", "full_text_selenium": ""}
        if src is not None:
            for c in ("full_text_trafilatura", "full_text", "full_text_selenium"):
                v = str(src.get(c, "") or "")
                rec[c] = "" if is_failed(v) else v
        rec["status"] = "OK" if any(rec[c] for c in ("full_text_trafilatura", "full_text", "full_text_selenium")) \
            else "EXTRACT_EMPTY"
        recs.append(rec)
    n = write_jsonl(ctx.path("02_raw.jsonl"), recs)
    log.info("02_raw.jsonl dari CSV: %d baris, OK %d", n, sum(r["status"] == "OK" for r in recs))
    return n


def run(ctx) -> int:
    out = ctx.path("02_raw.jsonl")
    if out.exists() and not ctx.force:
        log.info("02_raw.jsonl sudah ada, dilewati")
        return len(read_jsonl(out))
    if ctx.extras.get("input_extracted"):
        return from_extracted_csv(ctx, ctx.extras["input_extracted"])

    fc = ctx.cfg["fetch"]
    urls = pd.read_csv(ctx.path("01_urls.csv"), dtype=str).fillna("").to_dict("records")
    progress = ctx.path("02_progress.jsonl")
    fetcher = Fetcher(fc)

    done = _latest(progress)
    todo = [r for r in urls if not (r["id"] in done and done[r["id"]]["status"] in FINAL)]
    log.info("Live: %d final dari sebelumnya, %d diproses", len(urls) - len(todo), len(todo))
    lock = threading.Lock()
    with _open_append(progress) as fh, ThreadPoolExecutor(int(fc["max_workers"])) as ex:
        futs = [ex.submit(fetcher.process, r, "live") for r in _round_robin(todo)]
        for i, fu in enumerate(as_completed(futs), 1):
            with lock:
                _append(progress, fu.result(), fh)
                if i % 25 == 0:
                    fh.flush()
                    log.info("  %d/%d", i, len(futs))

    if fc["use_wayback"]:
        latest = _latest(progress)
        retry = [r for r in urls if latest.get(r["id"], {}).get("status") in RETRY_VIA_WAYBACK
                 and latest[r["id"]].get("source") == "live"]
        log.info("Wayback: mencoba %d URL gagal", len(retry))
        with _open_append(progress) as fh:
            for r in retry:
                rec = fetcher.process(r, "wayback")
                if rec["status"] != "OK":               # pertahankan penyebab awal, catat hasil wayback
                    rec = {**latest[r["id"]], "wayback_status": rec["status"], "source": "wayback"}
                _append(progress, rec, fh)

    latest = _latest(progress)
    recs = [latest.get(r["id"], {"id": r["id"], "url": r["url"], "status": "BELUM_DIPROSES"}) for r in urls]
    n = write_jsonl(out, recs)
    stat = pd.Series([r["status"] for r in recs]).value_counts().to_dict()
    log.info("02_raw.jsonl: %d baris | status %s", n, stat)
    return n
