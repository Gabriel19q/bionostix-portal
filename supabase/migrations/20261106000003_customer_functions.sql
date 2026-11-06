-- Replace the owner-run customer views with SECURITY DEFINER functions.
-- Same data, same filters, but the intent is explicit and Supabase's linter is satisfied.
-- Called from the app with supabase.rpc('get_catalog'), etc.

drop view public.my_company, public.customer_catalog, public.my_requests,
  public.my_request_items, public.my_request_history, public.my_documents;

create function public.get_my_company()
returns table (
  id uuid, name text, country text, address text, customer_type public.customer_type,
  contact_name text, contact_email text, contact_phone text, status public.company_status,
  license_expires_on date, can_request boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.country, c.address, c.customer_type, c.contact_name,
         c.contact_email, c.contact_phone, c.status, c.license_expires_on,
         public.my_company_active()
  from public.companies c
  where c.id = public.my_company_id();
$$;

create function public.get_catalog()
returns table (
  offer_id uuid, product_id uuid, trade_name text, active_ingredient text, strength text,
  dosage_form text, pack_size text, pzn text, manufacturer text,
  is_rx boolean, is_cold_chain boolean, is_narcotic boolean,
  batch text, expiry_date date, available_qty integer, moq integer, incoterm text,
  stock_as_of date, unit_price numeric
)
language sql stable security definer set search_path = public as $$
  select o.id, p.id, p.trade_name, p.active_ingredient, p.strength,
         p.dosage_form, p.pack_size, p.pzn, m.name,
         p.is_rx, p.is_cold_chain, p.is_narcotic,
         o.batch, o.expiry_date, o.available_qty, o.moq, o.incoterm, o.stock_as_of,
         public.sell_price(o.purchase_price, o.markup_override_pct, g.default_markup_pct)
  from public.offers o
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  join public.companies c on c.id = public.my_company_id()
  join public.customer_groups g on g.id = c.customer_group_id
  where public.my_company_active()
    and o.is_active and o.available_qty > 0 and o.expiry_date > current_date;
$$;

create function public.get_my_requests()
returns table (
  id uuid, number text, status public.request_status, seller public.seller,
  customer_comment text, delivery_country text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.number, r.status, r.seller, r.customer_comment, r.delivery_country,
         r.created_at, r.updated_at
  from public.requests r
  where r.company_id = public.my_company_id();
$$;

create function public.get_my_request_items()
returns table (
  id uuid, request_id uuid, offer_id uuid, trade_name text, strength text, pack_size text,
  manufacturer text, batch text, expiry_date date, requested_qty integer,
  unit_price_snapshot numeric, confirmed_qty integer, confirmed_unit_price numeric
)
language sql stable security definer set search_path = public as $$
  select i.id, i.request_id, i.offer_id, p.trade_name, p.strength, p.pack_size, m.name,
         o.batch, o.expiry_date, i.requested_qty, i.unit_price_snapshot,
         i.confirmed_qty, i.confirmed_unit_price
  from public.request_items i
  join public.requests r on r.id = i.request_id
  join public.offers o on o.id = i.offer_id
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where r.company_id = public.my_company_id();
$$;

create function public.get_my_request_history()
returns table (
  id bigint, request_id uuid, old_status public.request_status, new_status public.request_status,
  note text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select h.id, h.request_id, h.old_status, h.new_status, h.note, h.created_at
  from public.request_status_history h
  join public.requests r on r.id = h.request_id
  where r.company_id = public.my_company_id();
$$;

create function public.get_my_documents()
returns table (
  id uuid, storage_path text, file_name text, doc_type public.document_type,
  company_id uuid, offer_id uuid, request_id uuid, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select d.id, d.storage_path, d.file_name, d.doc_type, d.company_id, d.offer_id, d.request_id, d.created_at
  from public.documents d
  where d.company_id = public.my_company_id()
     or d.request_id in (select id from public.requests where company_id = public.my_company_id())
     or (d.offer_id is not null and public.my_company_active());
$$;

revoke execute on function public.get_my_company, public.get_catalog, public.get_my_requests,
  public.get_my_request_items, public.get_my_request_history, public.get_my_documents from public, anon;
grant execute on function public.get_my_company, public.get_catalog, public.get_my_requests,
  public.get_my_request_items, public.get_my_request_history, public.get_my_documents to authenticated;

-- Trigger functions are never called directly
revoke execute on function public.handle_new_user, public.log_request_status from public, anon, authenticated;

-- Helpers used inside RLS policies: signed-in users need them, anonymous visitors do not
revoke execute on function public.is_admin, public.my_company_id, public.my_company_active from public, anon;
grant execute on function public.is_admin, public.my_company_id, public.my_company_active to authenticated;
