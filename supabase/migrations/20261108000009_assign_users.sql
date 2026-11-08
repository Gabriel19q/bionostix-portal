-- Several employees per customer company: admins move a user into an existing company.
-- Customers may only change their own name (column privilege), so this runs as SECURITY DEFINER.

create or replace function public.admin_assign_user_company(p_user_id uuid, p_company_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if (select role from profiles where id = p_user_id) = 'admin' then
    raise exception 'admins are not assigned to customer companies';
  end if;
  if p_company_id is not null and not exists (select 1 from companies where id = p_company_id) then
    raise exception 'company not found';
  end if;
  update profiles set company_id = p_company_id where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
end $$;

revoke execute on function public.admin_assign_user_company from public, anon;
grant execute on function public.admin_assign_user_company to authenticated;
