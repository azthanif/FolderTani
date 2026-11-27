"""Bangun db/migrations/008_master_desa_seed.sql dari backend/data/koordinat_desa.csv.

Jalankan ulang setelah CSV diperbarui (mis. koordinat kantor desa dari tim):
    python db/tools/gen_master_desa_seed.py
Untuk database yang sudah berjalan, gunakan `python -m backend.seed_desa` (upsert + backfill users.kode_desa).
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "backend" / "data" / "koordinat_desa.csv"
OUT = ROOT / "db" / "migrations" / "008_master_desa_seed.sql"


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    rows = list(csv.DictReader(CSV.open(encoding="utf-8")))
    vals = ",\n".join(
        f"  ({q(r['kode_desa'])}, {q(r['nama_desa'])}, {q(r['kecamatan'])}, {q(r['kabupaten'])}, {q(r['jenis'])},"
        f" {r['lat'] or 'null'}, {r['lon'] or 'null'}, {q(r['sumber_koordinat'])})"
        for r in rows
    )
    OUT.write_text(f"""-- =============================================================================
-- 008 MASTER DESA (seed): {len(rows)} desa/kelurahan Kabupaten Garut dan Cianjur + koordinat
-- DIBANGKITKAN oleh db/tools/gen_master_desa_seed.py dari backend/data/koordinat_desa.csv; jangan diedit manual.
--
-- Kode & nama: Kepmendagri No. 300.2.2-2138 Tahun 2025 (backend/data/wilayah.json).
-- Koordinat awal: titik pusat poligon desa dari cahyadsn/wilayah_boundaries (MIT License, db/kel/32/32.03 & 32.05),
-- ditandai sumber_koordinat = 'centroid'. Titik kantor desa (sumber 'kantor_desa') diisi tim lewat CSV lalu
-- `python -m backend.seed_desa`; insert di bawah tidak menimpa baris yang sudah ada.
-- =============================================================================

insert into public.master_desa (kode_desa, nama_desa, kecamatan, kabupaten, jenis, lat, lon, sumber_koordinat) values
{vals}
on conflict (kode_desa) do nothing;

-- Backfill users.kode_desa dari nama kabupaten/kecamatan/kelurahan yang sudah tervalidasi (nama baku Kepmendagri).
update public.users u
   set kode_desa = m.kode_desa
  from public.master_desa m
 where u.kode_desa is null and u.kelurahan is not null
   and lower(m.kabupaten) = lower(u.kabupaten) and lower(m.kecamatan) = lower(u.kecamatan)
   and lower(m.nama_desa) = lower(u.kelurahan);
""", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(rows)} desa")


if __name__ == "__main__":
    main()
