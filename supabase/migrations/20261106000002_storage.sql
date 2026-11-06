-- Private bucket for licences, CoAs, proformas and shipping documents.
-- Paths: company/<company id>/..., request/<request id>/..., offer/<offer id>/...

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents admin all" on storage.objects for all
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

-- Customers upload only into their own company folder
create policy "documents customer upload" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'company'
    and (storage.foldername(name))[2] = public.my_company_id()::text
  );

-- Customers read their company files, files of their requests,
-- and product documents (e.g. CoA) once approved
create policy "documents customer read" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      ((storage.foldername(name))[1] = 'company'
        and (storage.foldername(name))[2] = public.my_company_id()::text)
      or ((storage.foldername(name))[1] = 'request'
        and exists (
          select 1 from public.requests r
          where r.id::text = (storage.foldername(name))[2]
            and r.company_id = public.my_company_id()))
      or ((storage.foldername(name))[1] = 'offer' and public.my_company_active())
    )
  );
