-- V5: scan job queue for background workers

begin;

create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  attempts integer not null default 0,
  worker_id text,
  last_heartbeat timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scan_jobs_status_idx on public.scan_jobs(status);
create index if not exists scan_jobs_scan_id_idx on public.scan_jobs(scan_id);
create index if not exists scan_jobs_company_id_idx on public.scan_jobs(company_id);

-- RLS disabled for jobs; all access via service role.
alter table public.scan_jobs disable row level security;

commit;
