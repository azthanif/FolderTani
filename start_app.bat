@echo off
cd /d "%~dp0"
set PY=
where py >nul 2>&1 && set PY=py
if not defined PY (where python >nul 2>&1 && set PY=python)
if not defined PY (
    echo Python belum terpasang. Pasang Python 3.10+ dari https://www.python.org/downloads/
    pause
    exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
    echo Membuat virtual environment...
    %PY% -m venv .venv
)
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
start "" "http://localhost:8000"
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause
