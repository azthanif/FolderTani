-- =============================================================================
-- 003 VERIFIKASI AKUN TENGKULAK & ALAMAT LENGKAP
-- Menyamakan repo dengan migrasi yang sudah ada di Supabase "TemuTani":
--   approval_akun_tengkulak (20261123100718) dan petani_auto_approve (20261123142708),
-- ditambah kolom kelurahan. Semua perintah idempoten: aman dijalankan ulang di Supabase.
--
--  users.status         : pending (daftar mandiri, menunggu admin) | approved | rejected
--  users.registered_via : seed | web | admin
--  users.reviewed_at/by : waktu & nama peninjau (teks)
--  users.review_note    : catatan peninjauan (alasan bila ditolak)
--  users.kelurahan      : desa/kelurahan (wajib untuk tengkulak yang daftar via web)
--  trigger              : akun petani selalu disetujui otomatis
-- =============================================================================

alter table public.users
  add column if not exists status text not null default 'approved'
    constraint users_status_check check (status in ('pending', 'approved', 'rejected')),
  add column if not exists registered_via text not null default 'seed'
    constraint users_registered_via_check check (registered_via in ('seed', 'web', 'admin')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists review_note text,
  add column if not exists kelurahan text;

alter table public.users alter column status set default 'pending';
comment on column public.users.kelurahan is 'Desa/kelurahan (kode wilayah Kepmendagri 2025). Wajib untuk tengkulak yang daftar via web.';

create index if not exists users_status_pending_idx on public.users (created_at) where status = 'pending';

create or replace function public.users_auto_approve_petani()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'petani' and new.status = 'pending' then
    new.status      := 'approved';
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, 'otomatis');
    new.review_note := coalesce(new.review_note, 'petani disetujui otomatis');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_auto_approve_petani on public.users;
create trigger trg_users_auto_approve_petani
  before insert or update of role, status on public.users
  for each row execute function public.users_auto_approve_petani();
