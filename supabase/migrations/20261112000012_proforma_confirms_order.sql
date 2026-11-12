-- Proforma invoice = order confirmation (meeting 9 Nov 2026, decided 12 Nov 2026)
--
-- Flow: new -> in_review -> proforma_sent (= order confirmation, contract) -> deposit_paid -> ordered
--       -> shipped -> completed
-- With changes: in_review -> changes_proposed -> (customer accepts) changes_accepted -> proforma_sent
-- The customer can cancel until the proforma is sent.
--
-- The manufacturer reserves the goods for a few days (e.g. 3). That date is the payment deadline on the
-- proforma: no deposit by then -> the proforma is cancelled (admins cancel by hand; the portal flags it).

-- "Order confirmed" no longer exists as a step: the customer accepting changes is now "changes_accepted".
-- No live request has this status (checked 12 Nov 2026).
alter type public.request_status rename value 'order_confirmed' to 'changes_accepted';

-- Reservation at the manufacturer = payment deadline on the proforma (customers only see it as deadline)
alter table public.requests add column payment_due_date date;

-- Customer: accept proposed changes, or cancel until the proforma (order confirmation) is sent
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
    v_new := 'changes_accepted';
  else
    if v_status not in ('new', 'in_review', 'changes_proposed', 'changes_accepted') then
      raise exception 'request can no longer be cancelled';
    end if;
    v_new := 'cancelled';
  end if;

  update requests set status = v_new where id = p_request_id;
  return v_new;
end $$;

-- Admin status change: sending the proforma needs the payment deadline and the uploaded proforma document
create or replace function public.admin_set_request_status(
  p_request_id uuid, p_status public.request_status, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_status = 'proforma_sent' then
    if (select payment_due_date from requests where id = p_request_id) is null then
      raise exception 'payment due date required';
    end if;
    if not exists (select 1 from documents where request_id = p_request_id and doc_type = 'proforma') then
      raise exception 'proforma document required';
    end if;
  end if;
  update requests set status = p_status where id = p_request_id;
  if not found then raise exception 'request not found'; end if;
  if p_note is not null then
    update request_status_history set note = p_note
    where id = (select max(id) from request_status_history where request_id = p_request_id);
  end if;
end $$;

-- Customers see the payment deadline (not the word "reservation")
drop function public.get_my_requests();
create function public.get_my_requests()
returns table (
  id uuid, number text, status public.request_status, seller public.seller,
  customer_comment text, delivery_country text, delivery_deadline date, payment_due_date date,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.number, r.status, r.seller, r.customer_comment, r.delivery_country,
         r.delivery_deadline, r.payment_due_date, r.created_at, r.updated_at
  from public.requests r
  where r.company_id = public.my_company_id();
$$;

revoke execute on function public.get_my_requests() from public, anon;
grant execute on function public.get_my_requests() to authenticated;
