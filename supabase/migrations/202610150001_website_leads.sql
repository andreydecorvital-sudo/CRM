-- Website lead ingress for the standalone CRM SaaS.
-- A public site identifier is NOT an authentication secret; verify origins in the API
-- and apply server-side rate limiting. Never grant direct anon RPC execution.
create table if not exists public.website_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  allowed_origins text[] not null check (cardinality(allowed_origins) between 1 and 20),
  privacy_policy_url text,
  status text not null default 'paused' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);

create index if not exists website_sources_tenant_idx on public.website_sources (tenant_id,status);

create table if not exists public.website_lead_limits (
  site_id uuid not null references public.website_sources(id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) = 64),
  window_start timestamptz not null,
  attempts integer not null check (attempts >= 0),
  primary key (site_id,fingerprint,window_start)
);

create table if not exists public.website_lead_receipts (
  site_id uuid not null references public.website_sources(id) on delete cascade,
  request_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event_id uuid not null references public.domain_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (site_id,request_id)
);

create index if not exists website_lead_receipts_contact_idx
  on public.website_lead_receipts(contact_id,created_at desc);

alter table public.website_sources enable row level security;
alter table public.website_lead_limits enable row level security;
alter table public.website_lead_receipts enable row level security;

create policy "members read website sources" on public.website_sources
  for select to authenticated using (private.is_tenant_member(tenant_id));

create policy "admins create website sources" on public.website_sources
  for insert to authenticated with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = website_sources.tenant_id
        and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
    )
  );

create policy "admins update website sources" on public.website_sources
  for update to authenticated using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = website_sources.tenant_id
        and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
    )
  ) with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = website_sources.tenant_id
        and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
    )
  );

create policy "members read website receipts" on public.website_lead_receipts
  for select to authenticated using (
    exists (
      select 1 from public.website_sources s
      where s.id = website_lead_receipts.site_id
        and private.is_tenant_member(s.tenant_id)
    )
  );

-- Intentionally no authenticated/anon RLS policies on the limiter.
revoke all on public.website_sources, public.website_lead_limits, public.website_lead_receipts
  from public, anon, authenticated;
grant select on public.website_sources, public.website_lead_receipts to authenticated;
grant insert, update on public.website_sources to authenticated;
grant all on public.website_sources, public.website_lead_limits, public.website_lead_receipts to service_role;

create or replace function public.crm_ingest_website_lead(
  p_site_id uuid,
  p_request_id uuid,
  p_request_fingerprint text,
  p_external_contact_id text,
  p_display_name text,
  p_email text,
  p_phone_e164 text,
  p_message text,
  p_page_url text,
  p_utm jsonb,
  p_privacy_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.website_sources%rowtype;
  v_receipt public.website_lead_receipts%rowtype;
  v_window timestamptz;
  v_attempts integer;
  v_site_attempts integer;
  v_contact jsonb;
  v_contact_id uuid;
  v_event_id uuid;
begin
  select * into v_source from public.website_sources s
   where s.id = p_site_id and s.status = 'active';
  if not found then raise exception 'website_source_inactive'; end if;

  if p_privacy_consent is distinct from true then raise exception 'privacy_consent_required'; end if;
  if length(trim(coalesce(p_display_name,''))) < 2
    or length(trim(coalesce(p_display_name,''))) > 160 then
    raise exception 'invalid_name';
  end if;
  if nullif(trim(coalesce(p_email,'')),'') is null
    and nullif(trim(coalesce(p_phone_e164,'')),'') is null then
    raise exception 'contact_method_required';
  end if;
  if length(coalesce(p_external_contact_id,'')) not between 10 and 200
    or length(coalesce(p_message,'')) > 2000
    or length(coalesce(p_page_url,'')) > 1000
    or length(coalesce(p_email,'')) > 320
    or length(coalesce(p_phone_e164,'')) > 32
    or length(coalesce(p_request_fingerprint,'')) <> 64 then
    raise exception 'invalid_website_lead';
  end if;

  -- Serialise retries of the SAME site/request for exactly-once creation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_site_id::text || ':' || p_request_id::text,0)
  );
  select * into v_receipt from public.website_lead_receipts
    where site_id = p_site_id and request_id = p_request_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'contactId',v_receipt.contact_id,'eventId',v_receipt.event_id,'duplicate',true
    );
  end if;

  v_window := pg_catalog.date_trunc('hour', pg_catalog.now())
    + pg_catalog.floor(pg_catalog.date_part('minute',pg_catalog.now()) / 10) * interval '10 minutes';
  insert into public.website_lead_limits(site_id,fingerprint,window_start,attempts)
  values (p_site_id,p_request_fingerprint,v_window,1)
  on conflict (site_id,fingerprint,window_start)
  do update set attempts = public.website_lead_limits.attempts + 1
  returning attempts into v_attempts;
  if v_attempts > 10 then raise exception 'website_lead_rate_limited'; end if;

  -- Site-wide ceiling prevents bypassing all limits by rotating spoofed IP headers.
  insert into public.website_lead_limits(site_id,fingerprint,window_start,attempts)
  values (p_site_id,pg_catalog.repeat('0',64),v_window,1)
  on conflict (site_id,fingerprint,window_start)
  do update set attempts = public.website_lead_limits.attempts + 1
  returning attempts into v_site_attempts;
  if v_site_attempts > 250 then raise exception 'website_lead_rate_limited'; end if;

  select public.crm_upsert_contact(
    v_source.tenant_id,trim(p_external_contact_id),trim(p_display_name),
    nullif(trim(coalesce(p_phone_e164,'')),''),
    nullif(pg_catalog.lower(trim(coalesce(p_email,''))),''),
    null,
    pg_catalog.jsonb_build_object(
      'websiteSourceId',p_site_id,'lastWebsitePage',p_page_url,
      'websiteInquiry',true,'websitePrivacyConsent',true
    )
  ) into v_contact;

  v_contact_id := (v_contact->>'id')::uuid;
  select public.crm_emit_event(
    v_source.tenant_id,'website.lead_submitted','contact',v_contact_id,v_contact_id,
    pg_catalog.jsonb_build_object(
      'source','website','siteId',p_site_id,'pageUrl',coalesce(p_page_url,''),
      'utm',coalesce(p_utm,'{}'::jsonb),'message',coalesce(p_message,''),
      'privacyConsent',true
    ),
    'website:' || p_site_id::text || ':' || p_request_id::text
  ) into v_event_id;

  insert into public.website_lead_receipts(site_id,request_id,contact_id,event_id)
    values(p_site_id,p_request_id,v_contact_id,v_event_id);

  return pg_catalog.jsonb_build_object(
    'contactId',v_contact_id,'eventId',v_event_id,'duplicate',false
  );
end;
$$;

revoke all on function public.crm_ingest_website_lead(
 uuid,uuid,text,text,text,text,text,text,text,jsonb,boolean
) from public, anon, authenticated;
grant execute on function public.crm_ingest_website_lead(
 uuid,uuid,text,text,text,text,text,text,text,jsonb,boolean
) to service_role;

-- Retention: website_lead_limits is operational rate-limit data.
-- Schedule cleanup of windows older than 48h when the dedicated CRM DB is provisioned.
