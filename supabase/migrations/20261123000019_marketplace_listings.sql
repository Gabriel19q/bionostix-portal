-- Marketplace, stage 1c: offers (listings) uploaded by approved sellers.
-- The old test catalogue (Bionostix as seller with markups) is removed: products had to match the
-- new required fields anyway (decision 23.11.2026). Old tables and functions stay until stage 2.
-- Listings are admin-only (RLS); sellers write through save_listings / end_listings and read
-- through get_my_listings. Buyers get listings only in stage 2 through a new catalogue function.

-- Remove test catalogue and test orders -----------------------------------------
delete from public.documents where request_id is not null or offer_id is not null;
delete from public.request_status_history;
delete from public.request_item_costs;
delete from public.request_items;
delete from public.requests;
delete from public.offers;
delete from public.products;
delete from public.manufacturers;

-- Listings ---------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_company_id uuid not null references public.companies(id) on delete cascade,
  category public.product_category not null,
  offer_type text not null default 'supply' check (offer_type in ('supply')),
  item_no text,
  product_name text not null,
  brand text not null,
  active_ingredients text,
  dosage_form text,
  dosage_form_other text,
  test_parameter text,
  test_parameter_other text,
  method text,
  method_other text,
  ce_marking boolean,
  ivdr_class text,
  sample_type text,
  product_type text,
  product_type_other text,
  size_variant text,
  size_variant_other text,
  material text,
  units_per_pack integer not null check (units_per_pack > 0),
  unit text not null,
  national_code text,
  ma_holder text,
  ean text,
  packaging_language text not null,
  quantity integer not null check (quantity >= 0),
  moq integer check (moq >= 1),
  price numeric(12,2) not null check (price > 0),
  expiry_date date,
  min_shelf_life_months integer check (min_shelf_life_months between 1 and 120),
  incoterm text not null,
  incoterm_place text not null,
  lead_time_days integer check (lead_time_days >= 0),
  valid_until date not null,
  buyers_mode text not null default 'all' check (buyers_mode in ('all', 'only', 'except')),
  buyers_countries text[] not null default '{}',
  ship_mode text not null default 'all' check (ship_mode in ('all', 'only', 'except')),
  ship_countries text[] not null default '{}',
  registered_in text[] not null default '{}',
  documents_available text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expiry_given check (num_nonnulls(expiry_date, min_shelf_life_months) = 1)
);
create index on public.listings (seller_company_id);
create index on public.listings (status, category);
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

create table public.listing_country_prices (
  listing_id uuid not null references public.listings(id) on delete cascade,
  country text not null,
  price numeric(12,2) not null check (price > 0),
  primary key (listing_id, country)
);

alter table public.listings enable row level security;
alter table public.listing_country_prices enable row level security;
create policy admin_all on public.listings for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.listing_country_prices for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.listings, public.listing_country_prices from anon;

-- True when the caller's company is an approved seller
create or replace function public.my_seller_company() returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from companies c join profiles p on p.company_id = c.id
  where p.id = auth.uid() and c.status = 'approved' and c.wants_sell and c.sell_status = 'approved';
$$;

-- Saves new and changed offers of the caller. p: [{id?, category, product_name, ..., country_prices: [{country, price}]}]
-- Every rule the upload mask shows is checked here again. Returns the number of saved offers.
create or replace function public.save_listings(p jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_seller_company();
  v_row jsonb;
  v_cat product_category;
  v_id uuid;
  v_n integer := 0;
  v_line integer := 0;
  v_docs text[];
  v_cp jsonb;
  v_expiry date;
  v_months integer;
  v_other text;
begin
  if v_company is null then raise exception 'not an approved seller'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'no offers'; end if;
  if jsonb_array_length(p) > 2000 then raise exception 'at most 2000 offers at once'; end if;

  for v_row in select * from jsonb_array_elements(p) loop
    v_line := v_line + 1;
    begin
      v_cat := (v_row ->> 'category')::product_category;
    exception when others then
      raise exception 'line %: unknown category', v_line;
    end;
    if not exists (select 1 from company_categories where company_id = v_company and role = 'sell'
                   and category = v_cat and status = 'approved') then
      raise exception 'line %: category not approved for you', v_line;
    end if;
    if coalesce(trim(v_row ->> 'product_name'), '') = '' or coalesce(trim(v_row ->> 'brand'), '') = ''
       or coalesce(trim(v_row ->> 'unit'), '') = '' or coalesce(trim(v_row ->> 'packaging_language'), '') = ''
       or coalesce(trim(v_row ->> 'incoterm_place'), '') = '' then
      raise exception 'line %: required field missing', v_line;
    end if;
    if v_cat in ('pharma', 'supplements') and (coalesce(trim(v_row ->> 'active_ingredients'), '') = ''
       or coalesce(trim(v_row ->> 'dosage_form'), '') = '') then
      raise exception 'line %: active ingredients and dosage form are required', v_line;
    end if;
    if v_cat = 'ivd' and (coalesce(trim(v_row ->> 'test_parameter'), '') = ''
       or coalesce(trim(v_row ->> 'method'), '') = '' or (v_row -> 'ce_marking') is null
       or jsonb_typeof(v_row -> 'ce_marking') <> 'boolean') then
      raise exception 'line %: test, method and CE marking are required', v_line;
    end if;
    if v_cat = 'health' and (coalesce(trim(v_row ->> 'product_type'), '') = ''
       or coalesce(trim(v_row ->> 'size_variant'), '') = '') then
      raise exception 'line %: product type and size are required', v_line;
    end if;
    foreach v_other in array array['dosage_form', 'test_parameter', 'method', 'product_type', 'size_variant'] loop
      if v_row ->> v_other = 'Other' and coalesce(trim(v_row ->> (v_other || '_other')), '') = '' then
        raise exception 'line %: please describe "Other"', v_line;
      end if;
    end loop;
    if (v_row ->> 'incoterm') not in ('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF') then
      raise exception 'line %: unknown incoterm', v_line;
    end if;
    if (v_row ->> 'valid_until')::date < current_date then
      raise exception 'line %: offer validity is in the past', v_line;
    end if;
    v_expiry := nullif(v_row ->> 'expiry_date', '')::date;
    v_months := nullif(v_row ->> 'min_shelf_life_months', '')::integer;
    if num_nonnulls(v_expiry, v_months) <> 1 then raise exception 'line %: expiry missing', v_line; end if;
    if v_expiry is not null and v_expiry <= current_date then raise exception 'line %: product already expired', v_line; end if;
    if coalesce(v_row ->> 'buyers_mode', 'all') not in ('all', 'only', 'except')
       or coalesce(v_row ->> 'ship_mode', 'all') not in ('all', 'only', 'except') then
      raise exception 'line %: invalid country rule', v_line;
    end if;
    if coalesce(v_row ->> 'buyers_mode', 'all') <> 'all' and jsonb_array_length(coalesce(v_row -> 'buyers_countries', '[]')) = 0
       or coalesce(v_row ->> 'ship_mode', 'all') <> 'all' and jsonb_array_length(coalesce(v_row -> 'ship_countries', '[]')) = 0 then
      raise exception 'line %: country rule without countries', v_line;
    end if;
    v_docs := array(select jsonb_array_elements_text(coalesce(v_row -> 'documents_available', '[]')));
    if exists (select 1 from unnest(v_docs) d where d not in ('CoA', 'CPP', 'FSC', 'GMP certificate', 'Registration dossier',
        'Stability data', 'Declaration of conformity / CE certificate', 'ISO 13485 certificate', 'Certificate of origin', 'Other')) then
      raise exception 'line %: unknown document', v_line;
    end if;

    v_id := nullif(v_row ->> 'id', '')::uuid;
    if v_id is not null then
      if not exists (select 1 from listings where id = v_id and seller_company_id = v_company) then
        raise exception 'line %: offer not found', v_line;
      end if;
    else
      v_id := gen_random_uuid();
    end if;

    insert into listings as l (
      id, seller_company_id, category, item_no, product_name, brand, active_ingredients,
      dosage_form, dosage_form_other, test_parameter, test_parameter_other, method, method_other,
      ce_marking, ivdr_class, sample_type, product_type, product_type_other, size_variant, size_variant_other,
      material, units_per_pack, unit, national_code, ma_holder, ean, packaging_language, quantity, moq, price,
      expiry_date, min_shelf_life_months, incoterm, incoterm_place, lead_time_days, valid_until,
      buyers_mode, buyers_countries, ship_mode, ship_countries, registered_in, documents_available, status)
    values (
      v_id, v_company, v_cat, left(nullif(trim(v_row ->> 'item_no'), ''), 100),
      left(trim(v_row ->> 'product_name'), 300), left(trim(v_row ->> 'brand'), 200),
      left(nullif(trim(v_row ->> 'active_ingredients'), ''), 500),
      left(nullif(trim(v_row ->> 'dosage_form'), ''), 100), left(nullif(trim(v_row ->> 'dosage_form_other'), ''), 200),
      left(nullif(trim(v_row ->> 'test_parameter'), ''), 100), left(nullif(trim(v_row ->> 'test_parameter_other'), ''), 200),
      left(nullif(trim(v_row ->> 'method'), ''), 100), left(nullif(trim(v_row ->> 'method_other'), ''), 200),
      (v_row ->> 'ce_marking')::boolean, left(nullif(trim(v_row ->> 'ivdr_class'), ''), 50),
      left(nullif(trim(v_row ->> 'sample_type'), ''), 100),
      left(nullif(trim(v_row ->> 'product_type'), ''), 100), left(nullif(trim(v_row ->> 'product_type_other'), ''), 200),
      left(nullif(trim(v_row ->> 'size_variant'), ''), 100), left(nullif(trim(v_row ->> 'size_variant_other'), ''), 200),
      left(nullif(trim(v_row ->> 'material'), ''), 100),
      (v_row ->> 'units_per_pack')::integer, left(trim(v_row ->> 'unit'), 50),
      left(nullif(trim(v_row ->> 'national_code'), ''), 50), left(nullif(trim(v_row ->> 'ma_holder'), ''), 200),
      left(nullif(trim(v_row ->> 'ean'), ''), 20), left(trim(v_row ->> 'packaging_language'), 200),
      (v_row ->> 'quantity')::integer, nullif(v_row ->> 'moq', '')::integer, (v_row ->> 'price')::numeric,
      v_expiry, v_months, v_row ->> 'incoterm', left(trim(v_row ->> 'incoterm_place'), 200),
      nullif(v_row ->> 'lead_time_days', '')::integer, (v_row ->> 'valid_until')::date,
      coalesce(v_row ->> 'buyers_mode', 'all'),
      array(select left(x, 100) from jsonb_array_elements_text(coalesce(v_row -> 'buyers_countries', '[]')) x limit 250),
      coalesce(v_row ->> 'ship_mode', 'all'),
      array(select left(x, 100) from jsonb_array_elements_text(coalesce(v_row -> 'ship_countries', '[]')) x limit 250),
      array(select left(x, 100) from jsonb_array_elements_text(coalesce(v_row -> 'registered_in', '[]')) x limit 250),
      v_docs, 'active')
    on conflict (id) do update set
      category = excluded.category, item_no = excluded.item_no, product_name = excluded.product_name,
      brand = excluded.brand, active_ingredients = excluded.active_ingredients,
      dosage_form = excluded.dosage_form, dosage_form_other = excluded.dosage_form_other,
      test_parameter = excluded.test_parameter, test_parameter_other = excluded.test_parameter_other,
      method = excluded.method, method_other = excluded.method_other, ce_marking = excluded.ce_marking,
      ivdr_class = excluded.ivdr_class, sample_type = excluded.sample_type, product_type = excluded.product_type,
      product_type_other = excluded.product_type_other, size_variant = excluded.size_variant,
      size_variant_other = excluded.size_variant_other, material = excluded.material,
      units_per_pack = excluded.units_per_pack, unit = excluded.unit, national_code = excluded.national_code,
      ma_holder = excluded.ma_holder, ean = excluded.ean, packaging_language = excluded.packaging_language,
      quantity = excluded.quantity, moq = excluded.moq, price = excluded.price, expiry_date = excluded.expiry_date,
      min_shelf_life_months = excluded.min_shelf_life_months, incoterm = excluded.incoterm,
      incoterm_place = excluded.incoterm_place, lead_time_days = excluded.lead_time_days,
      valid_until = excluded.valid_until, buyers_mode = excluded.buyers_mode,
      buyers_countries = excluded.buyers_countries, ship_mode = excluded.ship_mode,
      ship_countries = excluded.ship_countries, registered_in = excluded.registered_in,
      documents_available = excluded.documents_available, status = 'active'
    where l.seller_company_id = v_company;

    delete from listing_country_prices where listing_id = v_id;
    if jsonb_array_length(coalesce(v_row -> 'country_prices', '[]')) > 250 then
      raise exception 'line %: too many country prices', v_line;
    end if;
    for v_cp in select * from jsonb_array_elements(coalesce(v_row -> 'country_prices', '[]')) loop
      if coalesce(trim(v_cp ->> 'country'), '') = '' or coalesce((v_cp ->> 'price')::numeric, 0) <= 0 then
        raise exception 'line %: invalid country price', v_line;
      end if;
      insert into listing_country_prices (listing_id, country, price)
      values (v_id, left(trim(v_cp ->> 'country'), 100), (v_cp ->> 'price')::numeric)
      on conflict (listing_id, country) do update set price = excluded.price;
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Ends offers of the caller (no longer shown to buyers)
create or replace function public.end_listings(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_seller_company();
  v_n integer;
begin
  if v_company is null then raise exception 'not an approved seller'; end if;
  update listings set status = 'ended' where id = any(p_ids) and seller_company_id = v_company;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- The caller's own offers with their country prices
create or replace function public.get_my_listings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(l) - 'seller_company_id' || jsonb_build_object('country_prices',
    coalesce((select jsonb_agg(jsonb_build_object('country', cp.country, 'price', cp.price) order by cp.country)
              from listing_country_prices cp where cp.listing_id = l.id), '[]'::jsonb))
    order by l.status, l.updated_at desc), '[]'::jsonb)
  from listings l
  where l.seller_company_id = my_seller_company();
$$;

revoke execute on function public.my_seller_company(), public.save_listings(jsonb),
  public.end_listings(uuid[]), public.get_my_listings() from public, anon;
grant execute on function public.my_seller_company(), public.save_listings(jsonb),
  public.end_listings(uuid[]), public.get_my_listings() to authenticated;
