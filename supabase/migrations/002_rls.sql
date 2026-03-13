-- V2: Per-user data isolation with Supabase Auth + RLS

begin;

-- ============================================================
-- Ownership
-- ============================================================
alter table public.companies
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists companies_user_id_idx on public.companies(user_id);

-- Set owner automatically from JWT for new rows
alter table public.companies
  alter column user_id set default auth.uid();

-- ============================================================
-- Enable + force RLS
-- ============================================================
alter table public.companies enable row level security;
alter table public.scans enable row level security;
alter table public.content_items enable row level security;
alter table public.insights enable row level security;

alter table public.companies force row level security;
alter table public.scans force row level security;
alter table public.content_items force row level security;
alter table public.insights force row level security;

-- ============================================================
-- companies policies (direct ownership)
-- ============================================================
drop policy if exists companies_select_own on public.companies;
create policy companies_select_own
on public.companies for select
using (user_id = auth.uid());

drop policy if exists companies_insert_own on public.companies;
create policy companies_insert_own
on public.companies for insert
with check (user_id = auth.uid());

drop policy if exists companies_update_own on public.companies;
create policy companies_update_own
on public.companies for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists companies_delete_own on public.companies;
create policy companies_delete_own
on public.companies for delete
using (user_id = auth.uid());

-- ============================================================
-- scans policies (ownership through companies)
-- ============================================================
drop policy if exists scans_all_own on public.scans;
create policy scans_all_own
on public.scans for all
using (
  exists (
    select 1
    from public.companies c
    where c.id = scans.company_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = scans.company_id
      and c.user_id = auth.uid()
  )
);

-- ============================================================
-- content_items policies (ownership through companies)
-- ============================================================
drop policy if exists content_items_all_own on public.content_items;
create policy content_items_all_own
on public.content_items for all
using (
  exists (
    select 1
    from public.companies c
    where c.id = content_items.company_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = content_items.company_id
      and c.user_id = auth.uid()
  )
);

-- ============================================================
-- insights policies (ownership through companies)
-- ============================================================
drop policy if exists insights_all_own on public.insights;
create policy insights_all_own
on public.insights for all
using (
  exists (
    select 1
    from public.companies c
    where c.id = insights.company_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = insights.company_id
      and c.user_id = auth.uid()
  )
);

commit;
