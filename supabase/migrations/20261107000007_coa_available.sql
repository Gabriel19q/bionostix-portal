-- Whether a certificate of analysis (COA) can be supplied with a batch.
-- true = yes, false = no, NULL = not known yet / on request.

alter table public.offers add column coa_available boolean;

-- get_catalog gains a column, so it has to be recreated
drop function public.get_catalog();

create function public.get_catalog()
returns table (
  offer_id uuid, product_id uuid, trade_name text, active_ingredient text, strength text,
  dosage_form text, pack_size text, pzn text, manufacturer text,
  is_rx boolean, is_cold_chain boolean, is_narcotic boolean,
  batch text, expiry_date date, available_qty integer, moq integer, incoterm text,
  stock_as_of date, unit_price numeric, coa_available boolean
)
language sql stable security definer set search_path = public as $$
  select o.id, p.id, p.trade_name, p.active_ingredient, p.strength,
         p.dosage_form, p.pack_size, p.pzn, m.name,
         p.is_rx, p.is_cold_chain, p.is_narcotic,
         o.batch, o.expiry_date, o.available_qty, o.moq, o.incoterm, o.stock_as_of,
         case when o.purchase_price is null then null
              else public.sell_price(o.purchase_price, o.markup_override_pct, g.default_markup_pct) end,
         o.coa_available
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

revoke execute on function public.get_catalog from public, anon;
grant execute on function public.get_catalog to authenticated;
