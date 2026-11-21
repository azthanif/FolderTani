"""Penyimpanan JSON berbasis file dengan kunci (lock) dan transaksi atomik.

Cukup untuk prototipe/hackathon satu proses. Untuk produksi ganti dengan database
(PostgreSQL/Supabase) dan transaksi SQL agar aman pada banyak worker.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator


class JsonStore:
    def __init__(self, path: Path, factory: Callable[[], dict]):
        self.path = Path(path)
        self.factory = factory
        self._lock = threading.RLock()
        self._data = self._load()

    def _load(self) -> dict:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    data.setdefault("version", 1)
                    return data
            except (OSError, json.JSONDecodeError):
                pass  # file rusak -> kembali ke data awal
        data = self.factory()
        data["version"] = 1
        return data

    def _persist(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=self.path.name, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(self._data, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)  # atomik: tidak ada file setengah tertulis

    def read(self) -> dict:
        with self._lock:
            return copy.deepcopy(self._data)

    @contextmanager
    def transaction(self) -> Iterator[dict]:
        """Ubah salinan data; commit hanya jika blok selesai tanpa exception."""
        with self._lock:
            work = copy.deepcopy(self._data)
            yield work
            work["version"] = int(self._data.get("version", 1)) + 1
            self._data = work
            self._persist()

    def reset(self) -> dict:
        with self._lock:
            version = int(self._data.get("version", 1)) + 1
            self._data = self.factory()
            self._data["version"] = version
            self._persist()
            return copy.deepcopy(self._data)


class BlobStore:
    """Menyimpan satu dokumen JSON bebas (dipakai state chatbot)."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.Lock()

    def get(self):
        with self._lock:
            if not self.path.exists():
                return None
            try:
                return json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return None

    def put(self, value) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=self.path.name, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(value, fh, ensure_ascii=False)
            os.replace(tmp, self.path)

    def clear(self) -> None:
        with self._lock:
            self.path.unlink(missing_ok=True)
