-- Content Intelligence Micro-App — Initial Schema
-- V1: single-user, no auth
-- Designed so V2 can add Supabase Auth by adding user_id FK columns

create extension if not exists "pgcrypto";

-- ============================================================
-- companies
-- ============================================================
create table if not exists companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  domain         text,
  include_keywords text[],
  exclude_keywords text[],
  source_config  jsonb not null default '{
    "web": true,
    "youtube": true,
    "reddit": true,
    "social": false,
    "max_items": 200,
    "max_iterations": 12
  }'::jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- scans
-- ============================================================
create type scan_status as enum ('queued', 'running', 'completed', 'failed');

create table if not exists scans (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  status       scan_status not null default 'queued',
  started_at   timestamptz,
  completed_at timestamptz,
  stats        jsonb,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists scans_company_id_idx on scans(company_id);

-- ============================================================
-- content_items
-- ============================================================
create type content_source as enum ('web', 'youtube', 'reddit', 'social');
create type content_type_enum as enum (
  'landing', 'product', 'blog', 'pdf', 'press', 'review', 'video', 'social', 'other'
);
create type content_category as enum (
  'sales_asset', 'product_marketing', 'pr', 'review', 'other'
);

create table if not exists content_items (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references companies(id) on delete cascade,
  scan_id                   uuid not null references scans(id) on delete cascade,
  url                       text not null,
  url_canonical             text not null,
  url_hash                  text not null,
  title                     text,
  snippet                   text,
  source                    content_source not null,
  platform                  text,
  content_type              content_type_enum not null default 'other',
  category                  content_category not null default 'other',
  location                  text,
  published_at              timestamptz,
  metrics                   jsonb,
  classification_confidence float,
  raw_result                jsonb,
  created_at                timestamptz not null default now(),

  -- Unique per company (prevent cross-scan duplicates)
  unique (company_id, url_hash)
);

create index if not exists content_items_company_id_idx on content_items(company_id);
create index if not exists content_items_scan_id_idx on content_items(scan_id);
create index if not exists content_items_content_type_idx on content_items(content_type);

-- ============================================================
-- insights
-- ============================================================
create table if not exists insights (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  scan_id       uuid not null references scans(id) on delete cascade,
  summary_md    text not null,
  insights_json jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists insights_company_id_idx on insights(company_id);
create index if not exists insights_scan_id_idx on insights(scan_id);

-- ============================================================
-- RLS (disabled in V1 — enable per-user in V2)
-- ============================================================
alter table companies disable row level security;
alter table scans disable row level security;
alter table content_items disable row level security;
alter table insights disable row level security;
