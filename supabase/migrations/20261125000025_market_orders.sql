-- Marketplace stage 2c: orders between buyers and sellers (SPEC.md, "Anfrage und Vertrag").
-- Buyer sends a binding request to an offer; seller accepts, declines or makes a counter-offer.
-- Acceptance = contract, the commission is fixed at that moment. Both sides stay anonymous before acceptance;
-- after acceptance the seller sees the buyer's company and licences; the buyer learns the seller when the seller
-- uploads the invoice or order confirmation. Buyers never see commissions.

create sequence public.market_order_seq;

create table public.market_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default 'ORD-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.market_order_seq')::text, 5, '0'),
  listing_id uuid references public.listings(id) on delete set null,
  buyer_company_id uuid not null references public.companies(id),
  seller_company_id uuid not null references public.companies(id),
  created_by uuid references public.profiles(id) on delete set null,
  category public.product_category not null,
  product jsonb not null,                      -- the offer as the buyer saw it
  unit_price numeric(12,2) not null check (unit_price > 0),
  quantity integer not null check (quantity > 0),
  delivery_country text not null,
  final_destination text not null,
  needed_by date,
  required_documents text[] not null default '{}',
  comment text,
  status text not null default 'requested'
    check (status in ('requested', 'countered', 'accepted', 'paid', 'shipped', 'completed', 'declined', 'withdrawn')),
  counter_quantity integer check (counter_quantity > 0),
  counter_price numeric(12,2) check (counter_price > 0),
  counter_note text,
  decline_reason text,
  commission_pct numeric(5,2),
  commission_eur numeric(12,2),
  accepted_at timestamptz,
  seller_revealed_at timestamptz,
  tracking text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.market_orders (buyer_company_id);
create index on public.market_orders (seller_company_id);

create table public.market_order_events (
  id bigserial primary key,
  order_id uuid not null references public.market_orders(id) on delete cascade,
  actor text not null check (actor in ('buyer', 'seller', 'admin')),
  event text not null,
  note text,
  created_at timestamptz not null default now()
);
create index on public.market_order_events (order_id);

create table public.market_order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.market_orders(id) on delete cascade,
  kind text not null check (kind in ('invoice', 'order_confirmation', 'delivery_note', 'document', 'other')),
  storage_path text not null unique,
  file_name text not null,
  uploaded_by_company uuid references public.companies(id),
  created_at timestamptz not null default now()
);
create index on public.market_order_documents (order_id);

alter table public.market_orders enable row level security;
alter table public.market_order_events enable row level security;
alter table public.market_order_documents enable row level security;
create policy admin_all on public.market_orders for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.market_order_events for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.market_order_documents for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.market_orders, public.market_order_events, public.market_order_documents from anon;
revoke all on sequence public.market_order_seq from anon, authenticated;

-- Helpers ---------------------------------------------------------------------------------------
create or replace function public.country_allowed(p_mode text, p_countries text[], p_country text) returns boolean
language sql immutable set search_path = public as $$
  select case p_mode when 'only' then p_country = any(p_countries)
                     when 'except' then not (p_country = any(p_countries))
                     else true end;
$$;

-- Caller's company is buyer or seller of the order (storage paths pass the id as text)
create or replace function public.is_order_party(p_order text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from market_orders o
                 where o.id::text = p_order and my_company_id() in (o.buyer_company_id, o.seller_company_id));
$$;

-- The seller of an accepted order may see the buyer's company files (licences)
create or replace function public.can_see_buyer_files(p_company text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from market_orders o
                 where o.buyer_company_id::text = p_company and o.seller_company_id = my_company_id()
                   and o.status in ('accepted', 'paid', 'shipped', 'completed'));
$$;

create policy "documents order read" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (((storage.foldername(name))[1] = 'order' and public.is_order_party((storage.foldername(name))[2]))
      or ((storage.foldername(name))[1] = 'company' and public.can_see_buyer_files((storage.foldername(name))[2])))
  );
create policy "documents order upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'order'
    and public.is_order_party((storage.foldername(name))[2])
  );

create or replace function public.order_event(p_order uuid, p_actor text, p_event text, p_note text default null) returns void
language sql security definer set search_path = public as $$
  insert into market_order_events (order_id, actor, event, note) values (p_order, p_actor, p_event, left(p_note, 2000));
  update market_orders set updated_at = now() where id = p_order;
$$;

-- Acceptance = contract: fix price, quantity and commission, reserve the stock
create or replace function public.accept_order_internal(p_order uuid, p_qty integer, p_price numeric, p_actor text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pct numeric;
  v_seller uuid;
  v_listing uuid;
begin
  select seller_company_id, listing_id into v_seller, v_listing from market_orders where id = p_order;
  select coalesce(c.commission_pct, (select (value #>> '{}')::numeric from app_settings where key = 'standard_commission_pct'), 0)
    into v_pct from companies c where c.id = v_seller;
  update market_orders set status = 'accepted', quantity = p_qty, unit_price = p_price, accepted_at = now(),
    commission_pct = v_pct, commission_eur = round(p_qty * p_price * v_pct / 100, 2)
  where id = p_order;
  update listings set quantity = greatest(quantity - p_qty, 0), updated_at = now() where id = v_listing;
  perform order_event(p_order, p_actor, 'accepted');
end $$;

-- Buyer: binding request ---------------------------------------------------------------------------
-- p: {listing_id, quantity, delivery_country, final_destination, needed_by, required_documents: [], comment}
create or replace function public.submit_order(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := my_buyer_company();
  l listings;
  v_qty integer;
  v_delivery text := trim(coalesce(p ->> 'delivery_country', ''));
  v_final text := trim(coalesce(nullif(p ->> 'final_destination', ''), p ->> 'delivery_country', ''));
  v_needed date := nullif(p ->> 'needed_by', '')::date;
  v_docs text[];
  v_offer jsonb;
  v_id uuid;
begin
  if v_buyer is null then raise exception 'not an approved buyer'; end if;
  if (select count(*) from market_orders where buyer_company_id = v_buyer and created_at > now() - interval '1 day') >= 100 then
    raise exception 'too many requests today';
  end if;
  select * into l from listings where id = nullif(p ->> 'listing_id', '')::uuid;
  if l.id is null or not listing_visible_to(l, v_buyer) then raise exception 'offer not available'; end if;
  v_qty := (p ->> 'quantity')::integer;
  if v_qty is null or v_qty <= 0 then raise exception 'quantity missing'; end if;
  if v_qty > l.quantity then raise exception 'more than available'; end if;
  if l.moq is not null and v_qty < l.moq then raise exception 'below minimum order quantity'; end if;
  if v_delivery = '' then raise exception 'delivery country missing'; end if;
  if not country_allowed(l.ship_mode, l.ship_countries, v_delivery) or not country_allowed(l.ship_mode, l.ship_countries, v_final) then
    raise exception 'offer cannot be shipped to this country';
  end if;
  if v_needed is not null and v_needed <= current_date then raise exception 'date must be in the future'; end if;
  v_docs := array(select jsonb_array_elements_text(coalesce(p -> 'required_documents', '[]')));
  if exists (select 1 from unnest(v_docs) d where not (d = any(l.documents_available))) then
    raise exception 'document not offered by the seller';
  end if;
  v_offer := listing_for_buyer(l, v_buyer);
  insert into market_orders (listing_id, buyer_company_id, seller_company_id, created_by, category, product, unit_price,
    quantity, delivery_country, final_destination, needed_by, required_documents, comment)
  values (l.id, v_buyer, l.seller_company_id, auth.uid(), l.category, v_offer - 'seller_country', (v_offer ->> 'price')::numeric,
    v_qty, left(v_delivery, 100), left(v_final, 100), v_needed, v_docs, left(nullif(trim(p ->> 'comment'), ''), 2000))
  returning id into v_id;
  perform order_event(v_id, 'buyer', 'requested');
  return v_id;
end $$;

-- Buyer: withdraw before acceptance
create or replace function public.withdraw_order(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update market_orders set status = 'withdrawn'
  where id = p_id and buyer_company_id = my_company_id() and status in ('requested', 'countered');
  if not found then raise exception 'order cannot be withdrawn'; end if;
  perform order_event(p_id, 'buyer', 'withdrawn');
end $$;

-- Buyer: answer a counter-offer
create or replace function public.answer_counter_offer(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  o market_orders;
begin
  select * into o from market_orders where id = p_id and buyer_company_id = my_company_id() and status = 'countered';
  if o.id is null then raise exception 'no counter-offer to answer'; end if;
  if p_accept then
    perform accept_order_internal(p_id, coalesce(o.counter_quantity, o.quantity), coalesce(o.counter_price, o.unit_price), 'buyer');
  else
    update market_orders set status = 'declined', decline_reason = 'Counter-offer declined by the buyer' where id = p_id;
    perform order_event(p_id, 'buyer', 'counter_declined');
  end if;
end $$;

-- Seller: accept, decline or counter. p: {reason, quantity, price, note, update_listing}
create or replace function public.respond_to_order(p_id uuid, p_action text, p jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare
  o market_orders;
  v_qty integer;
  v_price numeric;
begin
  select * into o from market_orders where id = p_id and seller_company_id = my_seller_company() and status = 'requested';
  if o.id is null then raise exception 'order cannot be answered'; end if;
  if p_action = 'accept' then
    perform accept_order_internal(p_id, o.quantity, o.unit_price, 'seller');
  elsif p_action = 'decline' then
    update market_orders set status = 'declined', decline_reason = left(nullif(trim(p ->> 'reason'), ''), 1000) where id = p_id;
    perform order_event(p_id, 'seller', 'declined', p ->> 'reason');
  elsif p_action = 'counter' then
    v_qty := coalesce(nullif(p ->> 'quantity', '')::integer, o.quantity);
    v_price := coalesce(nullif(p ->> 'price', '')::numeric, o.unit_price);
    if v_qty <= 0 or v_price <= 0 then raise exception 'invalid counter-offer'; end if;
    if v_qty = o.quantity and v_price = o.unit_price then raise exception 'counter-offer must change quantity or price'; end if;
    update market_orders set status = 'countered', counter_quantity = v_qty, counter_price = v_price,
      counter_note = left(nullif(trim(p ->> 'note'), ''), 1000)
    where id = p_id;
    if coalesce((p ->> 'update_listing')::boolean, false) then
      update listings set quantity = greatest(v_qty, 0), price = v_price, updated_at = now()
      where id = o.listing_id and seller_company_id = o.seller_company_id;
    end if;
    perform order_event(p_id, 'seller', 'countered', p ->> 'note');
  else
    raise exception 'unknown action';
  end if;
end $$;

-- Seller: payment received, shipped, completed (only forward)
create or replace function public.set_order_progress(p_id uuid, p_status text, p_tracking text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rank constant text[] := array['accepted', 'paid', 'shipped', 'completed'];
  o market_orders;
begin
  select * into o from market_orders where id = p_id and seller_company_id = my_company_id();
  if o.id is null or array_position(v_rank, o.status) is null or array_position(v_rank, p_status) is null
     or array_position(v_rank, p_status) <= array_position(v_rank, o.status) then
    raise exception 'status cannot be changed';
  end if;
  update market_orders set status = p_status,
    tracking = case when p_status = 'shipped' then left(nullif(trim(p_tracking), ''), 200) else tracking end
  where id = p_id;
  perform order_event(p_id, 'seller', p_status, case when p_status = 'shipped' then p_tracking end);
end $$;

-- Both: register an uploaded file. The invoice or order confirmation reveals the seller to the buyer.
create or replace function public.add_order_document(p_order uuid, p_path text, p_file_name text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o market_orders;
  v_me uuid := my_company_id();
begin
  select * into o from market_orders where id = p_order and v_me in (buyer_company_id, seller_company_id)
    and status in ('accepted', 'paid', 'shipped', 'completed');
  if o.id is null then raise exception 'documents only after acceptance'; end if;
  if p_path not like 'order/' || p_order::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'documents' and name = p_path) then
    raise exception 'file not found';
  end if;
  if v_me = o.buyer_company_id and v_me <> o.seller_company_id and p_kind <> 'other' then raise exception 'buyers upload other documents only'; end if;
  insert into market_order_documents (order_id, kind, storage_path, file_name, uploaded_by_company)
  values (p_order, p_kind, p_path, left(p_file_name, 200), v_me);
  if v_me = o.seller_company_id and p_kind in ('invoice', 'order_confirmation') then
    update market_orders set seller_revealed_at = coalesce(seller_revealed_at, now()) where id = p_order;
  end if;
  perform order_event(p_order, case when v_me = o.seller_company_id then 'seller' else 'buyer' end, 'document', p_kind || ': ' || p_file_name);
end $$;

-- Reading ------------------------------------------------------------------------------------------
-- One order as the caller may see it. Buyer: never commission; seller identity only after the invoice.
-- Seller: buyer profile only (country, licence validity, completed deals) until acceptance, then full data.
create or replace function public.order_for_me(o public.market_orders) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select my_company_id() as id),
  side as (select case when (select id from me) = o.seller_company_id then 'seller' else 'buyer' end as s),
  open_deal as (select o.status in ('accepted', 'paid', 'shipped', 'completed') as yes)
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'side', (select s from side), 'status', o.status, 'category', o.category,
    'product', o.product, 'unit_price', o.unit_price, 'quantity', o.quantity, 'total', round(o.unit_price * o.quantity, 2),
    'delivery_country', o.delivery_country, 'final_destination', o.final_destination, 'needed_by', o.needed_by,
    'required_documents', o.required_documents, 'comment', o.comment,
    'counter_quantity', o.counter_quantity, 'counter_price', o.counter_price, 'counter_note', o.counter_note,
    'decline_reason', o.decline_reason, 'accepted_at', o.accepted_at, 'tracking', o.tracking,
    'created_at', o.created_at, 'updated_at', o.updated_at, 'listing_id', o.listing_id,
    'seller', case
      when (select s from side) = 'seller' or o.seller_revealed_at is not null then
        (select jsonb_build_object('code', c.seller_code, 'name', c.name, 'country', c.country, 'address', c.address,
                                   'vat_id', c.vat_id, 'contact_email', c.contact_email, 'contact_phone', c.contact_phone)
         from companies c where c.id = o.seller_company_id)
      else (select jsonb_build_object('code', c.seller_code, 'country', c.country) from companies c where c.id = o.seller_company_id) end,
    'buyer', case
      when (select s from side) = 'buyer' then null
      when (select yes from open_deal) then
        (select jsonb_build_object('name', c.name, 'country', c.country, 'address', c.address, 'vat_id', c.vat_id,
                  'contact_name', c.contact_name, 'contact_email', c.contact_email, 'contact_phone', c.contact_phone,
                  'documents', coalesce((select jsonb_agg(jsonb_build_object('file_name', d.file_name, 'kind', d.kind,
                                 'storage_path', d.storage_path) order by d.created_at)
                               from documents d where d.company_id = c.id and d.storage_path like 'company/%'), '[]'::jsonb))
         from companies c where c.id = o.buyer_company_id)
      else
        (select jsonb_build_object('country', c.country,
                  'licence_valid_until', coalesce((select min(s.licence_valid_until) from company_sites s
                                                   where s.company_id = c.id and s.status = 'approved'), c.license_expires_on),
                  'completed_deals', (select count(*) from market_orders x where x.buyer_company_id = c.id
                                      and x.status in ('accepted', 'paid', 'shipped', 'completed')))
         from companies c where c.id = o.buyer_company_id) end,
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'file_name', d.file_name,
                   'storage_path', d.storage_path, 'mine', d.uploaded_by_company = (select id from me),
                   'created_at', d.created_at) order by d.created_at)
                 from market_order_documents d where d.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('actor', e.actor, 'event', e.event, 'note', e.note,
                 'created_at', e.created_at) order by e.id)
               from market_order_events e where e.order_id = o.id), '[]'::jsonb)
  );
$$;
revoke execute on function public.order_for_me(public.market_orders) from public, anon, authenticated;

create or replace function public.get_my_orders() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(order_for_me(o) - 'events' order by o.updated_at desc), '[]'::jsonb)
  from market_orders o
  where my_company_id() is not null and my_company_id() in (o.buyer_company_id, o.seller_company_id);
$$;

create or replace function public.get_my_order(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select order_for_me(o) from market_orders o
  where o.id = p_id and my_company_id() is not null and my_company_id() in (o.buyer_company_id, o.seller_company_id);
$$;

revoke execute on function public.accept_order_internal(uuid, integer, numeric, text), public.order_event(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.is_order_party(text), public.can_see_buyer_files(text), public.country_allowed(text, text[], text),
  public.submit_order(jsonb), public.withdraw_order(uuid), public.answer_counter_offer(uuid, boolean),
  public.respond_to_order(uuid, text, jsonb), public.set_order_progress(uuid, text, text),
  public.add_order_document(uuid, text, text, text), public.get_my_orders(), public.get_my_order(uuid) from public, anon;
grant execute on function public.is_order_party(text), public.can_see_buyer_files(text), public.country_allowed(text, text[], text),
  public.submit_order(jsonb), public.withdraw_order(uuid), public.answer_counter_offer(uuid, boolean),
  public.respond_to_order(uuid, text, jsonb), public.set_order_progress(uuid, text, text),
  public.add_order_document(uuid, text, text, text), public.get_my_orders(), public.get_my_order(uuid) to authenticated;
