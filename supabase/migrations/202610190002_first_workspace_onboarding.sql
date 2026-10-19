-- CRM SaaS: self-service first workspace for a VERIFIED Supabase Auth account.
-- A new user can create its own tenant via one scoped RPC, without a service key.
-- Nothing about this grants read/write permissions in an existing tenant.
create or replace function public.crm_create_first_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_existing uuid;
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_user and u.email_confirmed_at is not null
  ) then
    raise exception 'verified_email_required' using errcode = '28000';
  end if;
  if pg_catalog.char_length(v_name) < 2 or pg_catalog.char_length(v_name) > 100 then
    raise exception 'invalid_workspace_name' using errcode = '22023';
  end if;

  -- Serializes parallel first-time requests per identity: one user, one first tenant.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select m.tenant_id into v_existing
    from public.tenant_members m
    where m.user_id = v_user
    order by m.created_at asc
    limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  v_tenant := pg_catalog.gen_random_uuid();
  insert into public.tenants(id, name, slug, status)
    values(v_tenant, v_name, 'crm-' || pg_catalog.replace(v_tenant::text, '-', ''), 'trial');
  insert into public.tenant_members(tenant_id, user_id, role)
    values(v_tenant, v_user, 'owner');
  return v_tenant;
end;
$$;

revoke all on function public.crm_create_first_workspace(text) from public, anon;
grant execute on function public.crm_create_first_workspace(text) to authenticated;
