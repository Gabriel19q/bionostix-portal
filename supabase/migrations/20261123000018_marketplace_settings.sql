-- Marketplace, stage 1b: platform settings (standard commission rate). Admin-only.
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy admin_all on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.app_settings from anon;

-- Sellers see the rate that applies to them: their own rate, otherwise the standard rate.
create or replace function public.get_my_account() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'address', c.address, 'vat_id', c.vat_id,
      'contact_name', c.contact_name, 'contact_email', c.contact_email, 'contact_phone', c.contact_phone,
      'status', c.status, 'wants_buy', c.wants_buy, 'wants_sell', c.wants_sell,
      'buy_status', c.buy_status, 'sell_status', c.sell_status,
      'seller_code', case when c.wants_sell then c.seller_code end,
      'seller_description', case when c.wants_sell then c.seller_description end,
      'commission_pct', case when c.wants_sell and c.sell_status = 'approved' then coalesce(c.commission_pct,
        (select (value #>> '{}')::numeric from app_settings where key = 'standard_commission_pct')) end,
      'eudamed_srn', c.eudamed_srn),
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'country', s.country, 'address', s.address,
        'status', s.status, 'licence_valid_until', s.licence_valid_until) order by s.created_at)
      from company_sites s where s.company_id = c.id), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'role', k.role, 'category', k.category, 'status', k.status) order by k.role, k.category)
      from company_categories k where k.company_id = c.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'file_name', d.file_name, 'kind', d.kind, 'site_id', d.site_id,
        'category', d.category, 'created_at', d.created_at) order by d.created_at)
      from documents d where d.company_id = c.id), '[]'::jsonb),
    'newsletter', (select case when n.confirmed_at is not null then 'confirmed' else 'pending' end
      from consents n where n.user_id = auth.uid() and n.kind = 'newsletter' and n.withdrawn_at is null
      order by n.accepted_at desc limit 1)
  ) end
  from profiles p left join companies c on c.id = p.company_id
  where p.id = auth.uid();
$$;
