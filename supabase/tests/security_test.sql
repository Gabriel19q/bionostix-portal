-- Security and workflow checks. Every failed expectation raises an exception.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@bionostix.de'),
  ('00000000-0000-0000-0000-00000000000c', 'buyer@sanicura.example'),
  ('00000000-0000-0000-0000-00000000000d', 'buyer@importer.example'),
  ('00000000-0000-0000-0000-00000000000e', 'pending@applicant.example');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
end $$;

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL (should have been refused): %', label;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok refused: % (%)', label, sqlerrm;
end $$;

create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Applicants request access ---------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.apply_for_access('Sanicura', 'Germany', 'Somewhere 1', 'eu_wholesaler', 'Buyer C', '+49 1');
select pg_temp.expect_error($$select public.apply_for_access('Again', 'DE', null, 'eu_wholesaler', null, null)$$, 'second application');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.apply_for_access('Iraq Importer', 'Iraq', null, 'importer', 'Buyer D', null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select public.apply_for_access('Pending Co', 'Lebanon', null, 'importer', 'Buyer E', null);
reset role;

-- Admin approves and lists stock ----------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.companies) = 3, 'admin sees all companies');
update public.companies set status = 'approved', verified_on = current_date, license_expires_on = current_date + 365,
  customer_group_id = (select id from public.customer_groups where name = 'EU Wholesale')
  where name = 'Sanicura';
update public.companies set status = 'approved', verified_on = current_date,
  customer_group_id = (select id from public.customer_groups where name = 'Export MENA')
  where name = 'Iraq Importer';
insert into public.manufacturers (name, country) values ('Test Pharma', 'Germany');
insert into public.products (trade_name, active_ingredient, strength, pack_size, manufacturer_id)
  select 'Testamol', 'paracetamol', '500 mg', '20 tablets', id from public.manufacturers;
insert into public.offers (product_id, batch, expiry_date, available_qty, moq, purchase_price)
  select id, 'B001', current_date + 400, 1000, 10, 10.00 from public.products;
insert into public.offers (product_id, batch, expiry_date, available_qty, moq, purchase_price)
  select id, 'B000-EXPIRED', current_date - 1, 50, 1, 9.00 from public.products;
reset role;

-- Approved EU customer -------------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.offers) = 0, 'customer cannot read offers table');
select pg_temp.expect((select count(*) from public.companies) = 0, 'customer cannot read companies table');
select pg_temp.expect((select count(*) from public.get_catalog()) = 1, 'catalog hides expired batch');
select pg_temp.expect((select unit_price from public.get_catalog()) = 10.80, 'EU price = 10.00 + 8%');
select pg_temp.expect_error($$select purchase_price from public.get_catalog()$$, 'purchase price not in catalog');
select pg_temp.expect((select can_request from public.get_my_company()), 'approved company can request');
select pg_temp.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'self-promotion to admin');
select pg_temp.expect_error($$update public.profiles set company_id = null where id = auth.uid()$$, 'changing own company');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog()), 'qty', 5)))$$,
  'quantity below MOQ');
select public.submit_request(
  jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog()), 'qty', 20)),
  'Please confirm by Friday', 'Germany');
select pg_temp.expect((select unit_price_snapshot from public.get_my_request_items()) = 10.80, 'price snapshot stored');
select pg_temp.expect((select count(*) from public.request_item_costs) = 0, 'customer cannot read cost snapshot');
select pg_temp.expect((select count(*) from public.get_my_request_history()) = 1, 'history logged on create');
-- A direct UPDATE is not an error under RLS, it just affects no rows
update public.requests set status = 'completed';
select pg_temp.expect((select status from public.get_my_requests()) = 'new', 'direct status update has no effect');
reset role;

-- Other customer sees own prices and nothing of Sanicura ------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select unit_price from public.get_catalog()) = 11.50, 'MENA price = 10.00 + 15%');
select pg_temp.expect((select count(*) from public.get_my_requests()) = 0, 'cannot see other company requests');
select pg_temp.expect((select count(*) from public.get_my_request_items()) = 0, 'cannot see other company items');
reset role;

-- Pending applicant -----------------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect((select count(*) from public.get_catalog()) = 0, 'pending applicant sees no catalog');
select pg_temp.expect(not (select can_request from public.get_my_company()), 'pending applicant cannot request');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', gen_random_uuid(), 'qty', 20)))$$,
  'pending applicant submits request');
reset role;

-- Workflow: offer -> accept -> no more cancelling ---------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.admin_set_request_status((select id from public.get_my_requests()), 'offer_sent')$$, 'customer uses admin function');
select pg_temp.expect_error($$select public.customer_respond((select id from public.get_my_requests()), true)$$, 'accept before offer');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_request_status((select id from public.requests), 'offer_sent', 'Offer for 20 packs');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.customer_respond((select id from public.get_my_requests()), true);
select pg_temp.expect((select status from public.get_my_requests()) = 'accepted', 'customer accepted offer');
select pg_temp.expect_error($$select public.customer_respond((select id from public.get_my_requests()), false)$$, 'cancel after accepting');
select pg_temp.expect((select count(*) from public.get_my_request_history()) = 3, 'three history entries');
select pg_temp.expect((select note from public.get_my_request_history() where new_status = 'offer_sent') = 'Offer for 20 packs', 'admin note stored');
reset role;

-- Storage ---------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into storage.objects (bucket_id, name)
  values ('documents', 'company/' || public.my_company_id() || '/licence.pdf');
select public.add_company_document('company/' || public.my_company_id() || '/licence.pdf', 'licence.pdf', 'license');
select pg_temp.expect_error(
  $$insert into storage.objects (bucket_id, name) values ('documents', 'company/' || gen_random_uuid() || '/x.pdf')$$,
  'upload into another company folder');
select pg_temp.expect_error(
  $$select public.add_company_document('company/' || gen_random_uuid() || '/x.pdf', 'x.pdf', 'license')$$,
  'register document of another company');
select pg_temp.expect_error(
  $$select public.add_company_document('company/' || public.my_company_id() || '/p.pdf', 'p.pdf', 'proforma')$$,
  'customer registers a proforma');
select pg_temp.expect((select count(*) from public.get_my_documents()) = 1, 'customer sees own document');
reset role;

-- Anonymous visitors ------------------------------------------------------------
set role anon;
select pg_temp.expect_error($$select * from public.get_catalog()$$, 'anon reads catalog');
select pg_temp.expect_error($$select * from public.products$$, 'anon reads products');
select pg_temp.expect_error($$select public.submit_request('[]'::jsonb)$$, 'anon submits request');
reset role;


-- Internal helpers are not callable anonymously ------------------------------------
set role anon;
select pg_temp.expect_error($$select public.is_admin()$$, 'anon calls is_admin');
select pg_temp.expect_error($$select public.get_my_company()$$, 'anon calls get_my_company');
reset role;
