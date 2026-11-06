-- submit_request: refuse quantities above what is available, and empty/duplicate lines.

create or replace function public.submit_request(
  p_items jsonb, p_comment text default null, p_delivery_country text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
  v_group_pct numeric;
  v_request uuid;
  v_item jsonb;
  v_offer record;
  v_qty integer;
  v_item_id uuid;
  v_seen uuid[] := '{}';
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

  select g.default_markup_pct into v_group_pct
  from companies c join customer_groups g on g.id = c.customer_group_id
  where c.id = v_company;

  insert into requests (company_id, created_by, customer_comment, delivery_country)
  values (v_company, auth.uid(), nullif(trim(p_comment), ''), nullif(trim(p_delivery_country), ''))
  returning id into v_request;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    select * into v_offer from offers
    where id = (v_item ->> 'offer_id')::uuid
      and is_active and available_qty > 0 and expiry_date > current_date;
    if not found then raise exception 'offer not available'; end if;
    if v_offer.id = any(v_seen) then raise exception 'same batch listed twice'; end if;
    v_seen := v_seen || v_offer.id;
    if v_qty is null or v_qty < v_offer.moq then
      raise exception 'quantity below minimum order quantity';
    end if;
    if v_qty > v_offer.available_qty then
      raise exception 'quantity above available stock';
    end if;

    insert into request_items (request_id, offer_id, requested_qty, unit_price_snapshot)
    values (v_request, v_offer.id, v_qty,
            sell_price(v_offer.purchase_price, v_offer.markup_override_pct, v_group_pct))
    returning id into v_item_id;

    insert into request_item_costs (request_item_id, purchase_price_snapshot)
    values (v_item_id, v_offer.purchase_price);
  end loop;

  return v_request;
end $$;
