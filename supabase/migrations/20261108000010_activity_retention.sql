-- Usage data is kept for 12 months (stated in the privacy policy).
-- A daily job deletes older entries. pg_cron exists on Supabase; skipped where it is not available.

create or replace function public.purge_old_activity() returns void
language sql security definer set search_path = public as $$
  delete from public.activity_log where created_at < now() - interval '12 months';
$$;
revoke execute on function public.purge_old_activity from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-old-activity', '17 3 * * *', 'select public.purge_old_activity()');
  end if;
end $$;
