-- =============================================================================
-- 001 BASELINE: replika skema chatbot WhatsApp yang SUDAH ADA di Supabase "TemuTani".
-- JANGAN dijalankan ke Supabase (tabel-tabel ini sudah ada di sana).
-- Dipakai untuk database lokal & tes otomatis agar skemanya identik dengan produksi.
-- =============================================================================
create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  role text not null default 'petani' check (role = any (array['petani','admin'])),
  name text not null,
  display_name text not null,
  kabupaten text check (kabupaten = any (array['Garut','Cianjur'])),
  kecamatan text,
  contact_sharing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint petani_wajib_wilayah check (role <> 'petani' or (kabupaten is not null and kecamatan is not null))
);

create table public.stocks (
  id bigint generated always as identity primary key,
  farmer_id uuid not null references public.users(id) on delete cascade,
  grain_type text not null default 'GKP' check (grain_type = 'GKP'),
  quantity_kg integer not null default 0 check (quantity_kg >= 0),
  available_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farmer_id, grain_type)
);

create table public.requests (
  id bigint generated always as identity primary key,
  code text generated always as ('REQ-' || id::text) stored unique,
  buyer_phone text not null check (buyer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  kabupaten text not null check (kabupaten = any (array['Garut','Cianjur'])),
  need_kg integer not null check (need_kg > 0),
  initial_price integer not null check (initial_price > 0),
  offered_kg integer not null default 0 check (offered_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offered_tidak_melebihi_kebutuhan check (offered_kg <= need_kg)
);

create table public.offers (
  id bigint generated always as identity primary key,
  code text generated always as ('OFF-' || id::text) stored unique,
  request_id bigint not null references public.requests(id) on delete cascade,
  stock_id bigint not null references public.stocks(id),
  farmer_id uuid not null references public.users(id),
  qty_kg integer not null check (qty_kg > 0),
  initial_price integer not null check (initial_price > 0),
  current_price integer not null check (current_price > 0),
  current_by text not null default 'buyer' check (current_by = any (array['buyer','farmer'])),
  status text not null default 'FARMER_TURN' check (status = any (array['FARMER_TURN','BUYER_TURN','AGREED','FAILED'])),
  agreed_price integer check (agreed_price > 0),
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, stock_id),
  constraint agreed_konsisten check ((status = 'AGREED') = (agreed_price is not null and agreed_at is not null)),
  constraint giliran_konsisten check ((status <> 'FARMER_TURN' or current_by = 'buyer') and (status <> 'BUYER_TURN' or current_by = 'farmer'))
);

create table public.offer_events (
  id bigint generated always as identity primary key,
  offer_id bigint not null references public.offers(id),
  actor text not null check (actor = any (array['buyer','farmer','system'])),
  action text not null check (action = any (array['initial','counter','accept','fail'])),
  price integer check (price > 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.price_predictions (
  id bigint generated always as identity primary key,
  kabupaten text not null check (kabupaten = any (array['Garut','Cianjur'])),
  grain_type text not null check (grain_type = 'GKP'),
  period date not null check (extract(day from period) = 1),
  price_per_kg integer not null check (price_per_kg > 0),
  is_simulation boolean not null default true,
  model_version text,
  created_at timestamptz not null default now()
);

create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger stocks_updated_at before update on public.stocks for each row execute function public.set_updated_at();
create trigger requests_updated_at before update on public.requests for each row execute function public.set_updated_at();
create trigger offers_updated_at before update on public.offers for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.stocks enable row level security;
alter table public.requests enable row level security;
alter table public.offers enable row level security;
alter table public.offer_events enable row level security;
alter table public.price_predictions enable row level security;

-- Fungsi milik chatbot (versi asli, sebelum migrasi 002).
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
  update public.stocks set quantity_kg = quantity_kg - o.qty_kg, updated_at = now() where id = s.id;
  update public.offers set status = 'AGREED', agreed_price = o.current_price, agreed_at = now(), updated_at = now() where id = o.id;
  insert into public.offer_events (offer_id, actor, action, price) values (o.id, p_actor, 'accept', o.current_price);
  return jsonb_build_object('ok', true, 'offer_code', o.code, 'agreed_price', o.current_price,
                            'qty_kg', o.qty_kg, 'total_value', o.current_price * o.qty_kg,
                            'farmer_id', o.farmer_id, 'request_id', o.request_id);
end;
$function$;
