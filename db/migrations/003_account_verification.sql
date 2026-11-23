-- =============================================================================
-- 003 VERIFIKASI AKUN & ALAMAT LENGKAP TENGKULAK
-- Aman dijalankan ke Supabase "TemuTani": hanya MENAMBAH kolom/constraint/indeks.
-- Baris yang sudah ada (petani dari chatbot, admin, tengkulak lama) otomatis 'active'.
--
--  1. users.account_status : pending (baru daftar mandiri) | active | rejected
--  2. users.kelurahan      : desa/kelurahan (dipakai tengkulak; petani opsional)
--  3. jejak verifikasi     : verified_at, verified_by (admin), rejection_reason
-- Pendaftaran mandiri di web hanya untuk tengkulak; akun petani dimasukkan admin/chatbot.
-- =============================================================================

alter table public.users add column if not exists account_status text not null default 'active';
alter table public.users drop constraint if exists users_account_status_check;
alter table public.users add constraint users_account_status_check
  check (account_status = any (array['pending'::text, 'active'::text, 'rejected'::text]));
comment on column public.users.account_status is
  'pending = menunggu verifikasi admin (tengkulak daftar mandiri), active = boleh masuk, rejected = ditolak admin.';

alter table public.users add column if not exists kelurahan text;
comment on column public.users.kelurahan is 'Desa/kelurahan (kode wilayah Kepmendagri). Wajib untuk tengkulak yang daftar via web.';

alter table public.users add column if not exists verified_at timestamptz;
alter table public.users add column if not exists verified_by uuid references public.users(id) on delete set null;
alter table public.users add column if not exists rejection_reason text;

create index if not exists users_status_role_idx on public.users (account_status, role, created_at desc);
