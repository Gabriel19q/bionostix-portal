-- Positioning (18 Nov 2026): surplus and short-dated EU stock, stock for markets without a distributor,
-- and sourcing on demand. Three additions:
--  1. Market restriction per offer: sell to all countries, only to listed countries, or to all except listed
--     ones. Buyers in excluded countries do not see the offer; orders to an excluded delivery country are
--     refused. This protects the manufacturer's existing distributors.
--  2. Offer validity ("valid until"): expired offers disappear and cannot be ordered.
--  3. Sourcing requests: customers tell us which products they look for (single product or a pasted list/tender).

-- 1 + 2 -------------------------------------------------------------------------------------------------
alter table public.offers
  add column market_mode text not null default 'all' check (market_mode in ('all', 'only', 'except')),
  add column market_countries text[] not null default '{}',
  add column valid_until date;

-- Company countries were typed in by applicants; map common spellings to the English short names
-- used for offers and delivery countries (same aliases as src/lib/countries.ts).
create or replace function public.norm_country(p text)
returns text language sql immutable set search_path = public as $$
  select case lower(trim(coalesce(p, '')))
    when 'deutschland' then 'germany' when 'de' then 'germany'
    when 'uk' then 'united kingdom' when 'great britain' then 'united kingdom'
    when 'usa' then 'united states' when 'us' then 'united states'
    when 'uae' then 'united arab emirates' when 'turkey' then 'türkiye'
    when 'irak' then 'iraq' when 'libanon' then 'lebanon'
    when 'czech republic' then 'czechia' when 'holland' then 'netherlands'
    else lower(trim(coalesce(p, ''))) end;
$$;

-- May this offer be sold into country p_country?
create or replace function public.offer_allowed_in(p_mode text, p_countries text[], p_country text)
returns boolean language sql immutable set search_path = public as $$
  select case p_mode
    when 'only' then exists (select 1 from unnest(p_countries) c where norm_country(c) = norm_country(p_country))
    when 'except' then not exists (select 1 from unnest(p_countries) c where norm_country(c) = norm_country(p_country))
    else true end;
$$;

revoke execute on function public.norm_country(text), public.offer_allowed_in(text, text[], text) from public, anon;
grant execute on function public.norm_country(text), public.offer_allowed_in(text, text[], text) to authenticated;

-- Catalog: hide offers that are expired, no longer valid or not allowed in the buyer's country.
-- New column valid_until; the market list itself stays internal.
drop function public.get_catalog();
create function public.get_catalog()
returns table (
  offer_id uuid, product_id uuid, trade_name text, active_ingredient text, strength text,
  dosage_form text, pack_size text, pzn text, manufacturer text,
  is_rx boolean, is_cold_chain boolean, is_narcotic boolean,
  batch text, expiry_date date, available_qty integer, moq integer, incoterm text,
  stock_as_of date, unit_price numeric, coa_available boolean, seller public.seller, valid_until date
)
language sql stable security definer set search_path = public as $$
  select o.id, p.id, p.trade_name, p.active_ingredient, p.strength,
         p.dosage_form, p.pack_size, p.pzn, m.name,
         p.is_rx, p.is_cold_chain, p.is_narcotic,
         o.batch, o.expiry_date, o.available_qty, o.moq, o.incoterm, o.stock_as_of,
         case when o.purchase_price is null then null
              else public.sell_price(o.purchase_price, o.markup_override_pct, g.default_markup_pct) end,
         o.coa_available, p.seller, o.valid_until
  from public.offers o
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  join public.companies c on c.id = public.my_company_id()
  join public.customer_groups g on g.id = c.customer_group_id
  where public.my_company_active()
    and o.is_active
    and (o.available_qty is null or o.available_qty > 0)
    and (o.expiry_date is null or o.expiry_date > current_date)
    and (o.valid_until is null or o.valid_until >= current_date)
    and public.offer_allowed_in(o.market_mode, o.market_countries, c.country);
$$;

-- Submit: same as before, plus validity and market checks (buyer's country and delivery country).
drop function public.submit_request(jsonb, text, text, date);
create function public.submit_request(
  p_items jsonb, p_comment text, p_delivery_country text, p_delivery_deadline date
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
  v_company_country text;
  v_group_pct numeric;
  v_item jsonb;
  v_offer record;
  v_qty integer;
  v_min_expiry date;
  v_seen uuid[] := '{}';
  v_seller public.seller;
  v_request uuid;
  v_requests uuid[] := '{}';
  v_item_id uuid;
begin
  if not my_company_active() then
    raise exception 'company not approved or licence expired';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'too many items';
  end if;
  if coalesce(trim(p_delivery_country), '') = '' then
    raise exception 'delivery country is required';
  end if;
  if p_delivery_deadline is null or p_delivery_deadline <= current_date then
    raise exception 'delivery deadline must be in the future';
  end if;

  select g.default_markup_pct, c.country into v_group_pct, v_company_country
  from companies c join customer_groups g on g.id = c.customer_group_id
  where c.id = v_company;

  create temp table if not exists pg_temp.submit_lines (
    offer_id uuid, qty integer, min_expiry date, seller public.seller, unit_price numeric, purchase numeric
  ) on commit drop;
  delete from pg_temp.submit_lines;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    v_min_expiry := nullif(v_item ->> 'min_expiry', '')::date;
    select o.*, p.seller as product_seller, p.trade_name into v_offer
    from offers o join products p on p.id = o.product_id
    where o.id = (v_item ->> 'offer_id')::uuid
      and o.is_active
      and (o.available_qty is null or o.available_qty > 0)
      and (o.expiry_date is null or o.expiry_date > current_date)
      and (o.valid_until is null or o.valid_until >= current_date)
      and offer_allowed_in(o.market_mode, o.market_countries, v_company_country);
    if not found then raise exception 'offer not available'; end if;
    if not offer_allowed_in(v_offer.market_mode, v_offer.market_countries, p_delivery_country) then
      raise exception 'Delivery to % is not possible for %', trim(p_delivery_country), v_offer.trade_name;
    end if;
    if v_offer.id = any(v_seen) then raise exception 'same batch listed twice'; end if;
    v_seen := v_seen || v_offer.id;
    if v_qty is null or v_qty < v_offer.moq then
      raise exception 'quantity below minimum order quantity';
    end if;
    if v_offer.available_qty is not null and v_qty > v_offer.available_qty then
      raise exception 'quantity above available stock';
    end if;
    if v_offer.expiry_date is not null then
      v_min_expiry := null;
    elsif v_min_expiry is not null and v_min_expiry <= current_date then
      raise exception 'minimum expiry must be in the future';
    end if;

    insert into pg_temp.submit_lines values (
      v_offer.id, v_qty, v_min_expiry, v_offer.product_seller,
      case when v_offer.purchase_price is null then null
           else sell_price(v_offer.purchase_price, v_offer.markup_override_pct, v_group_pct) end,
      v_offer.purchase_price);
  end loop;

  for v_seller in select distinct l.seller from pg_temp.submit_lines l order by 1 loop
    insert into requests (company_id, created_by, customer_comment, delivery_country, delivery_deadline, seller)
    values (v_company, auth.uid(), nullif(trim(p_comment), ''), trim(p_delivery_country), p_delivery_deadline, v_seller)
    returning id into v_request;
    v_requests := v_requests || v_request;

    for v_offer in select * from pg_temp.submit_lines l where l.seller = v_seller loop
      insert into request_items (request_id, offer_id, requested_qty, unit_price_snapshot, min_expiry_date)
      values (v_request, v_offer.offer_id, v_offer.qty, v_offer.unit_price, v_offer.min_expiry)
      returning id into v_item_id;
      insert into request_item_costs (request_item_id, purchase_price_snapshot)
      values (v_item_id, v_offer.purchase);
    end loop;
  end loop;

  return v_requests;
end $$;

revoke execute on function public.get_catalog(), public.submit_request(jsonb, text, text, date) from public, anon;
grant execute on function public.get_catalog(), public.submit_request(jsonb, text, text, date) to authenticated;

-- 3 Sourcing requests -----------------------------------------------------------------------------------
create sequence public.sourcing_number_seq;

create table public.sourcing_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique
    default ('SRC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.sourcing_number_seq')::text, 4, '0')),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  product text not null,                 -- what the customer looks for
  details text,                          -- strength, pack, or a pasted list / tender
  quantity text,                         -- free text, e.g. "5,000 packs per month"
  target_price text,                     -- free text, e.g. "max. EUR 3 per pack"
  needed_by date,
  delivery_country text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'offered', 'closed')),
  reply text,                            -- message to the customer
  internal_note text,                    -- admins only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sourcing_requests (company_id, created_at desc);
create index on public.sourcing_requests (status, created_at desc);

create trigger touch_sourcing_requests before update on public.sourcing_requests
  for each row execute function public.touch_updated_at();

alter table public.sourcing_requests enable row level security;
create policy admin_all on public.sourcing_requests for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.sourcing_requests from anon;

-- Customer: send a sourcing request
create function public.submit_sourcing_request(
  p_product text, p_details text, p_quantity text, p_target_price text, p_needed_by date, p_delivery_country text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
  v_id uuid;
begin
  if not my_company_active() then
    raise exception 'company not approved or licence expired';
  end if;
  if coalesce(trim(p_product), '') = '' then raise exception 'product is required'; end if;
  if coalesce(trim(p_delivery_country), '') = '' then raise exception 'delivery country is required'; end if;
  if length(p_product) > 300 or length(coalesce(p_details, '')) > 20000
     or length(coalesce(p_quantity, '')) > 200 or length(coalesce(p_target_price, '')) > 200 then
    raise exception 'text too long';
  end if;
  if p_needed_by is not null and p_needed_by <= current_date then
    raise exception 'date must be in the future';
  end if;
  if (select count(*) from sourcing_requests
      where company_id = v_company and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many sourcing requests today';
  end if;

  insert into sourcing_requests (company_id, created_by, product, details, quantity, target_price, needed_by, delivery_country)
  values (v_company, auth.uid(), trim(p_product), nullif(trim(p_details), ''), nullif(trim(p_quantity), ''),
          nullif(trim(p_target_price), ''), p_needed_by, trim(p_delivery_country))
  returning id into v_id;
  return v_id;
end $$;

-- Customer: own sourcing requests, without the internal note
create function public.get_my_sourcing_requests()
returns table (
  id uuid, number text, product text, details text, quantity text, target_price text, needed_by date,
  delivery_country text, status text, reply text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.number, s.product, s.details, s.quantity, s.target_price, s.needed_by,
         s.delivery_country, s.status, s.reply, s.created_at, s.updated_at
  from public.sourcing_requests s
  where s.company_id = public.my_company_id()
  order by s.created_at desc;
$$;

revoke execute on function public.submit_sourcing_request(text, text, text, text, date, text),
  public.get_my_sourcing_requests() from public, anon;
grant execute on function public.submit_sourcing_request(text, text, text, text, date, text),
  public.get_my_sourcing_requests() to authenticated;

-- Usage tracking: two new events
create or replace function public.log_activity(p_event text, p_path text default null, p_meta jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return; end if;
  if p_event not in ('login', 'view_catalog', 'view_requests', 'view_request', 'export', 'submit_request', 'respond',
                     'view_sourcing', 'submit_sourcing') then
    raise exception 'unknown event';
  end if;
  if p_meta is not null and length(p_meta::text) > 2000 then p_meta := null; end if;
  insert into activity_log (user_id, company_id, event, path, meta)
  values (auth.uid(), my_company_id(), p_event, left(p_path, 200), p_meta);
end $$;
