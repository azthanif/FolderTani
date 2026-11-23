"""Atur password akun langsung di database (mis. admin pertama kali, sebelum WAHA aktif).

    DATABASE_URL=postgresql://... python -m backend.set_password 081241831052

Password diketik secara tersembunyi (tidak tampil di layar maupun riwayat shell).
"""
from __future__ import annotations

import getpass
import sys

from . import auth
from .db import tx


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    local = auth.normalize_phone(argv[1])
    if not local:
        print("Nomor HP tidak valid.")
        return 2
    pw = getpass.getpass("Password baru (min. 8 karakter): ")
    if len(pw) < 8 or pw != getpass.getpass("Ulangi password: "):
        print("Password terlalu pendek atau tidak sama.")
        return 1
    with tx() as cur:
        cur.execute("update users set password_hash = %s where phone = %s returning role, name", (auth.hash_password(pw), auth.to_e164(local)))
        row = cur.fetchone()
    if not row:
        print("Nomor tidak terdaftar di tabel users.")
        return 1
    print(f"Password untuk {row['name']} ({row['role']}) berhasil diatur.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
