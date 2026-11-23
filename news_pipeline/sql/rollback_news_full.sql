-- Rollback migrasi 20261123_news_ner_summary.sql (versi lengkap).
-- Tidak menyentuh tabel lama (users, stocks, requests, offers, dll.) selain 2 kolom news_* di users.
begin;

drop view if exists public.v_news_feed;
drop view if exists public.v_news_recipients;

drop table if exists public.news_summary_ratings;
drop table if exists public.news_reference_summaries;
drop table if exists public.news_deliveries;
drop table if exists public.news_digest_items;
drop table if exists public.news_digests;
drop table if exists public.news_summaries;
drop table if exists public.news_relevance;
drop table if exists public.news_entities;
drop table if exists public.news_articles;
drop table if exists public.regions;
drop table if exists public.pipeline_runs;

drop function if exists public.news_check_delivery();
drop function if exists public.news_set_updated_at();

alter table public.users drop column if exists news_subscribed;
alter table public.users drop column if exists news_unsubscribed_at;

commit;
