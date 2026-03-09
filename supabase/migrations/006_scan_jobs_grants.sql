-- Grant API roles permission to read/write scan_jobs (RLS is disabled, so privileges are required)

begin;

grant select, insert, update on table public.scan_jobs to authenticated;
grant select, insert, update on table public.scan_jobs to anon;

commit;
