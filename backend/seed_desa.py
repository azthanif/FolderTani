"""Perbarui master_desa dari backend/data/koordinat_desa.csv lalu backfill users.kode_desa.

Dipakai setelah tim mengganti koordinat centroid dengan titik kantor desa (kolom sumber_koordinat = kantor_desa):
    DATABASE_URL=postgresql://... python -m backend.seed_desa            # upsert semua baris CSV
    DATABASE_URL=postgresql://... python -m backend.seed_desa --cek      # hanya laporan, tanpa menulis

Baris CSV dengan lat/lon kosong tidak menimpa koordinat yang sudah ada di database.
Transaksi escrow yang sudah dikunci tidak berubah (jarak & biaya tersimpan sebagai snapshot).
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

from .db import read, tx

CSV = Path(__file__).resolve().parent / "data" / "koordinat_desa.csv"

UPSERT = """
insert into master_desa (kode_desa, nama_desa, kecamatan, kabupaten, jenis, lat, lon, sumber_koordinat, diperbarui_pada)
values (%s, %s, %s, %s, %s, %s, %s, %s, now())
on conflict (kode_desa) do update set
  nama_desa = excluded.nama_desa, kecamatan = excluded.kecamatan, kabupaten = excluded.kabupaten, jenis = excluded.jenis,
  lat = coalesce(excluded.lat, master_desa.lat), lon = coalesce(excluded.lon, master_desa.lon),
  sumber_koordinat = case when excluded.lat is null then master_desa.sumber_koordinat else excluded.sumber_koordinat end,
  diperbarui_pada = now()
"""

BACKFILL = """
update users u set kode_desa = m.kode_desa
  from master_desa m
 where u.kode_desa is null and u.kelurahan is not null
   and lower(m.kabupaten) = lower(u.kabupaten) and lower(m.kecamatan) = lower(u.kecamatan) and lower(m.nama_desa) = lower(u.kelurahan)
"""


def _num(v: str):
    v = (v or "").strip()
    return float(v) if v else None


def laporan() -> None:
    with read() as cur:
        cur.execute("""select count(*)::int as desa, count(*) filter (where lat is null or lon is null)::int as tanpa_koordinat,
                              count(*) filter (where sumber_koordinat = 'kantor_desa')::int as kantor_desa from master_desa""")
        d = cur.fetchone()
        cur.execute("""select role, count(*)::int as total, count(kode_desa)::int as berkode from users
                        where role in ('petani', 'tengkulak') group by role order by role""")
        u = cur.fetchall()
    print(f"master_desa: {d['desa']} desa, {d['tanpa_koordinat']} tanpa koordinat, {d['kantor_desa']} titik kantor desa")
    for r in u:
        print(f"users {r['role']}: {r['berkode']}/{r['total']} sudah punya kode_desa")


def main(argv: list[str]) -> None:
    if "--cek" not in argv:
        rows = list(csv.DictReader(CSV.open(encoding="utf-8")))
        with tx() as cur:
            for r in rows:
                cur.execute(UPSERT, (r["kode_desa"], r["nama_desa"], r["kecamatan"], r["kabupaten"], r["jenis"],
                                     _num(r["lat"]), _num(r["lon"]), r["sumber_koordinat"] or "kantor_desa"))
            cur.execute(BACKFILL)
            print(f"{len(rows)} desa di-upsert; {cur.rowcount} pengguna mendapat kode_desa")
    laporan()


if __name__ == "__main__":
    main(sys.argv[1:])
