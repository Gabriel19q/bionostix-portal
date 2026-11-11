-- Binding order requests (feedback 11 Nov 2026)
-- The customer's order request is a binding offer to buy. A contract is formed with our order
-- confirmation. If we have to change quantities or prices, the customer accepts the changes first.
--
-- New flow: new -> in_review -> order_confirmed -> proforma_sent (deposit) -> deposit_paid
--           -> ordered (from manufacturer) -> shipped -> completed
-- With changes: in_review -> changes_proposed -> (customer accepts) -> order_confirmed
-- Cancelled by the customer only before confirmation; declined by us.
--
-- Existing values are renamed so live requests keep a fitting meaning:
--   offer_sent -> changes_proposed (customer has to accept), accepted -> order_confirmed,
--   paid -> deposit_paid.

alter type public.request_status rename value 'offer_sent' to 'changes_proposed';
alter type public.request_status rename value 'accepted' to 'order_confirmed';
alter type public.request_status rename value 'paid' to 'deposit_paid';
alter type public.request_status add value if not exists 'ordered' after 'deposit_paid';

-- Customer requirements per request and per line
alter table public.requests add column delivery_deadline date;
alter table public.request_items add column min_expiry_date date;

-- Several status changes in one transaction got the same timestamp (now() = transaction start),
-- so the history order was random. clock_timestamp() is the real time of each insert.
alter table public.request_status_history alter column created_at set default clock_timestamp();

-- ---------------------------------------------------------------------------
-- Submit: delivery deadline required, optional minimum expiry for lines without an expiry date
-- ---------------------------------------------------------------------------
drop function public.submit_request(jsonb, text, text);

create function public.submit_request(
  p_items jsonb, p_comment text, p_delivery_country text, p_delivery_deadline date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
  v_group_pct numeric;
  v_request uuid;
  v_item jsonb;
  v_offer record;
  v_qty integer;
  v_min_expiry date;
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
  if coalesce(trim(p_delivery_country), '') = '' then
    raise exception 'delivery country is required';
  end if;
  if p_delivery_deadline is null or p_delivery_deadline <= current_date then
    raise exception 'delivery deadline must be in the future';
  end if;

  select g.default_markup_pct into v_group_pct
  from companies c join customer_groups g on g.id = c.customer_group_id
  where c.id = v_company;

  insert into requests (company_id, created_by, customer_comment, delivery_country, delivery_deadline)
  values (v_company, auth.uid(), nullif(trim(p_comment), ''), trim(p_delivery_country), p_delivery_deadline)
  returning id into v_request;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    v_min_expiry := nullif(v_item ->> 'min_expiry', '')::date;
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
    -- A minimum expiry only makes sense where the catalog shows no expiry date
    if v_offer.expiry_date is not null then
      v_min_expiry := null;
    elsif v_min_expiry is not null and v_min_expiry <= current_date then
      raise exception 'minimum expiry must be in the future';
    end if;

    insert into request_items (request_id, offer_id, requested_qty, unit_price_snapshot, min_expiry_date)
    values (v_request, v_offer.id, v_qty,
            case when v_offer.purchase_price is null then null
                 else sell_price(v_offer.purchase_price, v_offer.markup_override_pct, v_group_pct) end,
            v_min_expiry)
    returning id into v_item_id;

    insert into request_item_costs (request_item_id, purchase_price_snapshot)
    values (v_item_id, v_offer.purchase_price);
  end loop;

  return v_request;
end $$;

-- ---------------------------------------------------------------------------
-- Customer: accept proposed changes, or cancel before our order confirmation
-- ---------------------------------------------------------------------------
create or replace function public.customer_respond(p_request_id uuid, p_accept boolean)
returns public.request_status
language plpgsql security definer set search_path = public as $$
declare
  v_status request_status;
  v_new request_status;
begin
  select status into v_status from requests
  where id = p_request_id and company_id = my_company_id()
  for update;
  if not found then raise exception 'request not found'; end if;

  if p_accept then
    if v_status <> 'changes_proposed' then raise exception 'nothing to accept yet'; end if;
    v_new := 'order_confirmed';
  else
    if v_status not in ('new', 'in_review', 'changes_proposed') then
      raise exception 'request can no longer be cancelled';
    end if;
    v_new := 'cancelled';
  end if;

  update requests set status = v_new where id = p_request_id;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Customer read functions: new columns (return type changes, so drop and recreate)
-- ---------------------------------------------------------------------------
drop function public.get_my_requests();
create function public.get_my_requests()
returns table (
  id uuid, number text, status public.request_status, seller public.seller,
  customer_comment text, delivery_country text, delivery_deadline date,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.number, r.status, r.seller, r.customer_comment, r.delivery_country,
         r.delivery_deadline, r.created_at, r.updated_at
  from public.requests r
  where r.company_id = public.my_company_id();
$$;

drop function public.get_my_request_items();
create function public.get_my_request_items()
returns table (
  id uuid, request_id uuid, offer_id uuid, trade_name text, strength text, pack_size text,
  manufacturer text, batch text, expiry_date date, min_expiry_date date, requested_qty integer,
  unit_price_snapshot numeric, confirmed_qty integer, confirmed_unit_price numeric
)
language sql stable security definer set search_path = public as $$
  select i.id, i.request_id, i.offer_id, p.trade_name, p.strength, p.pack_size, m.name,
         o.batch, o.expiry_date, i.min_expiry_date, i.requested_qty, i.unit_price_snapshot,
         i.confirmed_qty, i.confirmed_unit_price
  from public.request_items i
  join public.requests r on r.id = i.request_id
  join public.offers o on o.id = i.offer_id
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where r.company_id = public.my_company_id();
$$;

-- ---------------------------------------------------------------------------
-- Access application: phone number in international format (+ country code)
-- ---------------------------------------------------------------------------
create or replace function public.apply_for_access(
  p_name text, p_country text, p_address text, p_customer_type public.customer_type,
  p_contact_name text, p_contact_phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_phone text := regexp_replace(coalesce(p_contact_phone, ''), '[\s().-]', '', 'g');
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if (select company_id from profiles where id = v_uid) is not null then
    raise exception 'access already requested';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_country), '') = '' then
    raise exception 'company name and country are required';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone number must be in international format';
  end if;

  insert into companies (name, country, address, customer_type, contact_name, contact_email, contact_phone)
  values (trim(p_name), trim(p_country), p_address, p_customer_type, p_contact_name,
          (select email from profiles where id = v_uid), trim(p_contact_phone))
  returning id into v_company;

  update profiles set company_id = v_company, full_name = coalesce(full_name, p_contact_name)
  where id = v_uid;
  return v_company;
end $$;

revoke execute on function public.submit_request(jsonb, text, text, date), public.get_my_requests(),
  public.get_my_request_items() from public, anon;
grant execute on function public.submit_request(jsonb, text, text, date), public.get_my_requests(),
  public.get_my_request_items() to authenticated;
