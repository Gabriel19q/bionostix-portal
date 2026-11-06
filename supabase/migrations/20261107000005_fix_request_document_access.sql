-- Fix: customers could not download documents of their own requests.
-- The storage policy looked up public.requests directly, which customers cannot read (RLS).
-- The check now runs through a SECURITY DEFINER helper.

create or replace function public.is_my_request(p_request_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
    where r.id::text = p_request_id and r.company_id = public.my_company_id()
  );
$$;

revoke execute on function public.is_my_request from public, anon;
grant execute on function public.is_my_request to authenticated;

drop policy "documents customer read" on storage.objects;

create policy "documents customer read" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      ((storage.foldername(name))[1] = 'company'
        and (storage.foldername(name))[2] = public.my_company_id()::text)
      or ((storage.foldername(name))[1] = 'request'
        and public.is_my_request((storage.foldername(name))[2]))
      or ((storage.foldername(name))[1] = 'offer' and public.my_company_active())
    )
  );
