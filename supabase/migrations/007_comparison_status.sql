-- Add status to comparisons for async background processing
alter table public.comparisons
  add column if not exists status text not null default 'completed';

-- Backfill existing rows (they were generated synchronously, so they're complete)
update public.comparisons set status = 'completed' where status = 'completed';
