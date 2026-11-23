-- Marketplace, stage 1a: registration as buyer and/or seller, product categories,
-- company sites (countries), detailed document kinds and recorded consents.
-- New tables are admin-only (RLS); applicants write through apply_for_access_v2 and
-- add_company_document_v2 and read through get_my_account. Nothing existing is dropped.

create type public.product_category as enum ('pharma', 'ivd', 'supplements', 'health');
create type public.approval_status as enum ('applied', 'approved', 'rejected');

-- Companies: roles, seller profile, VAT ID -------------------------------------
alter table public.companies alter column customer_type drop not null;
alter table public.companies drop constraint approved_needs_group;
alter table public.companies
  add column vat_id text,
  add column wants_buy boolean not null default true,
  add column wants_sell boolean not null default false,
  add column buy_status public.approval_status,
  add column sell_status public.approval_status,
  add column seller_code text unique,
  add column seller_description text,
  add column commission_pct numeric(5,2) check (commission_pct >= 0 and commission_pct <= 100),
  add column eudamed_srn text,
  add column ivdr_duties_confirmed_at timestamptz,
  add constraint wants_a_role check (wants_buy or wants_sell);

-- Existing (test) companies become buyers with their current status
update public.companies set buy_status = case status
  when 'approved' then 'approved'::public.approval_status
  when 'rejected' then 'rejected'::public.approval_status
  else 'applied'::public.approval_status end;

-- Sites: one or more countries per company, each verified on its own ---------
create table public.company_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  country text not null check (length(trim(country)) > 0),
  address text,
  status public.approval_status not null default 'applied',
  licence_valid_until date,
  created_at timestamptz not null default now()
);
create index on public.company_sites (company_id);

insert into public.company_sites (company_id, country, address, status, licence_valid_until)
select id, country, address,
       case status when 'approved' then 'approved'::public.approval_status
                   when 'rejected' then 'rejected'::public.approval_status
                   else 'applied'::public.approval_status end,
       license_expires_on
from public.companies;

-- Categories a company wants to buy and/or sell, each approved on its own ----
create table public.company_categories (
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('buy', 'sell')),
  category public.product_category not null,
  status public.approval_status not null default 'applied',
  created_at timestamptz not null default now(),
  primary key (company_id, role, category)
);

-- Existing (test) buyers keep pharma
insert into public.company_categories (company_id, role, category, status)
select id, 'buy', 'pharma', buy_status from public.companies;

-- Consents: who accepted which version of which text, and when ---------------
create table public.consents (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('terms', 'confidentiality', 'commission', 'newsletter')),
  version text not null,
  accepted_at timestamptz not null default now(),
  -- newsletter only: double opt-in confirmation via e-mail link
  confirm_token uuid unique default gen_random_uuid(),
  confirmed_at timestamptz,
  withdrawn_at timestamptz
);
create index on public.consents (user_id);
create index on public.consents (company_id);

-- Documents: finer kind, optional site and category --------------------------
alter table public.documents
  add column kind text check (kind in (
    'registry_extract', 'wholesale_licence', 'manufacturing_licence', 'import_licence',
    'gdp_certificate', 'iso13485', 'food_registration', 'md_import_licence', 'other')),
  add column site_id uuid references public.company_sites(id) on delete set null,
  add column category public.product_category;

update public.documents set kind = case doc_type
  when 'license' then 'wholesale_licence'
  when 'gdp_certificate' then 'gdp_certificate'
  else 'other' end
where company_id is not null;

alter table public.company_sites enable row level security;
alter table public.company_categories enable row level security;
alter table public.consents enable row level security;
create policy admin_all on public.company_sites for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.company_categories for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.consents for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.company_sites, public.company_categories, public.consents from anon;

-- ---------------------------------------------------------------------------
-- Apply for access (buyer and/or seller). p is a JSON object:
-- {name, address, contact_name, phone, vat_id, wants_buy, wants_sell,
--  sites: [{country, address}], buy_categories: ["pharma", ...], sell_categories: [...], seller_description,
--  eudamed_srn, ivdr_confirmed, version, consents: {terms, confidentiality, commission, newsletter}}
-- Returns {company_id, site_ids}.
-- ---------------------------------------------------------------------------
create or replace function public.apply_for_access_v2(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_buy boolean := coalesce((p ->> 'wants_buy')::boolean, false);
  v_sell boolean := coalesce((p ->> 'wants_sell')::boolean, false);
  v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '[\s().\/-]', '', 'g');
  v_version text := left(coalesce(p ->> 'version', ''), 50);
  v_sites jsonb := coalesce(p -> 'sites', '[]'::jsonb);
  v_cats jsonb := coalesce(p -> 'sell_categories', '[]'::jsonb);
  v_buy_cats jsonb := coalesce(p -> 'buy_categories', '[]'::jsonb);
  v_desc text := trim(coalesce(p ->> 'seller_description', ''));
  v_site jsonb;
  v_site_ids uuid[] := '{}';
  v_site_id uuid;
  v_cat text;
  v_code text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if (select company_id from profiles where id = v_uid) is not null then
    raise exception 'access already requested';
  end if;
  if length(trim(coalesce(p ->> 'name', ''))) = 0 then raise exception 'company name is required'; end if;
  if length(trim(coalesce(p ->> 'contact_name', ''))) = 0 then raise exception 'contact person is required'; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone number must be in international format';
  end if;
  if not (v_buy or v_sell) then raise exception 'choose buy and/or sell'; end if;
  if v_version = '' then raise exception 'version of the accepted terms is missing'; end if;

  if jsonb_typeof(v_sites) <> 'array' or jsonb_array_length(v_sites) = 0 then
    raise exception 'at least one site (country) is required';
  end if;
  if jsonb_array_length(v_sites) > 20 then raise exception 'too many sites'; end if;
  for v_site in select * from jsonb_array_elements(v_sites) loop
    if length(trim(coalesce(v_site ->> 'country', ''))) = 0 then
      raise exception 'every site needs a country';
    end if;
  end loop;

  if coalesce((p -> 'consents' ->> 'terms')::boolean, false) is not true
     or coalesce((p -> 'consents' ->> 'confidentiality')::boolean, false) is not true then
    raise exception 'terms of use and confidentiality must be accepted';
  end if;

  if v_buy then
    if jsonb_typeof(v_buy_cats) <> 'array' or jsonb_array_length(v_buy_cats) = 0 then
      raise exception 'buyers must choose at least one category';
    end if;
    for v_cat in select jsonb_array_elements_text(v_buy_cats) loop
      if v_cat not in ('pharma', 'ivd', 'supplements', 'health') then
        raise exception 'unknown category';
      end if;
    end loop;
  end if;

  if v_sell then
    if jsonb_typeof(v_cats) <> 'array' or jsonb_array_length(v_cats) = 0 then
      raise exception 'sellers must choose at least one category';
    end if;
    for v_cat in select jsonb_array_elements_text(v_cats) loop
      if v_cat not in ('pharma', 'ivd', 'supplements', 'health') then
        raise exception 'unknown category';
      end if;
    end loop;
    if length(v_desc) < 20 or length(v_desc) > 1000 then
      raise exception 'seller description must have 20 to 1000 characters';
    end if;
    if coalesce((p -> 'consents' ->> 'commission')::boolean, false) is not true then
      raise exception 'sellers must accept the commission agreement';
    end if;
    if v_cats ? 'ivd' and coalesce((p ->> 'ivdr_confirmed')::boolean, false) is not true then
      raise exception 'IVD sellers must confirm the distributor obligations under the IVDR';
    end if;
    -- Anonymous seller number shown to buyers, e.g. S-48213
    loop
      v_code := 'S-' || (10000 + floor(random() * 90000))::int;
      exit when not exists (select 1 from companies where seller_code = v_code);
    end loop;
  end if;

  insert into companies (
    name, country, address, contact_name, contact_email, contact_phone, vat_id,
    wants_buy, wants_sell, buy_status, sell_status, seller_code, seller_description,
    eudamed_srn, ivdr_duties_confirmed_at)
  values (
    trim(p ->> 'name'), trim(v_sites -> 0 ->> 'country'), nullif(trim(coalesce(p ->> 'address', '')), ''),
    trim(p ->> 'contact_name'), (select email from profiles where id = v_uid), trim(p ->> 'phone'),
    nullif(trim(coalesce(p ->> 'vat_id', '')), ''),
    v_buy, v_sell,
    case when v_buy then 'applied'::approval_status end,
    case when v_sell then 'applied'::approval_status end,
    v_code, case when v_sell then v_desc end,
    case when v_sell then nullif(trim(coalesce(p ->> 'eudamed_srn', '')), '') end,
    case when v_sell and v_cats ? 'ivd' then now() end)
  returning id into v_company;

  for v_site in select * from jsonb_array_elements(v_sites) loop
    insert into company_sites (company_id, country, address)
    values (v_company, trim(v_site ->> 'country'), nullif(trim(coalesce(v_site ->> 'address', '')), ''))
    returning id into v_site_id;
    v_site_ids := v_site_ids || v_site_id;
  end loop;

  if v_buy then
    insert into company_categories (company_id, role, category)
    select distinct v_company, 'buy', c::product_category from jsonb_array_elements_text(v_buy_cats) c;
  end if;
  if v_sell then
    insert into company_categories (company_id, role, category)
    select distinct v_company, 'sell', c::product_category from jsonb_array_elements_text(v_cats) c;
  end if;

  insert into consents (company_id, user_id, kind, version, confirm_token)
  select v_company, v_uid, k, v_version, case when k = 'newsletter' then gen_random_uuid() end
  from unnest(array['terms', 'confidentiality', 'commission', 'newsletter']) k
  where (k in ('terms', 'confidentiality'))
     or (k = 'commission' and v_sell)
     or (k = 'newsletter' and coalesce((p -> 'consents' ->> 'newsletter')::boolean, false));

  update profiles set company_id = v_company, full_name = coalesce(full_name, trim(p ->> 'contact_name'))
  where id = v_uid;

  return jsonb_build_object('company_id', v_company, 'site_ids', to_jsonb(v_site_ids));
end $$;

-- Register a file the applicant uploaded into company/<their company id>/...
create or replace function public.add_company_document_v2(
  p_storage_path text, p_file_name text, p_kind text,
  p_site_id uuid default null, p_category public.product_category default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := my_company_id();
  v_id uuid;
begin
  if v_company is null then raise exception 'no company'; end if;
  if p_kind not in ('registry_extract', 'wholesale_licence', 'manufacturing_licence', 'import_licence',
                    'gdp_certificate', 'iso13485', 'food_registration', 'md_import_licence', 'other') then
    raise exception 'document type not allowed';
  end if;
  if p_storage_path not like 'company/' || v_company::text || '/%' then
    raise exception 'invalid storage path';
  end if;
  if p_site_id is not null and not exists (
    select 1 from company_sites where id = p_site_id and company_id = v_company) then
    raise exception 'unknown site';
  end if;
  insert into documents (storage_path, file_name, doc_type, kind, site_id, category, company_id, uploaded_by)
  values (p_storage_path, left(p_file_name, 200),
          case when p_kind in ('wholesale_licence', 'manufacturing_licence', 'import_licence', 'md_import_licence')
               then 'license'::document_type
               when p_kind = 'gdp_certificate' then 'gdp_certificate'::document_type
               else 'other'::document_type end,
          p_kind, p_site_id, p_category, v_company, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Everything the signed-in user may see about their own company.
-- Commission rate only for sellers; never internal notes.
create or replace function public.get_my_account() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'address', c.address, 'vat_id', c.vat_id,
      'contact_name', c.contact_name, 'contact_email', c.contact_email, 'contact_phone', c.contact_phone,
      'status', c.status, 'wants_buy', c.wants_buy, 'wants_sell', c.wants_sell,
      'buy_status', c.buy_status, 'sell_status', c.sell_status,
      'seller_code', case when c.wants_sell then c.seller_code end,
      'seller_description', case when c.wants_sell then c.seller_description end,
      'commission_pct', case when c.wants_sell and c.sell_status = 'approved' then c.commission_pct end,
      'eudamed_srn', c.eudamed_srn),
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'country', s.country, 'address', s.address,
        'status', s.status, 'licence_valid_until', s.licence_valid_until) order by s.created_at)
      from company_sites s where s.company_id = c.id), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'role', k.role, 'category', k.category, 'status', k.status) order by k.role, k.category)
      from company_categories k where k.company_id = c.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'file_name', d.file_name, 'kind', d.kind, 'site_id', d.site_id,
        'category', d.category, 'created_at', d.created_at) order by d.created_at)
      from documents d where d.company_id = c.id), '[]'::jsonb),
    'newsletter', (select case when n.confirmed_at is not null then 'confirmed' else 'pending' end
      from consents n where n.user_id = auth.uid() and n.kind = 'newsletter' and n.withdrawn_at is null
      order by n.accepted_at desc limit 1)
  ) end
  from profiles p left join companies c on c.id = p.company_id
  where p.id = auth.uid();
$$;

-- Newsletter double opt-in: the confirmation e-mail carries this token.
create or replace function public.get_newsletter_token() returns uuid
language sql stable security definer set search_path = public as $$
  select confirm_token from consents
  where user_id = auth.uid() and kind = 'newsletter' and confirmed_at is null and withdrawn_at is null
  order by accepted_at desc limit 1;
$$;

-- Called from the link in the confirmation e-mail (signed in as the same user)
create or replace function public.confirm_newsletter(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_found boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update consents set confirmed_at = now()
  where confirm_token = p_token and user_id = auth.uid() and kind = 'newsletter'
    and confirmed_at is null and withdrawn_at is null;
  get diagnostics v_found = row_count;
  return v_found or exists (select 1 from consents where confirm_token = p_token
    and user_id = auth.uid() and confirmed_at is not null);
end $$;

revoke execute on function public.get_newsletter_token(), public.confirm_newsletter(uuid) from public, anon;
grant execute on function public.get_newsletter_token(), public.confirm_newsletter(uuid) to authenticated;

revoke execute on function public.apply_for_access_v2(jsonb),
  public.add_company_document_v2(text, text, text, uuid, public.product_category),
  public.get_my_account() from public, anon;
grant execute on function public.apply_for_access_v2(jsonb),
  public.add_company_document_v2(text, text, text, uuid, public.product_category),
  public.get_my_account() to authenticated;
