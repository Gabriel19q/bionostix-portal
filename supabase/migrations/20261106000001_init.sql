-- Bionostix Germany B2B portal: core schema
-- Security model: base tables are admin-only via RLS.
-- Customers read through owner-run views that expose only safe columns,
-- and write through SECURITY DEFINER functions that validate every input.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'customer');
create type public.customer_type as enum ('eu_wholesaler', 'importer');
create type public.company_status as enum ('applied', 'approved', 'suspended', 'rejected');
create type public.request_status as enum (
  'new', 'in_review', 'offer_sent', 'accepted', 'proforma_sent',
  'paid', 'shipped', 'completed', 'declined', 'cancelled'
);
create type public.seller as enum ('bionostix_germany', 'sanicura', 'manufacturer');
create type public.document_type as enum (
  'license', 'gdp_certificate', 'coa', 'proforma', 'invoice', 'shipping', 'other'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_markup_pct numeric(6,2) not null check (default_markup_pct >= 0),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  address text,
  customer_type public.customer_type not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  status public.company_status not null default 'applied',
  customer_group_id uuid references public.customer_groups(id),
  license_expires_on date,
  verified_on date,
  verified_by uuid references auth.users(id),
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_needs_group check (status <> 'approved' or customer_group_id is not null)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'customer',
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.profiles (company_id);

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text,
  contact text,
  internal_note text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  trade_name text not null,
  active_ingredient text,
  strength text,
  dosage_form text,
  pack_size text,
  pzn text,
  manufacturer_id uuid not null references public.manufacturers(id),
  is_rx boolean not null default true,
  is_cold_chain boolean not null default false,
  is_narcotic boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index products_pzn_unique on public.products (pzn) where pzn is not null;

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  batch text not null,
  expiry_date date not null,
  available_qty integer not null check (available_qty >= 0),
  moq integer not null default 1 check (moq >= 1),
  purchase_price numeric(12,2) not null check (purchase_price >= 0),
  markup_override_pct numeric(6,2) check (markup_override_pct >= 0),
  incoterm text not null default 'EXW',
  stock_as_of date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, batch)
);

create sequence public.request_number_seq;

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique
    default ('REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.request_number_seq')::text, 4, '0')),
  company_id uuid not null references public.companies(id),
  created_by uuid references auth.users(id),
  status public.request_status not null default 'new',
  seller public.seller,
  customer_comment text,
  delivery_country text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.requests (company_id);

create table public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  offer_id uuid not null references public.offers(id),
  requested_qty integer not null check (requested_qty > 0),
  unit_price_snapshot numeric(12,2) not null,
  confirmed_qty integer check (confirmed_qty >= 0),
  confirmed_unit_price numeric(12,2) check (confirmed_unit_price >= 0)
);
create index on public.request_items (request_id);

-- Purchase price at request time: admin-only, kept apart from request_items
create table public.request_item_costs (
  request_item_id uuid primary key references public.request_items(id) on delete cascade,
  purchase_price_snapshot numeric(12,2) not null
);

create table public.request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  old_status public.request_status,
  new_status public.request_status not null,
  changed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index on public.request_status_history (request_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name text not null,
  doc_type public.document_type not null,
  company_id uuid references public.companies(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  request_id uuid references public.requests(id) on delete cascade,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint one_owner check (num_nonnulls(company_id, offer_id, request_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();
create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();
create trigger requests_touch before update on public.requests
  for each row execute function public.touch_updated_at();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- True when the caller's company is approved and its licence has not expired
create or replace function public.my_company_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    join public.profiles p on p.company_id = c.id
    where p.id = auth.uid()
      and c.status = 'approved'
      and (c.license_expires_on is null or c.license_expires_on >= current_date)
  );
$$;

create or replace function public.sell_price(purchase numeric, override_pct numeric, group_pct numeric)
returns numeric language sql immutable as $$
  select round(purchase * (1 + coalesce(override_pct, group_pct) / 100.0), 2);
$$;

-- New auth user -> profile row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every status change is logged, whoever makes it
create or replace function public.log_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.request_status_history (request_id, old_status, new_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.request_status_history (request_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger requests_log_status after insert or update of status on public.requests
  for each row execute function public.log_request_status();

-- ---------------------------------------------------------------------------
-- Row level security: admin-only on base tables, own profile readable
-- ---------------------------------------------------------------------------
alter table public.customer_groups enable row level security;
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.manufacturers enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.request_item_costs enable row level security;
alter table public.request_status_history enable row level security;
alter table public.documents enable row level security;

create policy admin_all on public.customer_groups for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.companies for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.manufacturers for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.offers for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.requests for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.request_items for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.request_item_costs for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.request_status_history for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.documents for all using (public.is_admin()) with check (public.is_admin());

create policy admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy own_profile_read on public.profiles for select using (id = auth.uid());
create policy own_profile_name on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid());
-- Customers may only change their own name, never role or company
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Anonymous visitors get nothing from the base tables
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Customer read views (owner-run: they bypass RLS and filter themselves)
-- ---------------------------------------------------------------------------
create view public.my_company as
  select c.id, c.name, c.country, c.address, c.customer_type, c.contact_name,
         c.contact_email, c.contact_phone, c.status, c.license_expires_on,
         public.my_company_active() as can_request
  from public.companies c
  where c.id = public.my_company_id();

create view public.customer_catalog as
  select o.id as offer_id, p.id as product_id, p.trade_name, p.active_ingredient, p.strength,
         p.dosage_form, p.pack_size, p.pzn, m.name as manufacturer,
         p.is_rx, p.is_cold_chain, p.is_narcotic,
         o.batch, o.expiry_date, o.available_qty, o.moq, o.incoterm, o.stock_as_of,
         public.sell_price(o.purchase_price, o.markup_override_pct, g.default_markup_pct) as unit_price
  from public.offers o
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  join public.companies c on c.id = public.my_company_id()
  join public.customer_groups g on g.id = c.customer_group_id
  where public.my_company_active()
    and o.is_active and o.available_qty > 0 and o.expiry_date > current_date;

create view public.my_requests as
  select r.id, r.number, r.status, r.seller, r.customer_comment, r.delivery_country,
         r.created_at, r.updated_at
  from public.requests r
  where r.company_id = public.my_company_id();

create view public.my_request_items as
  select i.id, i.request_id, i.offer_id, p.trade_name, p.strength, p.pack_size, m.name as manufacturer,
         o.batch, o.expiry_date, i.requested_qty, i.unit_price_snapshot,
         i.confirmed_qty, i.confirmed_unit_price
  from public.request_items i
  join public.requests r on r.id = i.request_id
  join public.offers o on o.id = i.offer_id
  join public.products p on p.id = o.product_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where r.company_id = public.my_company_id();

create view public.my_request_history as
  select h.id, h.request_id, h.old_status, h.new_status, h.note, h.created_at
  from public.request_status_history h
  join public.requests r on r.id = h.request_id
  where r.company_id = public.my_company_id();

create view public.my_documents as
  select d.id, d.storage_path, d.file_name, d.doc_type, d.company_id, d.offer_id, d.request_id, d.created_at
  from public.documents d
  where d.company_id = public.my_company_id()
     or d.request_id in (select id from public.requests where company_id = public.my_company_id())
     or (d.offer_id is not null and public.my_company_active());

revoke all on public.my_company, public.customer_catalog, public.my_requests,
  public.my_request_items, public.my_request_history, public.my_documents from anon;
grant select on public.my_company, public.customer_catalog, public.my_requests,
  public.my_request_items, public.my_request_history, public.my_documents to authenticated;

-- ---------------------------------------------------------------------------
-- Customer write functions
-- ---------------------------------------------------------------------------

-- Step 2 of the access request: company details. One company per applicant.
create or replace function public.apply_for_access(
  p_name text, p_country text, p_address text, p_customer_type public.customer_type,
  p_contact_name text, p_contact_phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if (select company_id from profiles where id = v_uid) is not null then
    raise exception 'access already requested';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_country), '') = '' then
    raise exception 'company name and country are required';
  end if;

  insert into companies (name, country, address, customer_type, contact_name, contact_email, contact_phone)
  values (trim(p_name), trim(p_country), p_address, p_customer_type, p_contact_name,
          (select email from profiles where id = v_uid), p_contact_phone)
  returning id into v_company;

  update profiles set company_id = v_company, full_name = coalesce(full_name, p_contact_name)
  where id = v_uid;
  return v_company;
end $$;

-- Register a file the customer uploaded into company/<their company id>/...
create or replace function public.add_company_document(
  p_storage_path text, p_file_name text, p_doc_type public.document_type
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
  v_id uuid;
begin
  if v_company is null then raise exception 'no company'; end if;
  if p_doc_type not in ('license', 'gdp_certificate', 'other') then
    raise exception 'document type not allowed';
  end if;
  if p_storage_path not like 'company/' || v_company::text || '/%' then
    raise exception 'invalid storage path';
  end if;
  insert into documents (storage_path, file_name, doc_type, company_id, uploaded_by)
  values (p_storage_path, p_file_name, p_doc_type, v_company, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Submit a request. p_items: [{"offer_id": "...", "qty": 10}, ...]
-- Prices are computed here, never taken from the browser.
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
begin
  if not my_company_active() then
    raise exception 'company not approved or licence expired';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  select g.default_markup_pct into v_group_pct
  from companies c join customer_groups g on g.id = c.customer_group_id
  where c.id = v_company;

  insert into requests (company_id, created_by, customer_comment, delivery_country)
  values (v_company, auth.uid(), p_comment, p_delivery_country)
  returning id into v_request;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    select * into v_offer from offers
    where id = (v_item ->> 'offer_id')::uuid
      and is_active and available_qty > 0 and expiry_date > current_date;
    if not found then raise exception 'offer not available'; end if;
    if v_qty is null or v_qty < v_offer.moq then
      raise exception 'quantity below minimum order quantity';
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

-- Customer accepts an offer, or cancels while the request is still open
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
    if v_status <> 'offer_sent' then raise exception 'nothing to accept yet'; end if;
    v_new := 'accepted';
  else
    if v_status not in ('new', 'in_review', 'offer_sent') then
      raise exception 'request can no longer be cancelled';
    end if;
    v_new := 'cancelled';
  end if;

  update requests set status = v_new where id = p_request_id;
  return v_new;
end $$;

-- Admin status change with an optional note for the history
create or replace function public.admin_set_request_status(
  p_request_id uuid, p_status public.request_status, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update requests set status = p_status where id = p_request_id;
  if not found then raise exception 'request not found'; end if;
  if p_note is not null then
    update request_status_history set note = p_note
    where id = (select max(id) from request_status_history where request_id = p_request_id);
  end if;
end $$;

revoke execute on function public.apply_for_access, public.add_company_document, public.submit_request,
  public.customer_respond, public.admin_set_request_status from public, anon;
grant execute on function public.apply_for_access, public.add_company_document, public.submit_request,
  public.customer_respond, public.admin_set_request_status to authenticated;

-- ---------------------------------------------------------------------------
-- Starting data
-- ---------------------------------------------------------------------------
insert into public.customer_groups (name, default_markup_pct) values
  ('EU Wholesale', 8),
  ('Export MENA', 15);
