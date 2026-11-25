-- Admin help for sellers (24.11.2026): Bionostix can import a seller's list for them. The offers land as
-- drafts with the seller, who checks and publishes them. The save logic moves into save_listings_for(),
-- which nobody may call directly; save_listings() publishes, admin_prepare_listings() prepares drafts.

alter table public.listings drop constraint listings_status_check;
alter table public.listings add constraint listings_status_check check (status in ('active', 'ended', 'draft'));

create or replace function public.save_listings_for(v_company uuid, p jsonb, p_status text) returns integer
language plpgsql security definer set search_path = public as $$
declare
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
  if p_status not in ('active', 'draft') then raise exception 'invalid status'; end if;
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
      id, seller_company_id, category, item_no, product_name, name_on_pack, brand, active_ingredients,
      dosage_form, dosage_form_other, test_parameter, test_parameter_other, method, method_other,
      ce_marking, ivdr_class, sample_type, product_type, product_type_other, size_variant, size_variant_other,
      material, units_per_pack, unit, national_code, ma_holder, ean, packaging_language, quantity, moq, price,
      expiry_date, min_shelf_life_months, incoterm, incoterm_place, lead_time_days, valid_until,
      buyers_mode, buyers_countries, ship_mode, ship_countries, registered_in, documents_available, status)
    values (
      v_id, v_company, v_cat, left(nullif(trim(v_row ->> 'item_no'), ''), 100),
      left(trim(v_row ->> 'product_name'), 300), left(nullif(trim(v_row ->> 'name_on_pack'), ''), 300),
      left(trim(v_row ->> 'brand'), 200),
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
      v_docs, p_status)
    on conflict (id) do update set
      category = excluded.category, item_no = excluded.item_no, product_name = excluded.product_name,
      name_on_pack = excluded.name_on_pack,
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
      documents_available = excluded.documents_available, status = excluded.status
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

revoke execute on function public.save_listings_for(uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.save_listings(p jsonb) returns integer
language sql security definer set search_path = public as $$
  select save_listings_for(my_seller_company(), p, 'active');
$$;

-- Admins prepare offers for an approved seller; they stay drafts until the seller publishes them
create or replace function public.admin_prepare_listings(p_company uuid, p jsonb) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not exists (select 1 from companies where id = p_company and status = 'approved'
                 and wants_sell and sell_status = 'approved') then
    raise exception 'not an approved seller';
  end if;
  return save_listings_for(p_company, p, 'draft');
end $$;

revoke execute on function public.admin_prepare_listings(uuid, jsonb) from public, anon;
grant execute on function public.admin_prepare_listings(uuid, jsonb) to authenticated;
