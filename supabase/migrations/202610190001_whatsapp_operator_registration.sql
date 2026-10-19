-- Controlled self-service WAHA registration for a single CRM tenant.
-- Only an authenticated owner/admin may register a new, disconnected,
-- tenant-derived session. No update, secret_ref or destructive permission.
grant insert (tenant_id, provider, status, config)
  on table public.whatsapp_connections to authenticated;

create policy "crm owners register isolated waha"
on public.whatsapp_connections
for insert to authenticated
with check (
  provider = 'waha'
  and status = 'disconnected'
  and secret_ref is null
  and provider_account_id is null
  and phone_e164 is null
  and config = jsonb_build_object('session', 'crm_' || replace(tenant_id::text, '-', ''))
  and exists (
    select 1 from public.tenant_members m
     where m.tenant_id = whatsapp_connections.tenant_id
       and m.user_id = (select auth.uid())
       and m.role in ('owner', 'admin')
  )
);
