-- =============================================================================
-- 006 ESCROW: konfirmasi pembayaran & penerimaan (web + WhatsApp)
-- Aman dijalankan ke Supabase "TemuTani": hanya MENAMBAH tabel, tipe, indeks, dan izin.
--
--  escrow_transaksi       satu transaksi escrow per kesepakatan (offers.status = 'AGREED')
--  escrow_event           log audit perubahan status (hanya ditambah, tidak diubah/dihapus)
--  akun_pencairan_petani  data rekening/e-wallet tujuan pencairan (hanya dibaca backend)
--
-- Status (lihat PRD "Siklus status escrow"):
--   MENUNGGU_BAYAR -> DIBAYAR -> DIKIRIM -> DITERIMA -> SELESAI
--   pengecualian: KEDALUWARSA (invoice tak dibayar), SENGKETA (tengkulak lapor masalah),
--                 PENCAIRAN_GAGAL (callback disbursement FAILED; admin mencoba ulang)
-- Seluruh perubahan status dilakukan backend (FastAPI) dengan UPDATE ... WHERE status = <lama>.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'escrow_status') then
    create type public.escrow_status as enum (
      'MENUNGGU_BAYAR', 'DIBAYAR', 'DIKIRIM', 'DITERIMA', 'SELESAI',
      'KEDALUWARSA', 'SENGKETA', 'PENCAIRAN_GAGAL'
    );
  end if;
end $$;

-- 1. escrow_transaksi -----------------------------------------------------------
create table if not exists public.escrow_transaksi (
  id uuid primary key default gen_random_uuid(),               -- juga external_id di Xendit
  offer_id bigint not null unique references public.offers(id), -- satu deal = satu escrow
  petani_id uuid not null references public.users(id),
  tengkulak_phone text not null check (tengkulak_phone ~ '^\+[1-9][0-9]{7,14}$'),
  tengkulak_id uuid references public.users(id),               -- null bila pembeli belum punya akun web
  harga_per_kg integer not null check (harga_per_kg > 0),      -- snapshot saat deal
  berat_kg numeric(12,2) not null check (berat_kg > 0),        -- snapshot saat deal
  nilai bigint not null check (nilai > 0),                     -- harga_per_kg x berat_kg (Rp)
  status public.escrow_status not null default 'MENUNGGU_BAYAR',
  invoice_id text unique,
  invoice_url text,
  invoice_kedaluwarsa_pada timestamptz,
  disbursement_id text unique,
  pencairan_percobaan integer not null default 0,
  pencairan_gagal_kode text,
  dibayar_pada timestamptz,
  dikirim_pada timestamptz,
  diterima_pada timestamptz,
  selesai_pada timestamptz,
  catatan_masalah text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  constraint nilai_konsisten check (nilai = round(harga_per_kg * berat_kg))
);
comment on table public.escrow_transaksi is 'Escrow per kesepakatan. Hanya backend (FastAPI) yang menulis tabel ini.';

create index if not exists escrow_petani_idx on public.escrow_transaksi (petani_id, dibuat_pada desc);
create index if not exists escrow_tengkulak_idx on public.escrow_transaksi (tengkulak_phone, dibuat_pada desc);
create index if not exists escrow_status_idx on public.escrow_transaksi (status);

create or replace function public.escrow_set_diperbarui() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.diperbarui_pada = now();
  return new;
end $$;
drop trigger if exists escrow_transaksi_diperbarui on public.escrow_transaksi;
create trigger escrow_transaksi_diperbarui before update on public.escrow_transaksi
  for each row execute function public.escrow_set_diperbarui();

-- 2. escrow_event (log audit append-only) ---------------------------------------
create table if not exists public.escrow_event (
  id bigint generated always as identity primary key,
  escrow_id uuid not null references public.escrow_transaksi(id) on delete restrict, -- riwayat tidak ikut terhapus
  dari_status public.escrow_status,                             -- null untuk event pembuatan
  ke_status public.escrow_status not null,
  pelaku text not null check (pelaku in ('petani', 'tengkulak', 'admin', 'xendit', 'sistem')),
  kanal text not null check (kanal in ('web', 'whatsapp', 'webhook', 'sistem')),
  payload jsonb not null default '{}'::jsonb,
  dibuat_pada timestamptz not null default now()
);
create index if not exists escrow_event_escrow_idx on public.escrow_event (escrow_id, dibuat_pada, id);

create or replace function public.escrow_event_tolak_ubah() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'escrow_event hanya boleh ditambah (append-only)';
end $$;
drop trigger if exists escrow_event_append_only on public.escrow_event;
create trigger escrow_event_append_only before update or delete on public.escrow_event
  for each row execute function public.escrow_event_tolak_ubah();
drop trigger if exists escrow_event_no_truncate on public.escrow_event;
create trigger escrow_event_no_truncate before truncate on public.escrow_event
  for each statement execute function public.escrow_event_tolak_ubah();

-- 3. akun_pencairan_petani ------------------------------------------------------
create table if not exists public.akun_pencairan_petani (
  petani_id uuid primary key references public.users(id) on delete cascade,
  kode_bank text not null,          -- kode bank / e-wallet Xendit, mis. BCA, BNI, OVO
  nama_pemilik text not null,
  nomor_akun text not null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
comment on table public.akun_pencairan_petani is 'Tujuan pencairan escrow. Untuk demo diisi nilai uji Xendit, bukan rekening asli. Tidak pernah dikirim utuh ke frontend.';
drop trigger if exists akun_pencairan_diperbarui on public.akun_pencairan_petani;
create trigger akun_pencairan_diperbarui before update on public.akun_pencairan_petani
  for each row execute function public.escrow_set_diperbarui();

-- 4. RLS & izin: RLS aktif tanpa policy -> hanya backend (postgres/service_role) yang bisa akses.
alter table public.escrow_transaksi enable row level security;
alter table public.escrow_event enable row level security;
alter table public.akun_pencairan_petani enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.escrow_transaksi, public.escrow_event, public.akun_pencairan_petani from anon, authenticated';
    execute 'revoke execute on function public.escrow_set_diperbarui(), public.escrow_event_tolak_ubah() from public, anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.escrow_transaksi, public.akun_pencairan_petani to service_role';
    execute 'grant select, insert on public.escrow_event to service_role';
  end if;
end $$;
