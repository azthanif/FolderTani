"""Paket backend Temu Tani.

Saat dijalankan lokal, variabel dari backend/.env dimuat lebih dulu (sebelum auth/db/wa membaca os.environ).
Variabel yang sudah di-set tidak ditimpa. Di Vercel file ini tidak ada; isi lewat Environment Variables.
Saat pytest, .env sengaja tidak dimuat agar tes tidak menyentuh database/WA sungguhan.
"""
import os
import sys
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        val = val.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = val


if "pytest" not in sys.modules:
    _load_dotenv(Path(__file__).resolve().parent / ".env")
