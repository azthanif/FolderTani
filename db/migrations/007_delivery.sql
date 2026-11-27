-- =============================================================================
-- 007 DELIVERY: estimasi jarak & biaya angkut + fee 0,5% + pencairan dua termin
-- (PRD "Fitur Delivery Temu Tani: Estimasi Jarak & Biaya Angkut", 27 Nov 2026)
-- Aman dijalankan ulang ke Supabase "TemuTani": hanya MENAMBAH tabel/kolom/izin.
--
--  master_desa        desa/kelurahan Garut + Cianjur beserta koordinat (isi: 008_master_desa_seed.sql)
--  tarif_armada       median tarif sewa truk (Deliveree, 2026)
--  users.kode_desa    desa/kelurahan pengguna (FK master_desa)
--  escrow_transaksi   snapshot pilihan pengambilan + rincian tagihan (biaya terkunci) + status termin 1 logistik
-- =============================================================================

-- 1. master_desa ------------------------------------------------------------------
create table if not exists public.master_desa (
  kode_desa char(10) primary key check (kode_desa ~ '^[0-9]{10}$'),   -- kode Kemendagri tanpa titik
  nama_desa text not null,
  kecamatan text not null,
  kabupaten text not null check (kabupaten in ('Garut', 'Cianjur')),
  jenis text not null check (jenis in ('desa', 'kelurahan')),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  sumber_koordinat text not null default 'kantor_desa' check (sumber_koordinat in ('kantor_desa', 'centroid')),
  diperbarui_pada timestamptz not null default now()
);
comment on table public.master_desa is 'Desa/kelurahan layanan + koordinat kantor desa (cadangan: centroid poligon desa). Jarak delivery = Haversine antar titik ini.';
create index if not exists master_desa_cari_idx on public.master_desa (kabupaten, kecamatan, nama_desa);

-- 2. tarif_armada -----------------------------------------------------------------
create table if not exists public.tarif_armada (
  kode text primary key check (kode in ('CDE', 'CDD', 'FUSO', 'TRONTON')),
  nama text not null,
  kapasitas_ton numeric(6,2) not null check (kapasitas_ton > 0),
  tarif_harian integer not null check (tarif_harian > 0),     -- median rentang harian (Rp)
  tarif_per_km integer not null check (tarif_per_km >= 0),    -- median rentang per km (Rp)
  sumber text not null,
  berlaku_mulai date not null default current_date,
  diperbarui_pada timestamptz not null default now()
);
comment on table public.tarif_armada is 'Median tarif sewa truk = (batas bawah + batas atas) / 2 dari rentang sumber. Mengubah tabel ini tidak mengubah transaksi yang sudah dikunci.';

insert into public.tarif_armada (kode, nama, kapasitas_ton, tarif_harian, tarif_per_km, sumber, berlaku_mulai) values
  ('CDE', 'Engkel CDE', 3, 850000, 4000, 'Deliveree (2026), rentang harian 500.000-1.200.000, per km 3.000-5.000', '2026-11-27'),
  ('CDD', 'Engkel CDD', 8, 1250000, 7000, 'Deliveree (2026), rentang harian 1.000.000-1.500.000, per km 5.000-9.000', '2026-11-27'),
  ('FUSO', 'Fuso', 10, 2100000, 10750, 'Deliveree (2026), rentang harian 1.200.000-3.000.000, per km 7.500-14.000', '2026-11-27'),
  ('TRONTON', 'Tronton', 25, 4150000, 14500, 'Deliveree (2026), rentang harian 1.800.000-6.500.000, per km 10.000-19.000', '2026-11-27')
on conflict (kode) do nothing;

-- 3. users.kode_desa --------------------------------------------------------------
alter table public.users add column if not exists kode_desa char(10);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_kode_desa_fkey') then
    alter table public.users add constraint users_kode_desa_fkey foreign key (kode_desa) references public.master_desa(kode_desa);
  end if;
end $$;
comment on column public.users.kode_desa is 'Desa/kelurahan pengguna (master_desa). Petani: backfill admin; tengkulak: dari form daftar/profil.';

-- 4. escrow_transaksi: snapshot pengambilan & tagihan + termin 1 logistik -----------
alter table public.escrow_transaksi
  add column if not exists pengambilan text check (pengambilan in ('ambil_sendiri', 'diantar')),  -- null = belum dipilih tengkulak
  add column if not exists kode_desa_asal char(10),
  add column if not exists kode_desa_tujuan char(10),
  add column if not exists jarak_km numeric(8,1) check (jarak_km >= 0),
  add column if not exists rincian_armada jsonb not null default '[]'::jsonb,
  add column if not exists biaya_logistik bigint not null default 0 check (biaya_logistik >= 0),
  add column if not exists fee bigint not null default 0 check (fee >= 0),
  add column if not exists total_tagihan bigint check (total_tagihan > 0),
  add column if not exists dikunci_pada timestamptz,
  add column if not exists logistik_status text check (logistik_status in ('DIPROSES', 'CAIR', 'GAGAL')),
  add column if not exists logistik_disbursement_id text unique,
  add column if not exists logistik_percobaan integer not null default 0,
  add column if not exists logistik_gagal_kode text,
  add column if not exists logistik_cair_pada timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'escrow_tagihan_konsisten') then
    alter table public.escrow_transaksi add constraint escrow_tagihan_konsisten
      check (total_tagihan is null or total_tagihan = nilai + biaya_logistik + fee);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'escrow_logistik_hanya_diantar') then
    alter table public.escrow_transaksi add constraint escrow_logistik_hanya_diantar
      check (pengambilan = 'diantar' or biaya_logistik = 0);
  end if;
end $$;

comment on column public.escrow_transaksi.nilai is 'Nilai gabah = harga_per_kg x berat_kg (termin gabah ke petani).';
comment on column public.escrow_transaksi.total_tagihan is 'Tagihan tengkulak (sekali bayar) = nilai + biaya_logistik + fee; terkunci saat pengambilan dipilih.';
comment on column public.escrow_transaksi.rincian_armada is 'Snapshot armada: [{kode, nama, kapasitas_ton, jumlah, tarif_harian, tarif_per_km, biaya}] saat dikunci.';

-- Escrow lama yang sudah punya invoice (dibuat sebelum fitur ini) dibayar sebesar nilai gabah saja:
-- tandai ambil sendiri tanpa fee agar tagihan tetap sama dengan invoice yang sudah terbit.
update public.escrow_transaksi
   set pengambilan = 'ambil_sendiri', total_tagihan = nilai, dikunci_pada = coalesce(dikunci_pada, dibuat_pada)
 where pengambilan is null and invoice_id is not null;

-- 5. RLS & izin ---------------------------------------------------------------------
alter table public.master_desa enable row level security;
alter table public.tarif_armada enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.master_desa, public.tarif_armada from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.master_desa, public.tarif_armada to service_role';
  end if;
end $$;
