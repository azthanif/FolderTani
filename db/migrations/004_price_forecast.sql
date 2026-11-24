-- 004: prakiraan harga GKP harian (pipeline forecast_pipeline, dijalankan GitHub Actions).
-- Aman dijalankan ulang (if not exists). Tidak mengubah tabel price_predictions milik chatbot.
-- Semua harga adalah GKP tingkat petani (satu-satunya jenis gabah), jadi tidak ada kolom grain_type.

-- Fitur GEE harian mentah per kabupaten (rata-rata wilayah kabupaten).
create table if not exists public.gee_features_daily (
  kabupaten text not null check (kabupaten = any (array['Garut','Cianjur'])),
  date date not null,
  chirps_precip_mm double precision,
  era5_evap_mm double precision,
  soil_moisture_l1 double precision,
  t2m_mean_c double precision,
  t2m_max_c double precision,
  rh_pct double precision,
  modis_lst_day_c double precision,
  modis_ndvi double precision,
  modis_evi double precision,
  s1_vv_db double precision,
  s1_vh_db double precision,
  source text not null default 'gee_pipeline' check (source in ('csv_pelatihan', 'gee_pipeline')),
  fetched_at timestamptz not null default now(),
  primary key (kabupaten, date)
);

-- Harga GKP harian tingkat petani. 'asli' = observasi; 'simulasi' = isian simulasi deterministik
-- (sim_params.json) untuk hari tanpa observasi. Observasi asli selalu menimpa simulasi, tidak sebaliknya.
create table if not exists public.price_observations (
  kabupaten text not null check (kabupaten = any (array['Garut','Cianjur'])),
  date date not null,
  price_per_kg integer not null check (price_per_kg > 0),
  source text not null check (source in ('asli', 'simulasi')),
  source_detail text,
  updated_at timestamptz not null default now(),
  primary key (kabupaten, date)
);

-- Prakiraan per tanggal asal (run_date): horizon 0 = harga hari asal (input model), 1..7 = prakiraan LSTM.
create table if not exists public.price_forecasts (
  id bigint generated always as identity primary key,
  kabupaten text not null check (kabupaten = any (array['Garut','Cianjur'])),
  run_date date not null,
  target_date date not null,
  horizon smallint not null check (horizon between 0 and 7),
  price_per_kg integer not null check (price_per_kg > 0),
  model_version text not null,
  is_simulation boolean not null,
  price_source text not null check (price_source in ('asli', 'simulasi', 'ffill')),
  gee_filled boolean not null default false,
  backtest_mape_pct numeric(6,3),           -- MAPE backtest model (rolling window), untuk ditampilkan di web
  created_at timestamptz not null default now(),
  constraint price_forecasts_target check (target_date = run_date + horizon),
  unique (kabupaten, run_date, horizon)
);
create index if not exists price_forecasts_latest on public.price_forecasts (kabupaten, run_date desc);

alter table public.gee_features_daily enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_forecasts enable row level security;
