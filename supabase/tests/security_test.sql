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
select public.apply_for_access('Sanicura', 'Germany', 'Somewhere 1', 'eu_wholesaler', 'Buyer C', '+49 7151 123456');
select pg_temp.expect_error($$select public.apply_for_access('Again', 'DE', null, 'eu_wholesaler', null, null)$$, 'second application');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.apply_for_access('Iraq Importer', 'Iraq', null, 'importer', 'Buyer D', '0176 123456')$$, 'phone without country code');
select public.apply_for_access('Iraq Importer', 'Iraq', null, 'importer', 'Buyer D', '+964 770 123 4567');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select public.apply_for_access('Pending Co', 'Lebanon', null, 'importer', 'Buyer E', '+961 1 234567');
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
insert into public.offers (product_id, batch, expiry_date, available_qty, moq, purchase_price, coa_available)
  select id, 'B001', current_date + 400, 1000, 10, 10.00, true from public.products;
insert into public.offers (product_id, batch, expiry_date, available_qty, moq, purchase_price)
  select id, 'B000-EXPIRED', current_date - 1, 50, 1, 9.00 from public.products;
insert into public.products (trade_name, manufacturer_id)
  select 'Upon Request Product', id from public.manufacturers;
insert into public.offers (product_id, moq)
  select id, 100 from public.products where trade_name = 'Upon Request Product';
reset role;

-- Approved EU customer -------------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.offers) = 0, 'customer cannot read offers table');
select pg_temp.expect((select count(*) from public.companies) = 0, 'customer cannot read companies table');
select pg_temp.expect((select count(*) from public.get_catalog()) = 2, 'catalog hides expired batch, shows on-request row');
select pg_temp.expect((select unit_price is null and available_qty is null and expiry_date is null and batch = ''
  from public.get_catalog() where trade_name = 'Upon Request Product'), 'on-request row has no price, qty, expiry, batch');
select pg_temp.expect((select unit_price from public.get_catalog() where batch = 'B001') = 10.80, 'EU price = 10.00 + 8%');
select pg_temp.expect((select coa_available from public.get_catalog() where batch = 'B001'), 'customer sees COA availability');
select pg_temp.expect_error($$select purchase_price from public.get_catalog()$$, 'purchase price not in catalog');
select pg_temp.expect((select can_request from public.get_my_company()), 'approved company can request');
select pg_temp.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'self-promotion to admin');
select pg_temp.expect_error($$update public.profiles set company_id = null where id = auth.uid()$$, 'changing own company');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 5)), null, 'Germany', current_date + 30)$$,
  'quantity below MOQ');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 5000)), null, 'Germany', current_date + 30)$$,
  'quantity above available stock');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(
      jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20),
      jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20)), null, 'Germany', current_date + 30)$$,
  'same batch twice');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20)), null, 'Germany', null)$$,
  'delivery deadline missing');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20)), null, 'Germany', current_date)$$,
  'delivery deadline not in the future');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20)), null, '', current_date + 30)$$,
  'delivery country missing');
select public.submit_request(
  jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20,
    'min_expiry', (current_date + 400)::text)),
  'Please confirm by Friday', 'Germany', current_date + 30);
select pg_temp.expect((select delivery_deadline from public.get_my_requests()) = current_date + 30, 'delivery deadline stored');
select pg_temp.expect((select min_expiry_date is null from public.get_my_request_items()), 'min expiry ignored where batch has an expiry date');
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
select pg_temp.expect((select unit_price from public.get_catalog() where batch = 'B001') = 11.50, 'MENA price = 10.00 + 15%');
select pg_temp.expect((select count(*) from public.get_my_requests()) = 0, 'cannot see other company requests');
select pg_temp.expect((select count(*) from public.get_my_request_items()) = 0, 'cannot see other company items');
reset role;

-- Pending applicant -----------------------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect((select count(*) from public.get_catalog()) = 0, 'pending applicant sees no catalog');
select pg_temp.expect(not (select can_request from public.get_my_company()), 'pending applicant cannot request');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', gen_random_uuid(), 'qty', 20)), null, 'Lebanon', current_date + 30)$$,
  'pending applicant submits request');
reset role;

-- Workflow: changes proposed -> customer accepts = order confirmed -> no more cancelling
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.admin_set_request_status((select id from public.get_my_requests()), 'changes_proposed')$$, 'customer uses admin function');
select pg_temp.expect_error($$select public.customer_respond((select id from public.get_my_requests()), true)$$, 'accept before changes are proposed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_request_status((select id from public.requests), 'in_review');
select public.admin_set_request_status((select id from public.requests), 'changes_proposed', 'Only 15 packs available');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.customer_respond((select id from public.get_my_requests()), true);
select pg_temp.expect((select status from public.get_my_requests()) = 'changes_accepted', 'customer accepted changes');
select pg_temp.expect((select count(*) from public.get_my_request_history()) = 4, 'four history entries');
select pg_temp.expect((select note from public.get_my_request_history() where new_status = 'changes_proposed') = 'Only 15 packs available', 'admin note stored');
select pg_temp.expect(
  (select array_agg(new_status::text order by created_at, id) from public.get_my_request_history())
    = array['new', 'in_review', 'changes_proposed', 'changes_accepted'],
  'history in time order');
select pg_temp.expect(
  (select count(distinct created_at) from public.get_my_request_history()) = 4, 'every history entry has its own timestamp');
-- Proforma = order confirmation: needs the payment deadline and the uploaded proforma
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.admin_set_request_status((select id from public.requests), 'proforma_sent')$$, 'proforma without payment deadline');
update public.requests set payment_due_date = current_date + 3;
select pg_temp.expect_error($$select public.admin_set_request_status((select id from public.requests), 'proforma_sent')$$, 'proforma without document');
insert into public.documents (storage_path, file_name, doc_type, request_id)
  select 'request/' || id || '/pi.pdf', 'pi.pdf', 'proforma', id from public.requests;
select public.admin_set_request_status((select id from public.requests), 'proforma_sent');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select payment_due_date from public.get_my_requests()) = current_date + 3, 'customer sees payment deadline');
select pg_temp.expect_error($$select public.customer_respond((select id from public.get_my_requests()), false)$$, 'cancel after proforma (order confirmation)');
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
select pg_temp.expect((select count(*) from public.get_my_documents() where company_id is not null) = 1, 'customer sees own document');
reset role;

-- Request documents: admin uploads a proforma, only the requesting company can read it
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name)
  select 'documents', 'request/' || id || '/proforma.pdf' from public.requests limit 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from storage.objects where name like 'request/%') = 1, 'customer reads own request document');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from storage.objects where name like 'request/%') = 0, 'other customer cannot read it');
select pg_temp.expect((select count(*) from storage.objects where name like 'company/%') = 0, 'other customer cannot read licence');
reset role;

-- On-request rows can be requested: no stock limit, MOQ still applies, price stays open
-- The on-request product is sold by Bionostix Germany, Testamol by Sanicura (default): one order is split per seller
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.products set seller = 'bionostix_germany' where trade_name = 'Upon Request Product';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select seller from public.get_catalog() where batch = 'B001') = 'sanicura', 'catalog shows seller, default Sanicura');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where trade_name = 'Upon Request Product'), 'qty', 50)), null, 'Iraq', current_date + 30)$$,
  'on-request row below MOQ');
select pg_temp.expect_error(
  $$select public.submit_request(jsonb_build_array(jsonb_build_object(
    'offer_id', (select offer_id from public.get_catalog() where trade_name = 'Upon Request Product'), 'qty', 5000,
    'min_expiry', current_date::text)), null, 'Iraq', current_date + 30)$$,
  'minimum expiry in the past');
select pg_temp.expect(array_length(public.submit_request(jsonb_build_array(
  jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where trade_name = 'Upon Request Product'), 'qty', 5000,
    'min_expiry', (current_date + 365)::text),
  jsonb_build_object('offer_id', (select offer_id from public.get_catalog() where batch = 'B001'), 'qty', 20)),
  null, 'Iraq', current_date + 30), 1) = 2, 'mixed sellers: two request ids returned');
select pg_temp.expect((select count(*) from public.get_my_requests()) = 2, 'one request per seller');
select pg_temp.expect((select array_agg(seller::text order by seller::text) from public.get_my_requests())
  = array['bionostix_germany', 'sanicura'], 'each request carries its seller');
select pg_temp.expect((select count(*) from public.get_my_request_items()) = 2, 'every line in exactly one request');
select pg_temp.expect((select min_expiry_date from public.get_my_request_items() where trade_name = 'Upon Request Product') = current_date + 365, 'min expiry stored for line without expiry date');
select pg_temp.expect((select unit_price_snapshot is null from public.get_my_request_items() where trade_name = 'Upon Request Product'), 'on-request price stays open');
reset role;

-- Usage tracking
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.log_activity('login');
select public.log_activity('view_catalog', '/portal');
select public.log_activity('export', '/portal', '{"rows": 12}'::jsonb);
select pg_temp.expect_error($$select public.log_activity('hack')$$, 'unknown activity event');
select pg_temp.expect((select count(*) from public.activity_log) = 0, 'customer cannot read activity log');
select pg_temp.expect((select count(*) from public.admin_activity_overview()) = 0, 'customer gets no overview');
select pg_temp.expect_error($$insert into public.activity_log (user_id, event) values (auth.uid(), 'login')$$, 'customer cannot insert directly');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.log_activity('view_catalog');
select pg_temp.expect((select count(*) from public.activity_log) = 3, 'admin activity is not logged, customer activity is');
select pg_temp.expect((select visits_30d from public.admin_activity_overview() where email = 'buyer@sanicura.example') = 1, 'three events = one visit');
select pg_temp.expect((select exports_30d from public.admin_activity_overview() where email = 'buyer@sanicura.example') = 1, 'export counted');
reset role;
set role anon;
select pg_temp.expect_error($$select public.log_activity('login')$$, 'anon cannot log');
reset role;

-- Assigning users to companies
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$select public.admin_assign_user_company(auth.uid(), (select id from public.get_my_company()))$$, 'customer cannot assign users');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_assign_user_company('00000000-0000-0000-0000-00000000000e', (select id from public.companies where name = 'Sanicura'));
select pg_temp.expect_error($$select public.admin_assign_user_company('00000000-0000-0000-0000-00000000000a', (select id from public.companies where name = 'Sanicura'))$$, 'admin not assignable to a company');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect((select name from public.get_my_company()) = 'Sanicura', 'moved user now belongs to Sanicura');
select pg_temp.expect((select count(*) from public.get_my_requests()) = 1, 'and sees Sanicura requests');
reset role;

-- Anonymous visitors ------------------------------------------------------------
set role anon;
select pg_temp.expect_error($$select * from public.get_catalog()$$, 'anon reads catalog');
select pg_temp.expect_error($$select * from public.products$$, 'anon reads products');
select pg_temp.expect_error($$select public.submit_request('[]'::jsonb, null, 'Germany', current_date + 30)$$, 'anon submits request');
reset role;


-- Internal helpers are not callable anonymously ------------------------------------
set role anon;
select pg_temp.expect_error($$select public.is_admin()$$, 'anon calls is_admin');
select pg_temp.expect_error($$select public.get_my_company()$$, 'anon calls get_my_company');
reset role;
