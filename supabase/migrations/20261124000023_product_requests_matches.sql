-- Marketplace stage 2a: structured product requests (buyers' wanted lists), admin import for a buyer
-- (drafts the buyer confirms), the buyer view of offers (anonymous sellers, country rules, country price)
-- and matches between product requests and offers (exact / similar).

-- Product requests get the same structured fields as offers ---------------------------
alter table public.sourcing_requests
  add column category public.product_category,
  add column active_ingredients text,
  add column dosage_form text,
  add column test_parameter text,
  add column method text,
  add column product_type text,
  add column size_variant text,
  add column units_per_pack integer check (units_per_pack > 0),
  add column unit text,
  add column quantity_packs integer check (quantity_packs > 0),
  add column target_price_eur numeric(12,2) check (target_price_eur > 0);
alter table public.sourcing_requests drop constraint sourcing_requests_status_check;
alter table public.sourcing_requests add constraint sourcing_requests_status_check
  check (status in ('draft', 'open', 'in_progress', 'offered', 'closed'));

-- Approved buyer: the caller's company may buy
create or replace function public.my_buyer_company() returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from companies c join profiles p on p.company_id = c.id
  where p.id = auth.uid() and c.status = 'approved' and c.wants_buy and c.buy_status = 'approved';
$$;

-- Saves product requests for a buyer. Shared by buyers (status open) and admins (status draft).
create or replace function public.save_product_requests_for(v_company uuid, p jsonb, p_status text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_cat product_category;
  v_id uuid;
  v_line integer := 0;
  v_needed date;
begin
  if v_company is null then raise exception 'not an approved buyer'; end if;
  if p_status not in ('open', 'draft') then raise exception 'invalid status'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'no product requests'; end if;
  if jsonb_array_length(p) > 2000 then raise exception 'at most 2000 product requests at once'; end if;

  for v_row in select * from jsonb_array_elements(p) loop
    v_line := v_line + 1;
    begin
      v_cat := (v_row ->> 'category')::product_category;
    exception when others then
      raise exception 'line %: unknown category', v_line;
    end;
    if coalesce(trim(v_row ->> 'product_name'), '') = '' then raise exception 'line %: product name missing', v_line; end if;
    if coalesce(trim(v_row ->> 'delivery_country'), '') = '' then raise exception 'line %: delivery country missing', v_line; end if;
    if coalesce((v_row ->> 'quantity')::integer, 0) <= 0 then raise exception 'line %: quantity missing', v_line; end if;
    if v_cat in ('pharma', 'supplements') and coalesce(trim(v_row ->> 'active_ingredients'), '') = '' then
      raise exception 'line %: active ingredients missing', v_line;
    end if;
    if v_cat = 'ivd' and coalesce(trim(v_row ->> 'test_parameter'), '') = '' then
      raise exception 'line %: test missing', v_line;
    end if;
    if v_cat = 'health' and coalesce(trim(v_row ->> 'product_type'), '') = '' then
      raise exception 'line %: product type missing', v_line;
    end if;
    v_needed := nullif(v_row ->> 'needed_by', '')::date;
    if v_needed is not null and v_needed <= current_date then raise exception 'line %: date must be in the future', v_line; end if;

    v_id := nullif(v_row ->> 'id', '')::uuid;
    if v_id is not null and not exists (select 1 from sourcing_requests where id = v_id and company_id = v_company) then
      raise exception 'line %: product request not found', v_line;
    end if;

    if v_id is null then
      insert into sourcing_requests (company_id, created_by, product, details, quantity, target_price, needed_by,
        delivery_country, status, category, active_ingredients, dosage_form, test_parameter, method, product_type,
        size_variant, units_per_pack, unit, quantity_packs, target_price_eur)
      values (v_company, auth.uid(), left(trim(v_row ->> 'product_name'), 300), left(nullif(trim(v_row ->> 'note'), ''), 2000),
        (v_row ->> 'quantity') || ' packs', nullif(v_row ->> 'target_price', ''), v_needed,
        left(trim(v_row ->> 'delivery_country'), 100), p_status, v_cat,
        left(nullif(trim(v_row ->> 'active_ingredients'), ''), 500), left(nullif(trim(v_row ->> 'dosage_form'), ''), 100),
        left(nullif(trim(v_row ->> 'test_parameter'), ''), 100), left(nullif(trim(v_row ->> 'method'), ''), 100),
        left(nullif(trim(v_row ->> 'product_type'), ''), 100), left(nullif(trim(v_row ->> 'size_variant'), ''), 100),
        nullif(v_row ->> 'units_per_pack', '')::integer, left(nullif(trim(v_row ->> 'unit'), ''), 50),
        (v_row ->> 'quantity')::integer, nullif(v_row ->> 'target_price', '')::numeric);
    else
      update sourcing_requests set
        product = left(trim(v_row ->> 'product_name'), 300), details = left(nullif(trim(v_row ->> 'note'), ''), 2000),
        quantity = (v_row ->> 'quantity') || ' packs', target_price = nullif(v_row ->> 'target_price', ''),
        needed_by = v_needed, delivery_country = left(trim(v_row ->> 'delivery_country'), 100),
        status = case when status = 'draft' then p_status else status end, category = v_cat,
        active_ingredients = left(nullif(trim(v_row ->> 'active_ingredients'), ''), 500),
        dosage_form = left(nullif(trim(v_row ->> 'dosage_form'), ''), 100),
        test_parameter = left(nullif(trim(v_row ->> 'test_parameter'), ''), 100),
        method = left(nullif(trim(v_row ->> 'method'), ''), 100),
        product_type = left(nullif(trim(v_row ->> 'product_type'), ''), 100),
        size_variant = left(nullif(trim(v_row ->> 'size_variant'), ''), 100),
        units_per_pack = nullif(v_row ->> 'units_per_pack', '')::integer, unit = left(nullif(trim(v_row ->> 'unit'), ''), 50),
        quantity_packs = (v_row ->> 'quantity')::integer, target_price_eur = nullif(v_row ->> 'target_price', '')::numeric
      where id = v_id and company_id = v_company;
    end if;
  end loop;
  return v_line;
end $$;
revoke execute on function public.save_product_requests_for(uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.save_product_requests(p jsonb) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from sourcing_requests where company_id = my_buyer_company()
      and created_at > now() - interval '1 day') > 5000 then
    raise exception 'too many product requests today';
  end if;
  return save_product_requests_for(my_buyer_company(), p, 'open');
end $$;

create or replace function public.admin_prepare_product_requests(p_company uuid, p jsonb) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not exists (select 1 from companies where id = p_company and status = 'approved'
                 and wants_buy and buy_status = 'approved') then
    raise exception 'not an approved buyer';
  end if;
  return save_product_requests_for(p_company, p, 'draft');
end $$;

-- Buyer closes own product requests (no longer needed)
create or replace function public.close_product_requests(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if my_buyer_company() is null then raise exception 'not an approved buyer'; end if;
  update sourcing_requests set status = 'closed' where id = any(p_ids) and company_id = my_buyer_company();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Buyer's own product requests incl. drafts prepared by Bionostix (no internal note)
create or replace function public.get_my_product_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'number', s.number, 'product_name', s.product, 'note', s.details, 'needed_by', s.needed_by,
    'delivery_country', s.delivery_country, 'status', s.status, 'reply', s.reply, 'category', s.category,
    'active_ingredients', s.active_ingredients, 'dosage_form', s.dosage_form, 'test_parameter', s.test_parameter,
    'method', s.method, 'product_type', s.product_type, 'size_variant', s.size_variant,
    'units_per_pack', s.units_per_pack, 'unit', s.unit, 'quantity', s.quantity_packs,
    'quantity_text', s.quantity, 'target_price', s.target_price_eur, 'target_price_text', s.target_price,
    'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
  from sourcing_requests s
  where s.company_id = my_company_id();
$$;

-- Matching helpers -------------------------------------------------------------------
-- "Vitamin C 1000 mg; Zinc 10 mg" -> {vitamin c, zinc}
create or replace function public.ingredient_names(p text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(n order by n), '{}') from (
    select distinct lower(trim(regexp_replace(part, '\s+(\d+([.,]\d+)?|\?)\s*\S.*$', ''))) n
    from unnest(string_to_array(coalesce(p, ''), ';')) part
    where trim(part) <> '') x;
$$;
-- full key incl. amounts: "vitamin c 1000 mg;zinc 10 mg"
create or replace function public.ingredient_key(p text) returns text
language sql immutable set search_path = public as $$
  select coalesce(string_agg(n, ';' order by n), '') from (
    select lower(regexp_replace(regexp_replace(trim(part), '\s+', ' ', 'g'), ',', '.', 'g')) n
    from unnest(string_to_array(coalesce(p, ''), ';')) part
    where trim(part) <> '') x;
$$;

-- May this buyer company see the offer? Active, valid, category approved for buying, buyer country allowed.
create or replace function public.listing_visible_to(l public.listings, p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select l.status = 'active' and l.valid_until >= current_date and l.quantity > 0
    and l.seller_company_id <> p_company
    and exists (select 1 from company_categories k where k.company_id = p_company and k.role = 'buy'
                and k.category = l.category and k.status = 'approved')
    and (select case l.buyers_mode
           when 'all' then true
           when 'only' then c.country = any(l.buyers_countries)
           else not (c.country = any(l.buyers_countries)) end
         from companies c where c.id = p_company);
$$;
revoke execute on function public.listing_visible_to(public.listings, uuid) from public, anon, authenticated;

-- The offer as a buyer sees it: seller anonymous, price for the buyer's country, no country lists
create or replace function public.listing_for_buyer(l public.listings, p_company uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'category', l.category, 'product_name', l.product_name, 'name_on_pack', l.name_on_pack,
    'brand', l.brand, 'active_ingredients', l.active_ingredients, 'dosage_form', coalesce(l.dosage_form_other, l.dosage_form),
    'test_parameter', coalesce(l.test_parameter_other, l.test_parameter), 'method', coalesce(l.method_other, l.method),
    'ce_marking', l.ce_marking, 'ivdr_class', l.ivdr_class, 'sample_type', l.sample_type,
    'product_type', coalesce(l.product_type_other, l.product_type), 'size_variant', coalesce(l.size_variant_other, l.size_variant),
    'material', l.material, 'units_per_pack', l.units_per_pack, 'unit', l.unit, 'national_code', l.national_code,
    'ean', l.ean, 'packaging_language', l.packaging_language, 'quantity', l.quantity, 'moq', l.moq,
    'price', coalesce((select cp.price from listing_country_prices cp join companies c on c.id = p_company
                       where cp.listing_id = l.id and cp.country = c.country), l.price),
    'expiry_date', l.expiry_date, 'min_shelf_life_months', l.min_shelf_life_months, 'incoterm', l.incoterm,
    'incoterm_place', l.incoterm_place, 'lead_time_days', l.lead_time_days, 'valid_until', l.valid_until,
    'registered_in', l.registered_in, 'documents_available', l.documents_available,
    'seller_code', s.seller_code, 'seller_country', s.country, 'updated_at', l.updated_at)
  from companies s where s.id = l.seller_company_id;
$$;
revoke execute on function public.listing_for_buyer(public.listings, uuid) from public, anon, authenticated;

-- Product offering for buyers
create or replace function public.get_market_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(listing_for_buyer(l, my_buyer_company()) order by l.updated_at desc), '[]'::jsonb)
  from listings l
  where my_buyer_company() is not null and listing_visible_to(l, my_buyer_company());
$$;

-- Matches for the buyer's open product requests: exact and similar offers
create or replace function public.get_my_request_matches() returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select my_buyer_company() as company),
  req as (select s.* from sourcing_requests s, b where s.company_id = b.company and s.status in ('open', 'in_progress', 'offered')),
  vis as (select l.* from listings l, b where b.company is not null and listing_visible_to(l, b.company)),
  m as (
    select r.id as request_id, v.id as listing_id,
      case
        when r.category in ('pharma', 'supplements') and ingredient_key(r.active_ingredients) = ingredient_key(v.active_ingredients)
             and (r.dosage_form is null or r.dosage_form = v.dosage_form)
             and (r.units_per_pack is null or r.units_per_pack = v.units_per_pack) then 'exact'
        when r.category = 'ivd' and lower(r.test_parameter) = lower(v.test_parameter)
             and (r.method is null or r.method = v.method)
             and (r.units_per_pack is null or r.units_per_pack = v.units_per_pack) then 'exact'
        when r.category = 'health' and lower(r.product_type) = lower(v.product_type)
             and (r.size_variant is null or r.size_variant = v.size_variant) then 'exact'
        else 'similar' end as kind
    from req r join vis v on v.category = r.category
    where (r.category in ('pharma', 'supplements') and cardinality(ingredient_names(r.active_ingredients)) > 0
           and ingredient_names(r.active_ingredients) = ingredient_names(v.active_ingredients))
       or (r.category = 'ivd' and lower(r.test_parameter) = lower(v.test_parameter))
       or (r.category = 'health' and lower(r.product_type) = lower(v.product_type))
  )
  select coalesce(jsonb_agg(jsonb_build_object('request_id', m.request_id, 'kind', m.kind,
    'offer', listing_for_buyer(l, (select company from b))) order by m.kind, l.updated_at desc), '[]'::jsonb)
  from m join listings l on l.id = m.listing_id;
$$;

revoke execute on function public.my_buyer_company(), public.save_product_requests(jsonb),
  public.admin_prepare_product_requests(uuid, jsonb), public.close_product_requests(uuid[]),
  public.get_my_product_requests(), public.get_market_catalog(), public.get_my_request_matches(),
  public.ingredient_names(text), public.ingredient_key(text) from public, anon;
grant execute on function public.my_buyer_company(), public.save_product_requests(jsonb),
  public.admin_prepare_product_requests(uuid, jsonb), public.close_product_requests(uuid[]),
  public.get_my_product_requests(), public.get_market_catalog(), public.get_my_request_matches(),
  public.ingredient_names(text), public.ingredient_key(text) to authenticated;
