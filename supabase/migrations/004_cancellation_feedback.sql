-- V4: Cancellation feedback capture + subscription update policy

begin;

-- Allow users to update their own subscription rows (needed for in-app cancellation updates)
drop policy if exists subscriptions_update_own on public.subscriptions;
create policy subscriptions_update_own
on public.subscriptions for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Store cancellation feedback submitted before canceling
create table if not exists public.cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text,
  reason text not null,
  details text,
  cancel_result text not null default 'requested',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cancellation_feedback_user_id_idx on public.cancellation_feedback(user_id);
create index if not exists cancellation_feedback_created_at_idx on public.cancellation_feedback(created_at desc);

alter table public.cancellation_feedback enable row level security;
alter table public.cancellation_feedback force row level security;

drop policy if exists cancellation_feedback_select_own on public.cancellation_feedback;
create policy cancellation_feedback_select_own
on public.cancellation_feedback for select
using (user_id = auth.uid());

drop policy if exists cancellation_feedback_insert_own on public.cancellation_feedback;
create policy cancellation_feedback_insert_own
on public.cancellation_feedback for insert
with check (user_id = auth.uid());

drop policy if exists cancellation_feedback_update_own on public.cancellation_feedback;
create policy cancellation_feedback_update_own
on public.cancellation_feedback for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
