-- Usage tracking: who uses the portal, when and how often.
-- Only customer activity is recorded (admins are skipped). Only admins can read it.

create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  event text not null,
  path text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity_log (user_id, created_at desc);
create index on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;
create policy admin_read on public.activity_log for select using (public.is_admin());
revoke all on public.activity_log from anon;
revoke insert, update, delete on public.activity_log from authenticated;

create or replace function public.log_activity(p_event text, p_path text default null, p_meta jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return; end if;
  if p_event not in ('login', 'view_catalog', 'view_requests', 'view_request', 'export', 'submit_request', 'respond') then
    raise exception 'unknown event';
  end if;
  if p_meta is not null and length(p_meta::text) > 2000 then p_meta := null; end if;
  insert into activity_log (user_id, company_id, event, path, meta)
  values (auth.uid(), my_company_id(), p_event, left(p_path, 200), p_meta);
end $$;

revoke execute on function public.log_activity from public, anon;
grant execute on function public.log_activity to authenticated;

-- One row per customer user: last sign-in, last activity, visits and actions.
-- A "visit" starts when a user is active after more than 30 minutes without activity.
create or replace function public.admin_activity_overview()
returns table (
  user_id uuid, email text, full_name text, company_id uuid, company_name text,
  registered_at timestamptz, last_sign_in_at timestamptz, last_seen timestamptz,
  visits_7d bigint, visits_30d bigint, catalog_views_30d bigint, exports_30d bigint, requests_30d bigint
)
language sql stable security definer set search_path = public as $$
  with ev as (
    select a.user_id, a.event, a.created_at,
           case when lag(a.created_at) over (partition by a.user_id order by a.created_at) is null
                  or a.created_at - lag(a.created_at) over (partition by a.user_id order by a.created_at) > interval '30 minutes'
                then 1 else 0 end as new_visit
    from activity_log a
    where a.created_at > now() - interval '30 days'
  )
  select p.id, p.email, p.full_name, c.id, c.name, p.created_at, u.last_sign_in_at,
         (select max(created_at) from activity_log l where l.user_id = p.id),
         coalesce(sum(ev.new_visit) filter (where ev.created_at > now() - interval '7 days'), 0),
         coalesce(sum(ev.new_visit), 0),
         count(*) filter (where ev.event = 'view_catalog'),
         count(*) filter (where ev.event = 'export'),
         count(*) filter (where ev.event = 'submit_request')
  from profiles p
  join auth.users u on u.id = p.id
  left join companies c on c.id = p.company_id
  left join ev on ev.user_id = p.id
  where is_admin() and p.role = 'customer'
  group by p.id, p.email, p.full_name, c.id, c.name, p.created_at, u.last_sign_in_at
  order by 8 desc nulls last;
$$;

revoke execute on function public.admin_activity_overview from public, anon;
grant execute on function public.admin_activity_overview to authenticated;
