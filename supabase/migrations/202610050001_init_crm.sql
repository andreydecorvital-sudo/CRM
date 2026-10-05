-- CRM v0.1 · multi-tenant CRM + WhatsApp inbox
create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('trial','active','paused','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner','admin','manager','agent','viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_contact_id text not null,
  phone_e164 text,
  display_name text not null default 'Contato',
  email text,
  city text,
  temperature text not null default 'unknown' check (temperature in ('unknown','cold','warm','hot')),
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_contact_id)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text,
  unique (tenant_id, name)
);

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null default 'whatsapp',
  provider text not null default 'waha',
  status text not null default 'open' check (status in ('open','waiting_team','waiting_contact','resolved')),
  category text not null default 'other' check (category in ('sales','support','billing','question','feedback','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  ai_mode text not null default 'assist' check (ai_mode in ('off','assist','auto')),
  summary text,
  unread_count integer not null default 0 check (unread_count >= 0),
  assigned_to uuid references auth.users(id) on delete set null,
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists conversations_one_active_idx on public.conversations (tenant_id, contact_id, channel) where status <> 'resolved';
create index if not exists conversations_queue_idx on public.conversations (tenant_id, status, priority, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  actor text not null check (actor in ('contact','ai','human','system')),
  message_type text not null default 'text',
  text text not null default '',
  status text not null default 'received' check (status in ('received','draft','queued','sent','delivered','read','failed')),
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, external_id)
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at asc);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  title text not null,
  value_cents bigint,
  source text not null default 'whatsapp',
  owner_user_id uuid references auth.users(id) on delete set null,
  next_followup_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_pipeline_idx on public.deals (tenant_id, pipeline_id, stage_id, updated_at desc);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('waha','meta','bsp')),
  status text not null default 'disconnected' check (status in ('disconnected','pairing','connected','error')),
  provider_account_id text,
  phone_e164 text,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.audit_log (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_type text not null check (actor_type in ('user','ai','system','provider')),
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_tenant_idx on public.audit_log (tenant_id, created_at desc);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.contacts enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.whatsapp_connections enable row level security;
alter table public.audit_log enable row level security;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_tenant_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tenant_members tm where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid());
$$;

revoke all on function private.is_tenant_member(uuid) from public, anon;
grant execute on function private.is_tenant_member(uuid) to authenticated, service_role;

create policy "members read tenants" on public.tenants for select using (private.is_tenant_member(id));
create policy "members read tenant_members" on public.tenant_members for select using (private.is_tenant_member(tenant_id));
create policy "members contacts" on public.contacts for all using (private.is_tenant_member(tenant_id)) with check (private.is_tenant_member(tenant_id));
create policy "members tags" on public.tags for all using (private.is_tenant_member(tenant_id)) with check (private.is_tenant_member(tenant_id));
create policy "members contact_tags" on public.contact_tags for all
using (exists(select 1 from public.contacts c where c.id=contact_id and private.is_tenant_member(c.tenant_id)))
with check (exists(select 1 from public.contacts c where c.id=contact_id and private.is_tenant_member(c.tenant_id)));
create policy "members conversations" on public.conversations for all using (private.is_tenant_member(tenant_id)) with check (private.is_tenant_member(tenant_id));
create policy "members messages" on public.messages for all using (private.is_tenant_member(tenant_id)) with check (private.is_tenant_member(tenant_id));
create policy "members pipelines" on public.pipelines for all using (private.is_tenant_member(tenant_id)) with check (private.is_tenant_member(tenant_id));
create policy "members pipeline_stages" on public.pipeline_stages for all
using (exists(select 1 from public.pipelines p where p.id=pipeline_id and private.is_tenant_member(p.tenant_id)))
with check (exists(select 1 from public.pipelines p where p.id=pipeline_id and private.is_tenant_member(p.tenant_id)));
create policy "members deals" on public.deals for all using (private.is_tenant_member(tenant_id)) with check (private.is_tenant_member(tenant_id));
create policy "members whatsapp_connections" on public.whatsapp_connections for select using (private.is_tenant_member(tenant_id));
create policy "members audit_log" on public.audit_log for select using (private.is_tenant_member(tenant_id));

-- Ingestão idempotente via service role. Não expor a anon/authenticated.
create or replace function public.crm_ingest_whatsapp_inbound(
  p_tenant_id uuid,
  p_external_contact_id text,
  p_external_message_id text,
  p_display_name text,
  p_phone_e164 text,
  p_text text,
  p_received_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
  v_conversation public.conversations%rowtype;
  v_message_id uuid;
  v_received_at timestamptz := coalesce(p_received_at, now());
begin
  -- SECURITY DEFINER: execução restrita ao service_role ao final desta migration.
  if not exists(select 1 from public.tenants where id = p_tenant_id) then raise exception 'tenant inválido'; end if;
  if nullif(trim(p_external_contact_id),'') is null then raise exception 'external_contact_id obrigatório'; end if;
  if nullif(trim(p_external_message_id),'') is null then raise exception 'external_message_id obrigatório'; end if;

  insert into public.contacts (tenant_id, external_contact_id, phone_e164, display_name, metadata, first_seen_at, last_seen_at)
  values (p_tenant_id, trim(p_external_contact_id), nullif(trim(coalesce(p_phone_e164,'')),''), coalesce(nullif(trim(p_display_name),''),'Contato'), coalesce(p_metadata,'{}'::jsonb), v_received_at, v_received_at)
  on conflict (tenant_id, external_contact_id) do update set
    phone_e164 = coalesce(excluded.phone_e164, public.contacts.phone_e164),
    display_name = case when excluded.display_name <> 'Contato' then excluded.display_name else public.contacts.display_name end,
    metadata = public.contacts.metadata || excluded.metadata,
    last_seen_at = greatest(public.contacts.last_seen_at, excluded.last_seen_at),
    updated_at = now()
  returning * into v_contact;

  select * into v_conversation from public.conversations
   where tenant_id=p_tenant_id and contact_id=v_contact.id and channel='whatsapp' and status <> 'resolved'
   order by created_at desc limit 1 for update;

  if v_conversation.id is null then
    insert into public.conversations (tenant_id, contact_id, channel, provider, status, category, priority, unread_count, first_message_at, last_message_at, last_inbound_at)
    values (p_tenant_id, v_contact.id, 'whatsapp', coalesce(p_metadata->>'provider','waha'), 'open', 'other', 'normal', 0, v_received_at, v_received_at, v_received_at)
    returning * into v_conversation;
  end if;

  insert into public.messages (tenant_id, conversation_id, external_id, direction, actor, message_type, text, status, sent_at, metadata, created_at)
  values (p_tenant_id, v_conversation.id, trim(p_external_message_id), 'inbound', 'contact', 'text', coalesce(p_text,''), 'received', v_received_at, coalesce(p_metadata,'{}'::jsonb), v_received_at)
  on conflict (conversation_id, external_id) do nothing returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object('duplicate',true,'contactId',v_contact.id,'conversationId',v_conversation.id);
  end if;

  update public.conversations set
    status = case when status='waiting_contact' then 'open' else status end,
    unread_count = unread_count + 1,
    last_message_at = greatest(coalesce(last_message_at,v_received_at),v_received_at),
    last_inbound_at = greatest(coalesce(last_inbound_at,v_received_at),v_received_at),
    updated_at = now()
  where id=v_conversation.id;

  insert into public.audit_log (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant_id, 'provider', coalesce(p_metadata->>'provider','whatsapp'), 'message.inbound', 'conversation', v_conversation.id::text, jsonb_build_object('messageId',v_message_id));

  return jsonb_build_object('duplicate',false,'contactId',v_contact.id,'conversationId',v_conversation.id,'messageId',v_message_id);
end;
$$;

revoke all on function public.crm_ingest_whatsapp_inbound(uuid,text,text,text,text,text,timestamptz,jsonb) from public;
grant execute on function public.crm_ingest_whatsapp_inbound(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;
