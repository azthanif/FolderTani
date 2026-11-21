#!/usr/bin/env bash
# Menjalankan Temu Tani (FastAPI + frontend) di macOS/Linux.
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -q -r requirements.txt
echo "Buka http://localhost:8000"
exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
