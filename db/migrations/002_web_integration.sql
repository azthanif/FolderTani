-- =============================================================================
-- 002 INTEGRASI WEB TemuTani dengan skema chatbot WhatsApp.
-- Aman dijalankan ke Supabase "TemuTani": hanya MENAMBAH (kolom, tabel, trigger) dan
-- memperluas constraint. Tabel & data chatbot yang ada tidak dihapus.
--
--  1. users       : role 'tengkulak' + kolom password_hash (login web)
--  2. stock_batches: sisa stok per tanggal panen (stocks tetap 1 baris/petani = total)
--  3. stock_logs  : riwayat perubahan stok (web, WhatsApp, kesepakatan)
--  4. otp_codes   : kode verifikasi WhatsApp (lupa/ubah password)
--  5. trigger stocks: setiap perubahan quantity_kg (dari web ATAU chatbot) dicatat di
--                     stock_logs dan disinkronkan ke stock_batches (FIFO bila berkurang)
--  6. accept_offer: perilaku sama, ditambah label riwayat "Terjual via Temu Tani (OFF-x)"
--  7. akun admin  : +6281241831052 (password dibuat lewat Lupa Password / skrip set_password)
-- =============================================================================

-- 1. users ---------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['petani'::text, 'tengkulak'::text, 'admin'::text]));
alter table public.users add column if not exists password_hash text;
comment on column public.users.password_hash is 'Hash PBKDF2-SHA256 untuk login web. NULL = belum membuat password (mis. terdaftar via WhatsApp).';

-- 2. stock_batches -------------------------------------------------------------
create table if not exists public.stock_batches (
  id bigint generated always as identity primary key,
  stock_id bigint not null references public.stocks(id) on delete cascade,
  harvest_date date not null,
  quantity_kg integer not null check (quantity_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stock_id, harvest_date)
);
drop trigger if exists stock_batches_updated_at on public.stock_batches;
create trigger stock_batches_updated_at before update on public.stock_batches
  for each row execute function public.set_updated_at();

-- 3. stock_logs ----------------------------------------------------------------
create table if not exists public.stock_logs (
  id bigint generated always as identity primary key,
  farmer_id uuid not null references public.users(id) on delete cascade,
  activity text not null,
  harvest_date date,
  delta_kg integer not null,
  total_kg integer not null,
  source text not null default 'whatsapp' check (source = any (array['web'::text, 'whatsapp'::text, 'system'::text])),
  offer_id bigint references public.offers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_logs_farmer_created_idx on public.stock_logs (farmer_id, created_at desc);
create index if not exists stock_logs_offer_idx on public.stock_logs (offer_id);

-- 4. otp_codes -----------------------------------------------------------------
create table if not exists public.otp_codes (
  id bigint generated always as identity primary key,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  purpose text not null check (purpose = any (array['reset_password'::text, 'change_password'::text])),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_phone_idx on public.otp_codes (phone, purpose, created_at desc);

-- Indeks pendukung query web.
create index if not exists offers_stock_idx on public.offers (stock_id);
create index if not exists offers_farmer_idx on public.offers (farmer_id);
create index if not exists offers_request_idx on public.offers (request_id);
create index if not exists offer_events_offer_idx on public.offer_events (offer_id, created_at);
create index if not exists requests_buyer_phone_idx on public.requests (buyer_phone);

-- RLS aktif tanpa policy: tabel hanya bisa diakses backend (role postgres/service_role),
-- sama seperti tabel chatbot lainnya.
alter table public.stock_batches enable row level security;
alter table public.stock_logs enable row level security;
alter table public.otp_codes enable row level security;

-- 5. Trigger sinkronisasi & riwayat stok ---------------------------------------
-- Pemanggil boleh mengatur (transaction-local, via set_config(..., true)):
--   temutani.log_activity  label riwayat           (default 'Update stok via WhatsApp')
--   temutani.log_source    web | whatsapp | system  (default 'whatsapp')
--   temutani.log_harvest   tanggal panen terkait    (opsional)
--   temutani.log_offer     id offer terkait         (opsional)
--   temutani.batch_synced  'on' bila pemanggil sudah mengatur stock_batches sendiri (web)
create or replace function public.stocks_quantity_changed() returns trigger
language plpgsql set search_path to 'public' as $$
declare
  old_qty integer := case when tg_op = 'INSERT' then 0 else old.quantity_kg end;
  d integer := new.quantity_kg - old_qty;
  remaining integer;
  b record;
  take integer;
begin
  if d = 0 then
    return new;
  end if;
  if coalesce(current_setting('temutani.batch_synced', true), '') <> 'on' then
    if d < 0 then
      -- Pengurangan dari chatbot/kesepakatan: ambil dari panen paling lama dulu (FIFO).
      remaining := -d;
      for b in select id, quantity_kg from public.stock_batches
               where stock_id = new.id and quantity_kg > 0
               order by harvest_date asc, id asc for update loop
        exit when remaining <= 0;
        take := least(b.quantity_kg, remaining);
        update public.stock_batches set quantity_kg = quantity_kg - take where id = b.id;
        remaining := remaining - take;
      end loop;
    else
      -- Penambahan dari chatbot: masuk ke batch tanggal available_date.
      insert into public.stock_batches (stock_id, harvest_date, quantity_kg)
      values (new.id, coalesce(new.available_date, current_date), d)
      on conflict (stock_id, harvest_date)
      do update set quantity_kg = public.stock_batches.quantity_kg + excluded.quantity_kg;
    end if;
  end if;
  insert into public.stock_logs (farmer_id, activity, harvest_date, delta_kg, total_kg, source, offer_id)
  values (
    new.farmer_id,
    coalesce(nullif(current_setting('temutani.log_activity', true), ''), 'Update stok via WhatsApp'),
    nullif(current_setting('temutani.log_harvest', true), '')::date,
    d,
    new.quantity_kg,
    coalesce(nullif(current_setting('temutani.log_source', true), ''), 'whatsapp'),
    nullif(current_setting('temutani.log_offer', true), '')::bigint
  );
  return new;
end $$;

drop trigger if exists stocks_quantity_log on public.stocks;
create trigger stocks_quantity_log after insert or update of quantity_kg on public.stocks
  for each row execute function public.stocks_quantity_changed();

-- Saldo awal: stok yang sudah ada dijadikan satu batch per petani + 1 baris riwayat.
insert into public.stock_batches (stock_id, harvest_date, quantity_kg)
select s.id, s.available_date, s.quantity_kg
from public.stocks s
where s.quantity_kg > 0
  and not exists (select 1 from public.stock_batches b where b.stock_id = s.id);

insert into public.stock_logs (farmer_id, activity, harvest_date, delta_kg, total_kg, source)
select s.farmer_id, 'Saldo awal', s.available_date, s.quantity_kg, s.quantity_kg, 'system'
from public.stocks s
where s.quantity_kg > 0
  and not exists (select 1 from public.stock_logs l where l.farmer_id = s.farmer_id);

-- 6. accept_offer: sama seperti versi chatbot, ditambah label riwayat stok -------
create or replace function public.accept_offer(p_offer_id bigint, p_actor text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  o public.offers%rowtype;
  s public.stocks%rowtype;
begin
  if p_actor not in ('farmer','buyer') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_actor');
  end if;
  select * into o from public.offers where id = p_offer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if (p_actor = 'farmer' and o.status <> 'FARMER_TURN')
     or (p_actor = 'buyer' and o.status <> 'BUYER_TURN') then
    return jsonb_build_object('ok', false, 'reason', 'not_your_turn', 'status', o.status);
  end if;
  select * into s from public.stocks where id = o.stock_id for update;
  if s.quantity_kg < o.qty_kg then
    update public.offers set status = 'FAILED', updated_at = now() where id = o.id;
    insert into public.offer_events (offer_id, actor, action, price, note)
    values (o.id, 'system', 'fail', o.current_price, 'insufficient_stock');
    return jsonb_build_object('ok', false, 'reason', 'insufficient_stock', 'stock_kg', s.quantity_kg, 'qty_kg', o.qty_kg);
  end if;
  -- [002] Label riwayat stok + pastikan batch dikurangi FIFO oleh trigger.
  perform set_config('temutani.log_activity', 'Terjual via Temu Tani (' || o.code || ')', true);
  perform set_config('temutani.log_source', 'system', true);
  perform set_config('temutani.log_offer', o.id::text, true);
  perform set_config('temutani.log_harvest', '', true);
  perform set_config('temutani.batch_synced', '', true);
  update public.stocks set quantity_kg = quantity_kg - o.qty_kg, updated_at = now() where id = s.id;
  perform set_config('temutani.log_activity', '', true);
  perform set_config('temutani.log_source', '', true);
  perform set_config('temutani.log_offer', '', true);
  update public.offers set status = 'AGREED', agreed_price = o.current_price, agreed_at = now(), updated_at = now() where id = o.id;
  insert into public.offer_events (offer_id, actor, action, price) values (o.id, p_actor, 'accept', o.current_price);
  return jsonb_build_object('ok', true, 'offer_code', o.code, 'agreed_price', o.current_price,
                            'qty_kg', o.qty_kg, 'total_value', o.current_price * o.qty_kg,
                            'farmer_id', o.farmer_id, 'request_id', o.request_id);
end;
$function$;

-- Fungsi SECURITY DEFINER tidak boleh bisa dipanggil publik (anon/authenticated) lewat PostgREST.
-- service_role (dipakai backend/n8n) tetap diberi izin eksplisit agar chatbot tidak terganggu.
revoke execute on function public.accept_offer(bigint, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.accept_offer(bigint, text) from anon, authenticated';
    -- Samakan dengan tabel chatbot: tabel baru tidak boleh diakses role publik lewat PostgREST.
    execute 'revoke all on public.stock_batches, public.stock_logs, public.otp_codes from anon, authenticated';
    execute 'revoke execute on function public.stocks_quantity_changed() from public, anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.accept_offer(bigint, text) to service_role';
  end if;
end $$;

-- 7. Akun admin -------------------------------------------------------------------
insert into public.users (phone, role, name, display_name)
values ('+6281241831052', 'admin', 'Admin Temu Tani', 'Admin Temu Tani')
on conflict (phone) do nothing;
