-- Seller per product (meeting 9 Nov 2026, decided 12 Nov 2026)
-- The seller (contract partner) is set per product; for now Sanicura everywhere. Customers see it in the
-- catalog. An order request with products of different sellers is split into one request per seller,
-- because each seller confirms its own order with its own proforma.

alter table public.products add column seller public.seller not null default 'sanicura';

-- Catalog with seller
drop function public.get_catalog();
create function public.get_catalog()
returns table (
  offer_id uuid, product_id uuid, trade_name text, active_ingredient text, strength text,
  dosage_form text, pack_size text, pzn text, manufacturer text,
  is_rx boolean, is_cold_chain boolean, is_narcotic boolean,
  batch text, expiry_date date, available_qty integer, moq integer, incoterm text,
  stock_as_of date, unit_price numeric, coa_available boolean, seller public.seller
)
language sql stable security definer set search_path = public as $$
  select o.id, p.id, p.trade_name, p.active_ingredient, p.strength,
         p.dosage_form, p.pack_size, p.pzn, m.name,
         p.is_rx, p.is_cold_chain, p.is_narcotic,
         o.batch, o.expiry_date, o.available_qty, o.moq, o.incoterm, o.stock_as_of,
         case when o.purchase_price is null then null
              else public.sell_price(o.purchase_price, o.markup_override_pct, g.default_markup_pct) end,
         o.coa_available, p.seller
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

-- Submit: validate every line first, then create one request per seller. Returns the new request ids.
drop function public.submit_request(jsonb, text, text, date);
create function public.submit_request(
  p_items jsonb, p_comment text, p_delivery_country text, p_delivery_deadline date
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
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

  select g.default_markup_pct into v_group_pct
  from companies c join customer_groups g on g.id = c.customer_group_id
  where c.id = v_company;

  -- Pass 1: check every line before anything is stored
  create temp table if not exists pg_temp.submit_lines (
    offer_id uuid, qty integer, min_expiry date, seller public.seller, unit_price numeric, purchase numeric
  ) on commit drop;
  delete from pg_temp.submit_lines;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    v_min_expiry := nullif(v_item ->> 'min_expiry', '')::date;
    select o.*, p.seller as product_seller into v_offer
    from offers o join products p on p.id = o.product_id
    where o.id = (v_item ->> 'offer_id')::uuid
      and o.is_active
      and (o.available_qty is null or o.available_qty > 0)
      and (o.expiry_date is null or o.expiry_date > current_date);
    if not found then raise exception 'offer not available'; end if;
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

  -- Pass 2: one request per seller
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
