-- Overview page (meeting 9 Nov 2026): recommend products the customer requested before and that are
-- available again. The customer's request lines now include the product id.

drop function public.get_my_request_items();
create function public.get_my_request_items()
returns table (
  id uuid, request_id uuid, offer_id uuid, product_id uuid, trade_name text, strength text, pack_size text,
  manufacturer text, batch text, expiry_date date, min_expiry_date date, requested_qty integer,
  unit_price_snapshot numeric, confirmed_qty integer, confirmed_unit_price numeric
)
language sql stable security definer set search_path = public as $$
  select i.id, i.request_id, i.offer_id, p.id, p.trade_name, p.strength, p.pack_size, m.name,
         o.batch, o.expiry_date, i.min_expiry_date, i.requested_qty, i.unit_price_snapshot,
         i.confirmed_qty, i.confirmed_unit_price
  from public.request_items i
  join public.requests r on r.id = i.request_id
  join public.offers o on o.id = i.offer_id
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where r.company_id = public.my_company_id();
$$;

revoke execute on function public.get_my_request_items() from public, anon;
grant execute on function public.get_my_request_items() to authenticated;
