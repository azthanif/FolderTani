"""Entrypoint Vercel Function (Python) untuk seluruh /api/*.

vercel.json me-rewrite /api/<path> ke function ini. FastAPI aslinya ada di backend/main.py;
file ini hanya membungkusnya agar path asli tetap utuh di lingkungan Vercel.
"""
import os
import sys
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app as fastapi_app  # noqa: E402


async def app(scope, receive, send):
    """Pulihkan path asli bila Vercel meneruskan request sebagai /api/index?__path=..."""
    if scope["type"] == "http" and scope.get("path", "").rstrip("/") in ("/api/index", "/api/index.py"):
        query = parse_qsl(scope.get("query_string", b"").decode(), keep_blank_values=True)
        original = next((v for k, v in query if k == "__path"), None)
        if original is not None:
            rest = [(k, v) for k, v in query if k != "__path"]
            path = "/api/" + original.lstrip("/")
            scope = {**scope, "path": path, "raw_path": path.encode(), "query_string": urlencode(rest).encode()}
    await fastapi_app(scope, receive, send)
