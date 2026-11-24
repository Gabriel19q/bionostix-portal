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
select pg_temp.expect((select count(distinct product_id) from public.get_my_request_items()) = 2, 'request lines carry the product');
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

-- Markets per offer and offer validity (18 Nov 2026) ------------------------------------------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.products (trade_name, manufacturer_id, seller)
  select 'Market Product', id, 'bionostix_germany' from public.manufacturers where name = 'Test Pharma';
insert into public.offers (product_id, batch, expiry_date, available_qty, moq, purchase_price, market_mode, market_countries, valid_until)
  select p.id, v.batch, current_date + 200, 100, 1, 5.00, v.mode, v.countries, v.valid
  from public.products p,
       (values ('M-ONLY-IRAQ', 'only', array['Iraq'], null::date),
               ('M-EXCEPT-DE', 'except', array['Germany'], null::date),
               ('M-OFFER-EXPIRED', 'all', '{}'::text[], current_date - 1),
               ('M-VALID', 'all', '{}'::text[], current_date + 10)) as v(batch, mode, countries, valid)
  where p.trade_name = 'Market Product';
reset role;
create temp table market_ids as select batch, id from public.offers where batch like 'M-%';
grant select on market_ids to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- Sanicura, Germany
select pg_temp.expect((select array_agg(batch order by batch) from public.get_catalog() where trade_name = 'Market Product')
  = array['M-VALID'], 'German buyer: only-Iraq, except-Germany and expired offers are hidden');
select pg_temp.expect((select valid_until from public.get_catalog() where batch = 'M-VALID') = current_date + 10, 'catalog shows valid until');
select pg_temp.expect_error($$select market_countries from public.get_catalog()$$, 'market list stays internal');
select pg_temp.expect_error($$select public.submit_request(jsonb_build_array(jsonb_build_object(
  'offer_id', (select id from market_ids where batch = 'M-EXCEPT-DE'), 'qty', 5)), null, 'Iraq', current_date + 30)$$,
  'German buyer cannot order an offer excluded for Germany (even with another delivery country)');
select pg_temp.expect_error($$select public.submit_request(jsonb_build_array(jsonb_build_object(
  'offer_id', (select id from market_ids where batch = 'M-OFFER-EXPIRED'), 'qty', 5)), null, 'Germany', current_date + 30)$$,
  'offer past its validity cannot be ordered');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Iraq Importer
select pg_temp.expect((select array_agg(batch order by batch) from public.get_catalog() where trade_name = 'Market Product')
  = array['M-EXCEPT-DE', 'M-ONLY-IRAQ', 'M-VALID'], 'Iraqi buyer sees offers allowed for Iraq');
select pg_temp.expect_error($$select public.submit_request(jsonb_build_array(jsonb_build_object(
  'offer_id', (select id from market_ids where batch = 'M-EXCEPT-DE'), 'qty', 5)), null, 'Germany', current_date + 30)$$,
  'delivery into an excluded country is refused');
select pg_temp.expect_error($$select public.submit_request(jsonb_build_array(jsonb_build_object(
  'offer_id', (select id from market_ids where batch = 'M-ONLY-IRAQ'), 'qty', 5)), null, 'Lebanon', current_date + 30)$$,
  'delivery outside the allowed countries is refused');
select pg_temp.expect(array_length(public.submit_request(jsonb_build_array(jsonb_build_object(
  'offer_id', (select id from market_ids where batch = 'M-ONLY-IRAQ'), 'qty', 5)), null, 'Iraq', current_date + 30), 1) = 1,
  'delivery into an allowed country works');
reset role;

-- Sourcing requests (18 Nov 2026) -------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'pending2@applicant.example');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select public.apply_for_access('Pending Two', 'Jordan', null, 'importer', 'Buyer F', '+962 6 1234567');
select pg_temp.expect_error($$select public.submit_sourcing_request('Product X', null, null, null, null, 'Jordan')$$,
  'unapproved company cannot send sourcing requests');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(public.submit_sourcing_request('Metformin 1000 mg', E'Tender list:\n1. Metformin 1000 mg x 180', '5,000 packs', 'max. EUR 4', current_date + 60, 'Germany') is not null,
  'approved customer sends a sourcing request');
select public.log_activity('submit_sourcing', '/portal/sourcing');
select pg_temp.expect((select count(*) from public.get_my_sourcing_requests()) = 1, 'customer sees own sourcing request');
select pg_temp.expect((select number like 'SRC-%' and status = 'open' from public.get_my_sourcing_requests()), 'numbered and open');
select pg_temp.expect((select count(*) from public.sourcing_requests) = 0, 'customer cannot read the sourcing table');
select pg_temp.expect_error($$select internal_note from public.get_my_sourcing_requests()$$, 'internal note not exposed');
select pg_temp.expect_error($$insert into public.sourcing_requests (company_id, product, delivery_country) values ((select id from public.get_my_company()), 'x', 'Germany')$$,
  'customer cannot insert directly');
select pg_temp.expect_error($$select public.submit_sourcing_request('  ', null, null, null, null, 'Germany')$$, 'product required');
select pg_temp.expect_error($$select public.submit_sourcing_request('X', null, null, null, current_date, 'Germany')$$, 'needed-by date in the past');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.get_my_sourcing_requests()) = 0, 'other company does not see it');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.sourcing_requests set status = 'offered', reply = 'We can offer 5,000 packs.', internal_note = 'cost EUR 2.10';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select status = 'offered' and reply = 'We can offer 5,000 packs.' from public.get_my_sourcing_requests()),
  'customer sees status and reply');
reset role;
set role anon;
select pg_temp.expect_error($$select public.submit_sourcing_request('X', null, null, null, null, 'Germany')$$, 'anon sends sourcing request');
select pg_temp.expect_error($$select * from public.get_my_sourcing_requests()$$, 'anon reads sourcing requests');
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

-- Marketplace registration (stage 1a) -----------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'seller@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'buyer2@example.test');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect_error($$select public.apply_for_access_v2('{"name":"Seller Co","contact_name":"S","phone":"+49 711 123456","wants_sell":true,"version":"t1","sites":[{"country":"Germany"}],"sell_categories":["pharma"],"seller_description":"EU wholesaler with broad portfolio","consents":{"terms":true,"confidentiality":true}}'::jsonb)$$, 'seller without commission consent');
select pg_temp.expect_error($$select public.apply_for_access_v2('{"name":"Seller Co","contact_name":"S","phone":"+49 711 123456","wants_sell":true,"version":"t1","sites":[{"country":"Germany"}],"sell_categories":["ivd"],"seller_description":"EU wholesaler with broad portfolio","consents":{"terms":true,"confidentiality":true,"commission":true}}'::jsonb)$$, 'IVD seller without IVDR confirmation');
select pg_temp.expect_error($$select public.apply_for_access_v2('{"name":"Seller Co","contact_name":"S","phone":"+49 711 123456","wants_sell":true,"version":"t1","sites":[],"sell_categories":["pharma"],"seller_description":"EU wholesaler with broad portfolio","consents":{"terms":true,"confidentiality":true,"commission":true}}'::jsonb)$$, 'no site');
select pg_temp.expect_error($$select public.apply_for_access_v2('{"name":"Seller Co","contact_name":"S","phone":"+49 711 123456","wants_sell":true,"version":"t1","sites":[{"country":"Germany"}],"sell_categories":["weapons"],"seller_description":"EU wholesaler with broad portfolio","consents":{"terms":true,"confidentiality":true,"commission":true}}'::jsonb)$$, 'unknown category');
select public.apply_for_access_v2('{"name":"Seller Co","contact_name":"S","phone":"+49 711 123456","wants_buy":true,"wants_sell":true,"version":"t1","sites":[{"country":"Germany","address":"A 1"},{"country":"Austria"}],"buy_categories":["pharma"],"sell_categories":["pharma","ivd","supplements"],"ivdr_confirmed":true,"seller_description":"EU wholesaler with broad portfolio","consents":{"terms":true,"confidentiality":true,"commission":true,"newsletter":true}}'::jsonb);
select pg_temp.expect((public.get_my_account() -> 'company' ->> 'seller_code') like 'S-%', 'seller gets anonymous code');
select pg_temp.expect(jsonb_array_length(public.get_my_account() -> 'sites') = 2, 'two sites stored');
select pg_temp.expect(jsonb_array_length(public.get_my_account() -> 'categories') = 4, 'four categories stored (1 buy, 3 sell)');
select pg_temp.expect(public.get_my_account() ->> 'newsletter' = 'pending', 'newsletter waits for double opt-in');
select pg_temp.expect(not public.confirm_newsletter('00000000-0000-0000-0000-000000000000'), 'wrong newsletter token does nothing');
select pg_temp.expect(public.confirm_newsletter(public.get_newsletter_token()), 'newsletter confirmed with token');
select pg_temp.expect(public.get_my_account() ->> 'newsletter' = 'confirmed', 'newsletter shows confirmed');
select pg_temp.expect((public.get_my_account() -> 'company' ->> 'commission_pct') is null, 'commission hidden until approved');
select pg_temp.expect((select count(*) from public.consents) = 0, 'consents table invisible to applicant');
select pg_temp.expect((select count(*) from public.company_sites) = 0, 'sites table invisible to applicant');
select pg_temp.expect_error($$select public.add_company_document_v2('company/00000000-0000-0000-0000-000000000000/x.pdf','x.pdf','wholesale_licence')$$, 'document in foreign folder');
select pg_temp.expect_error($$select public.add_company_document_v2('company/' || public.my_company_id() || '/x.pdf','x.pdf','passport')$$, 'unknown document kind');
select public.add_company_document_v2('company/' || public.my_company_id() || '/x.pdf', 'x.pdf', 'wholesale_licence',
  ((public.get_my_account() -> 'sites' -> 0 ->> 'id'))::uuid, 'pharma');
select pg_temp.expect(jsonb_array_length(public.get_my_account() -> 'documents') = 1, 'document registered');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select public.apply_for_access_v2('{"name":"Buyer Two","contact_name":"B","phone":"+964 770 1234567","wants_buy":true,"version":"t1","sites":[{"country":"Iraq"}],"buy_categories":["pharma","supplements"],"consents":{"terms":true,"confidentiality":true}}'::jsonb);
select pg_temp.expect((public.get_my_account() -> 'company' ->> 'seller_code') is null, 'buyer has no seller code');
select pg_temp.expect(public.get_my_account() ->> 'newsletter' is null, 'no newsletter consent without tick');
select pg_temp.expect_error($$select public.apply_for_access_v2('{"name":"X","contact_name":"B","phone":"+964 770 1234567","wants_buy":true,"version":"t1","sites":[{"country":"Iraq"}],"consents":{"terms":true,"confidentiality":true}}'::jsonb)$$, 'second application of buyer');
reset role;
create temp table other_site as select s.id from public.company_sites s join public.companies c on c.id = s.company_id where c.name = 'Seller Co' limit 1;
grant select on other_site to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_error($$select public.add_company_document_v2('company/' || public.my_company_id() || '/y.pdf','y.pdf','import_licence',(select id from other_site))$$, 'site of another company');
reset role;
select pg_temp.expect((select count(*) from public.consents where kind = 'commission') = 1, 'commission consent only for seller');
select pg_temp.expect((select count(*) from public.consents where kind = 'newsletter' and confirmed_at is not null) = 1, 'newsletter consent confirmed once');
set role anon;
select pg_temp.expect_error($$select public.get_my_account()$$, 'anon cannot call get_my_account');
select pg_temp.expect_error($$select public.apply_for_access_v2('{}'::jsonb)$$, 'anon cannot apply');
reset role;
update public.consents set confirmed_at = null where kind = 'newsletter';
create temp table seller_token as select confirm_token from public.consents where kind = 'newsletter';
grant select on seller_token to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect(not public.confirm_newsletter((select confirm_token from seller_token)), 'cannot confirm another user''s newsletter');
reset role;
select pg_temp.expect((select confirmed_at from public.consents where kind = 'newsletter') is null, 'foreign token left unconfirmed');

-- Marketplace settings (stage 1b) ------------------------------------------------
insert into public.app_settings (key, value) values ('standard_commission_pct', '3');
update public.companies set sell_status = 'approved' where name = 'Seller Co';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((public.get_my_account() -> 'company' ->> 'commission_pct')::numeric = 3, 'approved seller sees standard commission');
select pg_temp.expect((select count(*) from public.app_settings) = 0, 'settings invisible to sellers');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect((public.get_my_account() -> 'company' ->> 'commission_pct') is null, 'buyer never sees a commission');
reset role;
update public.companies set commission_pct = 2.5 where name = 'Seller Co';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((public.get_my_account() -> 'company' ->> 'commission_pct')::numeric = 2.5, 'own commission rate overrides standard');
reset role;

-- Marketplace listings (stage 1c) ------------------------------------------------
update public.companies set status = 'approved' where name = 'Seller Co';
update public.company_categories set status = 'approved'
  where role = 'sell' and category in ('pharma', 'supplements') and company_id = (select id from public.companies where name = 'Seller Co');
create temp table good_offer as select '{"category":"pharma","product_name":"Paracetamol 500 mg tablets","brand":"Examplamol",
  "active_ingredients":"Paracetamol 500 mg","dosage_form":"Tablet","units_per_pack":20,"unit":"tablets",
  "packaging_language":"German","quantity":1000,"price":1.2,"expiry_date":"2030-05-31","incoterm":"EXW",
  "incoterm_place":"Hamburg","valid_until":"2030-01-01","ship_mode":"except","ship_countries":["Russia"],
  "documents_available":["CoA","CPP"],"country_prices":[{"country":"Iraq","price":1.1}]}'::jsonb as o;
grant select on good_offer to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer)))$$, 'buyer cannot list offers');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.save_listings(jsonb_build_array((select o from good_offer))) = 1, 'approved seller saves an offer');
select pg_temp.expect(jsonb_array_length(public.get_my_listings()) = 1, 'seller sees own offer');
select pg_temp.expect((public.get_my_listings() -> 0 -> 'country_prices' -> 0 ->> 'price')::numeric = 1.1, 'country price stored');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"category":"ivd"}'))$$, 'category not approved');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) - 'active_ingredients'))$$, 'pharma without ingredients');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"dosage_form":"Other"}'))$$, 'Other without description');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"min_shelf_life_months":24}'))$$, 'two expiry values');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"expiry_date":"2020-01-01"}'))$$, 'expired product');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"price":0}'))$$, 'zero price');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"documents_available":["Passport"]}'))$$, 'unknown document');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || '{"buyers_mode":"only","buyers_countries":[]}'))$$, 'only-rule without countries');
select pg_temp.expect(public.save_listings(jsonb_build_array((select o from good_offer) || jsonb_build_object('id', public.get_my_listings() -> 0 ->> 'id', 'quantity', 500))) = 1, 'seller updates own offer');
select pg_temp.expect((public.get_my_listings() -> 0 ->> 'quantity')::int = 500 and jsonb_array_length(public.get_my_listings()) = 1, 'update did not duplicate');
select pg_temp.expect((select count(*) from public.listings) = 0, 'listings table invisible to sellers');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect(jsonb_array_length(public.get_my_listings()) = 0, 'buyer sees no seller offers here');
reset role;
create temp table seller_offer as select id from public.listings limit 1;
grant select on seller_offer to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'seller2@example.test');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select public.apply_for_access_v2('{"name":"Seller Two","contact_name":"S2","phone":"+49 711 654321","wants_sell":true,"version":"t1","sites":[{"country":"Germany"}],"sell_categories":["pharma"],"seller_description":"Another EU wholesaler for tests","consents":{"terms":true,"confidentiality":true,"commission":true}}'::jsonb);
reset role;
update public.companies set status = 'approved', sell_status = 'approved' where name = 'Seller Two';
update public.company_categories set status = 'approved' where company_id = (select id from public.companies where name = 'Seller Two');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select pg_temp.expect_error($$select public.save_listings(jsonb_build_array((select o from good_offer) || jsonb_build_object('id', (select id from seller_offer))))$$, 'cannot overwrite another seller''s offer');
select pg_temp.expect(public.end_listings(array[(select id from seller_offer)]) = 0, 'cannot end another seller''s offer');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.end_listings(array[(select id from seller_offer)]) = 1, 'seller ends own offer');
reset role;
select pg_temp.expect((select status from public.listings limit 1) = 'ended', 'offer marked ended');

-- Registration on one page: application in metadata, files in pending/<user>/ --------
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f4', 'onepage@example.test',
  '{"full_name":"One Page","application":{"name":"One Page Co","contact_name":"O","phone":"+49 711 777777","wants_buy":true,"wants_sell":true,"version":"t1","sites":[{"country":"Germany"},{"country":"Iraq"}],"buy_categories":["pharma"],"sell_categories":["supplements"],"consents":{"terms":true,"confidentiality":true,"commission":true}}}');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000f5', 'old@example.test', now());
set role anon;
insert into storage.objects (bucket_id, name) values ('documents', 'pending/00000000-0000-0000-0000-0000000000f4/wholesale_licence__1__pharma__1700000000-licence.pdf');
insert into storage.objects (bucket_id, name) values ('documents', 'pending/00000000-0000-0000-0000-0000000000f4/registry_extract__x__x__1700000001-register.pdf');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('documents', 'pending/00000000-0000-0000-0000-0000000000f5/x__x__x__1-a.pdf')$$, 'no pending upload for confirmed accounts');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('documents', 'company/00000000-0000-0000-0000-0000000000f4/a.pdf')$$, 'anon cannot upload into company folders');
select pg_temp.expect_error($$select public.claim_pending_application()$$, 'anon cannot claim');
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f5');
select pg_temp.expect(public.claim_pending_application() is null, 'nothing to claim without application');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select pg_temp.expect(public.claim_pending_application() is not null, 'application claimed after sign-in');
select pg_temp.expect(jsonb_array_length(public.get_my_account() -> 'documents') = 2, 'pending files registered');
select pg_temp.expect((select count(*) from jsonb_array_elements(public.get_my_account() -> 'documents') d
  where d ->> 'kind' = 'wholesale_licence' and d ->> 'site_id' = public.get_my_account() -> 'sites' -> 1 ->> 'id') = 1, 'licence linked to second site');
select pg_temp.expect(public.claim_pending_application() is null, 'claim only once');
reset role;
select pg_temp.expect((select raw_user_meta_data ? 'application' from auth.users where id = '00000000-0000-0000-0000-0000000000f4') = false, 'application removed from metadata');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.save_listings(jsonb_build_array((select o from good_offer) || '{"product_name":"Paracetamol 500 mg tablets","name_on_pack":"Paracetamol 500 mg Tabletten"}')) = 1, 'offer with name on pack saved');
select pg_temp.expect(exists (select 1 from jsonb_array_elements(public.get_my_listings()) l where l ->> 'name_on_pack' = 'Paracetamol 500 mg Tabletten'), 'name on pack returned');
reset role;

-- Admin prepares offers for a seller (drafts) ------------------------------------
create temp table seller_co as select id from public.companies where name = 'Seller Co';
grant select on seller_co to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect_error($$select public.admin_prepare_listings((select id from seller_co), jsonb_build_array((select o from good_offer)))$$, 'seller cannot use admin import');
select pg_temp.expect_error($$select public.save_listings_for((select id from seller_co), jsonb_build_array((select o from good_offer)), 'active')$$, 'internal save function not callable');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(public.admin_prepare_listings((select id from seller_co), jsonb_build_array((select o from good_offer) || '{"product_name":"Draft offer"}')) = 1, 'admin prepares a draft for the seller');
select pg_temp.expect((select status from public.listings where product_name = 'Draft offer') = 'draft', 'prepared offer is a draft');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.save_listings(jsonb_build_array((select o from good_offer) || jsonb_build_object('id', (select l ->> 'id' from jsonb_array_elements(public.get_my_listings()) l where l ->> 'product_name' = 'Draft offer'), 'product_name', 'Draft offer'))) = 1, 'seller publishes the draft');
reset role;
select pg_temp.expect((select status from public.listings where product_name = 'Draft offer') = 'active', 'draft is now active');
