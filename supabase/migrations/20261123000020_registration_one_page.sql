-- Registration on one page (feedback 23.11.2026): applicants enter everything before confirming their
-- email. The application travels as user metadata ("application") and the files go to
-- pending/<user id>/ while the account is unconfirmed; after the first sign-in
-- claim_pending_application() creates the company and registers the files.
-- The anonymous seller description is no longer required.

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
    v_code, case when v_sell then nullif(left(v_desc, 1000), '') end,
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

-- May an unconfirmed, new account upload into pending/<its id>/? Used by the storage policy below.
create or replace function public.can_upload_pending(p_folder text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id::text = p_folder and u.email_confirmed_at is null and u.created_at > now() - interval '2 hours')
  and (select count(*) from storage.objects o
       where o.bucket_id = 'documents' and o.name like 'pending/' || p_folder || '/%') < 30;
$$;

-- The existing policies call helpers that anonymous visitors may not run: limit them to signed-in users,
-- so the pending upload below is evaluated on its own for anonymous applicants.
alter policy "documents admin all" on storage.objects to authenticated;
alter policy "documents customer upload" on storage.objects to authenticated;
alter policy "documents customer read" on storage.objects to authenticated;

create policy "documents pending upload" on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'pending'
    and public.can_upload_pending((storage.foldername(name))[2])
  );

-- After the first sign-in: turn the stored application into a company and register its files.
-- File names: pending/<user>/<kind>__<site index or x>__<category or x>__<timestamp>-<name>
create or replace function public.claim_pending_application() returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_app jsonb;
  v_res jsonb;
  v_company uuid;
  v_obj record;
  v_parts text[];
  v_site uuid;
  v_kind text;
  v_cat text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if (select company_id from profiles where id = v_uid) is not null then return null; end if;
  select raw_user_meta_data -> 'application' into v_app from auth.users where id = v_uid;
  if v_app is null or jsonb_typeof(v_app) <> 'object' then return null; end if;

  v_res := apply_for_access_v2(v_app);
  v_company := (v_res ->> 'company_id')::uuid;

  for v_obj in select name from storage.objects
               where bucket_id = 'documents' and name like 'pending/' || v_uid::text || '/%' loop
    v_parts := string_to_array(split_part(v_obj.name, '/', 3), '__');
    v_kind := v_parts[1];
    if v_kind not in ('registry_extract', 'wholesale_licence', 'manufacturing_licence', 'import_licence',
                      'gdp_certificate', 'iso13485', 'food_registration', 'md_import_licence', 'other') then
      v_kind := 'other';
    end if;
    v_site := case when v_parts[2] ~ '^[0-9]+$' then (v_res -> 'site_ids' ->> (v_parts[2]::int))::uuid end;
    v_cat := case when v_parts[3] in ('pharma', 'ivd', 'supplements', 'health') then v_parts[3] end;
    insert into documents (storage_path, file_name, doc_type, kind, site_id, category, company_id, uploaded_by)
    values (v_obj.name, left(regexp_replace(coalesce(v_parts[4], 'document'), '^[0-9]+-', ''), 200),
            case when v_kind in ('wholesale_licence', 'manufacturing_licence', 'import_licence', 'md_import_licence')
                 then 'license'::document_type
                 when v_kind = 'gdp_certificate' then 'gdp_certificate'::document_type
                 else 'other'::document_type end,
            v_kind, v_site, v_cat::product_category, v_company, v_uid)
    on conflict (storage_path) do nothing;
  end loop;

  update auth.users set raw_user_meta_data = raw_user_meta_data - 'application' where id = v_uid;
  return v_company;
end $$;

revoke execute on function public.can_upload_pending(text) from public;
grant execute on function public.can_upload_pending(text) to anon, authenticated;
revoke execute on function public.claim_pending_application() from public, anon;
grant execute on function public.claim_pending_application() to authenticated;
