-- Product requests (25.11.2026): order type (one-time / annual quantity with delivery schedule), latest or first
-- delivery date (now required), partial deliveries, planned registration in the destination country and the
-- documents the buyer requires.
alter table public.sourcing_requests
  add column order_type text check (order_type in ('one_time', 'annual')),
  add column delivery_schedule text check (delivery_schedule in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'on_call')),
  add column partial_deliveries boolean,
  add column registration_planned boolean,
  add column required_documents text[] not null default '{}';

create or replace function public.save_product_requests_for(v_company uuid, p jsonb, p_status text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_cat product_category;
  v_id uuid;
  v_line integer := 0;
  v_needed date;
  v_docs text[];
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
    if v_needed is null then raise exception 'line %: delivery date missing', v_line; end if;
    if v_needed <= current_date then raise exception 'line %: date must be in the future', v_line; end if;
    if coalesce(v_row ->> 'order_type', '') not in ('one_time', 'annual') then raise exception 'line %: order type missing', v_line; end if;
    if v_row ->> 'order_type' = 'annual'
       and coalesce(v_row ->> 'delivery_schedule', '') not in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'on_call') then
      raise exception 'line %: delivery schedule missing', v_line;
    end if;
    if jsonb_typeof(v_row -> 'registration_planned') is distinct from 'boolean' then
      raise exception 'line %: registration question missing', v_line;
    end if;
    if (v_row -> 'partial_deliveries') is not null and jsonb_typeof(v_row -> 'partial_deliveries') not in ('boolean', 'null') then
      raise exception 'line %: invalid partial deliveries', v_line;
    end if;
    v_docs := array(select jsonb_array_elements_text(coalesce(v_row -> 'required_documents', '[]')));
    if exists (select 1 from unnest(v_docs) d where d not in ('CoA', 'CPP', 'FSC', 'GMP certificate', 'Registration dossier',
        'Stability data', 'Declaration of conformity / CE certificate', 'ISO 13485 certificate', 'Certificate of origin', 'Other')) then
      raise exception 'line %: unknown document', v_line;
    end if;

    v_id := nullif(v_row ->> 'id', '')::uuid;
    if v_id is not null and not exists (select 1 from sourcing_requests where id = v_id and company_id = v_company) then
      raise exception 'line %: product request not found', v_line;
    end if;

    if v_id is null then
      insert into sourcing_requests (company_id, created_by, product, details, quantity, target_price, needed_by,
        delivery_country, status, category, active_ingredients, dosage_form, test_parameter, method, product_type,
        size_variant, units_per_pack, unit, quantity_packs, target_price_eur, order_type, delivery_schedule,
        partial_deliveries, registration_planned, required_documents)
      values (v_company, auth.uid(), left(trim(v_row ->> 'product_name'), 300), left(nullif(trim(v_row ->> 'note'), ''), 2000),
        (v_row ->> 'quantity') || ' packs', nullif(v_row ->> 'target_price', ''), v_needed,
        left(trim(v_row ->> 'delivery_country'), 100), p_status, v_cat,
        left(nullif(trim(v_row ->> 'active_ingredients'), ''), 500), left(nullif(trim(v_row ->> 'dosage_form'), ''), 100),
        left(nullif(trim(v_row ->> 'test_parameter'), ''), 100), left(nullif(trim(v_row ->> 'method'), ''), 100),
        left(nullif(trim(v_row ->> 'product_type'), ''), 100), left(nullif(trim(v_row ->> 'size_variant'), ''), 100),
        nullif(v_row ->> 'units_per_pack', '')::integer, left(nullif(trim(v_row ->> 'unit'), ''), 50),
        (v_row ->> 'quantity')::integer, nullif(v_row ->> 'target_price', '')::numeric, v_row ->> 'order_type',
        case when v_row ->> 'order_type' = 'annual' then v_row ->> 'delivery_schedule' end,
        (v_row ->> 'partial_deliveries')::boolean, (v_row ->> 'registration_planned')::boolean, v_docs);
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
        quantity_packs = (v_row ->> 'quantity')::integer, target_price_eur = nullif(v_row ->> 'target_price', '')::numeric,
        order_type = v_row ->> 'order_type',
        delivery_schedule = case when v_row ->> 'order_type' = 'annual' then v_row ->> 'delivery_schedule' end,
        partial_deliveries = (v_row ->> 'partial_deliveries')::boolean,
        registration_planned = (v_row ->> 'registration_planned')::boolean, required_documents = v_docs
      where id = v_id and company_id = v_company;
    end if;
  end loop;
  return v_line;
end $$;
revoke execute on function public.save_product_requests_for(uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.get_my_product_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'number', s.number, 'product_name', s.product, 'note', s.details, 'needed_by', s.needed_by,
    'delivery_country', s.delivery_country, 'status', s.status, 'reply', s.reply, 'category', s.category,
    'active_ingredients', s.active_ingredients, 'dosage_form', s.dosage_form, 'test_parameter', s.test_parameter,
    'method', s.method, 'product_type', s.product_type, 'size_variant', s.size_variant,
    'units_per_pack', s.units_per_pack, 'unit', s.unit, 'quantity', s.quantity_packs,
    'quantity_text', s.quantity, 'target_price', s.target_price_eur, 'target_price_text', s.target_price,
    'order_type', s.order_type, 'delivery_schedule', s.delivery_schedule, 'partial_deliveries', s.partial_deliveries,
    'registration_planned', s.registration_planned, 'required_documents', s.required_documents,
    'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
  from sourcing_requests s
  where s.company_id = my_company_id();
$$;

