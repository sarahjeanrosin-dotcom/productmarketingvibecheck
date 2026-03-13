-- V2 migration: domain filtering + comparisons
-- Run in Supabase SQL editor after 001_initial.sql

-- ============================================================
-- Add allowed_domains / blocked_domains to companies
-- ============================================================
alter table companies
  add column if not exists allowed_domains text[],
  add column if not exists blocked_domains text[];

-- ============================================================
-- comparisons
-- ============================================================
create table if not exists comparisons (
  id               uuid primary key default gen_random_uuid(),
  company_a_id     uuid not null references companies(id) on delete cascade,
  company_b_id     uuid not null references companies(id) on delete cascade,
  scan_a_id        uuid not null references scans(id) on delete cascade,
  scan_b_id        uuid not null references scans(id) on delete cascade,
  summary_md       text not null,
  comparison_json  jsonb not null,
  created_at       timestamptz not null default now()
);

create index if not exists comparisons_company_a_idx on comparisons(company_a_id);
create index if not exists comparisons_company_b_idx on comparisons(company_b_id);

alter table comparisons disable row level security;
