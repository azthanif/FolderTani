"""Penyimpanan dokumen JSON berbasis file untuk state simulasi chatbot di halaman /chatbot.
Data utama aplikasi (akun, stok, penawaran) ada di database Supabase (lihat backend/db.py)."""
from __future__ import annotations

import json
import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path


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
