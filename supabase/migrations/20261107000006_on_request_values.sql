-- Real manufacturer lists often have no batch number, no expiry date, no quantity
-- ("min. 500", "to be confirmed") or no price ("upon request").
-- These values become optional: NULL means "on request". An empty batch means "not specified".

alter table public.offers alter column expiry_date drop not null;
alter table public.offers alter column available_qty drop not null;
alter table public.offers alter column purchase_price drop not null;
alter table public.offers alter column batch set default '';
alter table public.offers add column internal_note text;

alter table public.request_items alter column unit_price_snapshot drop not null;
alter table public.request_item_costs alter column purchase_price_snapshot drop not null;

-- Customer catalog: rows "on request" are shown too
create or replace function public.get_catalog()
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
         case when o.purchase_price is null then null
              else public.sell_price(o.purchase_price, o.markup_override_pct, g.default_markup_pct) end
  from public.offers o
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  join public.companies c on c.id = public.my_company_id()
  join public.customer_groups g on g.id = c.customer_group_id
  where public.my_company_active()
    and o.is_active
    and (o.available_qty is null or o.available_qty > 0)
    and (o.expiry_date is null or o.expiry_date > current_date);
$$;

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
      and is_active
      and (available_qty is null or available_qty > 0)
      and (expiry_date is null or expiry_date > current_date);
    if not found then raise exception 'offer not available'; end if;
    if v_offer.id = any(v_seen) then raise exception 'same batch listed twice'; end if;
    v_seen := v_seen || v_offer.id;
    if v_qty is null or v_qty < v_offer.moq then
      raise exception 'quantity below minimum order quantity';
    end if;
    if v_offer.available_qty is not null and v_qty > v_offer.available_qty then
      raise exception 'quantity above available stock';
    end if;

    insert into request_items (request_id, offer_id, requested_qty, unit_price_snapshot)
    values (v_request, v_offer.id, v_qty,
            case when v_offer.purchase_price is null then null
                 else sell_price(v_offer.purchase_price, v_offer.markup_override_pct, v_group_pct) end)
    returning id into v_item_id;

    insert into request_item_costs (request_item_id, purchase_price_snapshot)
    values (v_item_id, v_offer.purchase_price);
  end loop;

  return v_request;
end $$;
