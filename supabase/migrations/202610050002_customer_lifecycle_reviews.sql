-- CRM v0.2 · customer lifecycle (253) + review collector (257)
-- Também endurece o boundary multi-tenant criado na v0.1 para o padrão atual do Supabase.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_tenant_member(uuid) from public, anon;
grant execute on function private.is_tenant_member(uuid) to authenticated, service_role;

drop policy if exists "members read tenants" on public.tenants;
drop policy if exists "members read tenant_members" on public.tenant_members;
drop policy if exists "members contacts" on public.contacts;
drop policy if exists "members tags" on public.tags;
drop policy if exists "members contact_tags" on public.contact_tags;
drop policy if exists "members conversations" on public.conversations;
drop policy if exists "members messages" on public.messages;
drop policy if exists "members pipelines" on public.pipelines;
drop policy if exists "members pipeline_stages" on public.pipeline_stages;
drop policy if exists "members deals" on public.deals;
drop policy if exists "members whatsapp_connections" on public.whatsapp_connections;
drop policy if exists "members audit_log" on public.audit_log;

create policy "members read tenants" on public.tenants
for select to authenticated
using ((select private.is_tenant_member(id)));

create policy "members read tenant_members" on public.tenant_members
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members contacts" on public.contacts
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members tags" on public.tags
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members contact_tags" on public.contact_tags
for all to authenticated
using (exists (
  select 1 from public.contacts c
  where c.id = contact_id and (select private.is_tenant_member(c.tenant_id))
))
with check (exists (
  select 1 from public.contacts c
  where c.id = contact_id and (select private.is_tenant_member(c.tenant_id))
));

create policy "members conversations" on public.conversations
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members messages" on public.messages
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members pipelines" on public.pipelines
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members pipeline_stages" on public.pipeline_stages
for all to authenticated
using (exists (
  select 1 from public.pipelines p
  where p.id = pipeline_id and (select private.is_tenant_member(p.tenant_id))
))
with check (exists (
  select 1 from public.pipelines p
  where p.id = pipeline_id and (select private.is_tenant_member(p.tenant_id))
));

create policy "members deals" on public.deals
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members whatsapp_connections" on public.whatsapp_connections
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members audit_log" on public.audit_log
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

drop function if exists public.is_tenant_member(uuid);

-- O RPC do provider precisa de privilégio elevado, mas não deve ficar executável por clientes.
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
  if not exists(select 1 from public.tenants where id = p_tenant_id) then raise exception 'tenant inválido'; end if;
  if nullif(trim(p_external_contact_id),'') is null then raise exception 'external_contact_id obrigatório'; end if;
  if nullif(trim(p_external_message_id),'') is null then raise exception 'external_message_id obrigatório'; end if;

  insert into public.contacts (tenant_id, external_contact_id, phone_e164, display_name, metadata, first_seen_at, last_seen_at)
  values (
    p_tenant_id,
    trim(p_external_contact_id),
    nullif(trim(coalesce(p_phone_e164,'')),''),
    coalesce(nullif(trim(p_display_name),''),'Contato'),
    coalesce(p_metadata,'{}'::jsonb),
    v_received_at,
    v_received_at
  )
  on conflict (tenant_id, external_contact_id) do update set
    phone_e164 = coalesce(excluded.phone_e164, public.contacts.phone_e164),
    display_name = case when excluded.display_name <> 'Contato' then excluded.display_name else public.contacts.display_name end,
    metadata = public.contacts.metadata || excluded.metadata,
    last_seen_at = greatest(public.contacts.last_seen_at, excluded.last_seen_at),
    updated_at = now()
  returning * into v_contact;

  select * into v_conversation
  from public.conversations
  where tenant_id = p_tenant_id
    and contact_id = v_contact.id
    and channel = 'whatsapp'
    and status <> 'resolved'
  order by created_at desc
  limit 1
  for update;

  if v_conversation.id is null then
    insert into public.conversations (
      tenant_id, contact_id, channel, provider, status, category, priority,
      unread_count, first_message_at, last_message_at, last_inbound_at
    )
    values (
      p_tenant_id, v_contact.id, 'whatsapp',
      coalesce(p_metadata->>'provider','waha'),
      'open', 'other', 'normal', 0,
      v_received_at, v_received_at, v_received_at
    )
    returning * into v_conversation;
  end if;

  insert into public.messages (
    tenant_id, conversation_id, external_id, direction, actor, message_type,
    text, status, sent_at, metadata, created_at
  )
  values (
    p_tenant_id, v_conversation.id, trim(p_external_message_id),
    'inbound', 'contact', 'text', coalesce(p_text,''), 'received',
    v_received_at, coalesce(p_metadata,'{}'::jsonb), v_received_at
  )
  on conflict (conversation_id, external_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object(
      'duplicate', true,
      'contactId', v_contact.id,
      'conversationId', v_conversation.id
    );
  end if;

  update public.conversations set
    status = case when status = 'waiting_contact' then 'open' else status end,
    unread_count = unread_count + 1,
    last_message_at = greatest(coalesce(last_message_at,v_received_at),v_received_at),
    last_inbound_at = greatest(coalesce(last_inbound_at,v_received_at),v_received_at),
    updated_at = now()
  where id = v_conversation.id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata
  )
  values (
    p_tenant_id, 'provider',
    coalesce(p_metadata->>'provider','whatsapp'),
    'message.inbound', 'conversation', v_conversation.id::text,
    jsonb_build_object('messageId',v_message_id)
  );

  return jsonb_build_object(
    'duplicate', false,
    'contactId', v_contact.id,
    'conversationId', v_conversation.id,
    'messageId', v_message_id
  );
end;
$$;

revoke all on function public.crm_ingest_whatsapp_inbound(uuid,text,text,text,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_whatsapp_inbound(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;

create table if not exists public.customer_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  repeat_min_purchases smallint not null default 2 check (repeat_min_purchases >= 2),
  vip_min_purchases smallint not null default 5 check (vip_min_purchases >= 2),
  vip_min_lifetime_cents bigint not null default 500000 check (vip_min_lifetime_cents >= 0),
  at_risk_after_days integer not null default 45 check (at_risk_after_days >= 1),
  inactive_after_days integer not null default 90 check (inactive_after_days > at_risk_after_days),
  review_enabled boolean not null default false,
  review_auto_send_enabled boolean not null default false,
  review_delay_hours integer not null default 24 check (review_delay_hours between 0 and 720),
  review_min_days_between_requests integer not null default 60 check (review_min_days_between_requests >= 0),
  review_public_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  external_id text not null,
  source text not null,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  status text not null default 'completed' check (status in ('completed','refunded','cancelled')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source, external_id)
);

create index if not exists customer_transactions_contact_idx
  on public.customer_transactions (tenant_id, contact_id, status, occurred_at desc);

create table if not exists public.customer_profiles (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_count integer not null default 0 check (purchase_count >= 0),
  lifetime_value_cents bigint not null default 0 check (lifetime_value_cents >= 0),
  average_order_value_cents bigint not null default 0 check (average_order_value_cents >= 0),
  first_purchase_at timestamptz,
  last_purchase_at timestamptz,
  customer_tier text not null default 'lead' check (customer_tier in ('lead','first_time','repeat','vip')),
  updated_at timestamptz not null default now()
);

create index if not exists customer_profiles_segment_idx
  on public.customer_profiles (tenant_id, customer_tier, lifetime_value_cents desc);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  transaction_id uuid references public.customer_transactions(id) on delete set null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email','manual')),
  status text not null default 'pending' check (status in ('pending','queued','sent','delivered','responded','expired','cancelled','failed')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  responded_at timestamptz,
  rating smallint check (rating between 1 and 5),
  feedback text,
  public_review_url text,
  external_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists review_requests_transaction_idx
  on public.review_requests (transaction_id)
  where transaction_id is not null;

create index if not exists review_requests_due_idx
  on public.review_requests (tenant_id, status, scheduled_for)
  where status in ('pending','queued');

alter table public.customer_settings enable row level security;
alter table public.customer_transactions enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.review_requests enable row level security;

create policy "members customer_settings" on public.customer_settings
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members customer_transactions" on public.customer_transactions
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members customer_profiles" on public.customer_profiles
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members review_requests" on public.review_requests
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create or replace function private.ensure_customer_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.ensure_customer_settings() from public, anon, authenticated;

drop trigger if exists tenants_customer_settings on public.tenants;
create trigger tenants_customer_settings
after insert on public.tenants
for each row execute function private.ensure_customer_settings();

insert into public.customer_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function private.recompute_customer_profile(p_tenant_id uuid, p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_lifetime bigint := 0;
  v_first timestamptz;
  v_last timestamptz;
  v_repeat integer := 2;
  v_vip_count integer := 5;
  v_vip_lifetime bigint := 500000;
  v_tier text := 'lead';
begin
  select
    count(*)::integer,
    coalesce(sum(t.amount_cents),0)::bigint,
    min(t.occurred_at),
    max(t.occurred_at)
  into v_count, v_lifetime, v_first, v_last
  from public.customer_transactions t
  where t.tenant_id = p_tenant_id
    and t.contact_id = p_contact_id
    and t.status = 'completed';

  select
    s.repeat_min_purchases,
    s.vip_min_purchases,
    s.vip_min_lifetime_cents
  into v_repeat, v_vip_count, v_vip_lifetime
  from public.customer_settings s
  where s.tenant_id = p_tenant_id;

  v_repeat := coalesce(v_repeat, 2);
  v_vip_count := coalesce(v_vip_count, 5);
  v_vip_lifetime := coalesce(v_vip_lifetime, 500000);

  v_tier := case
    when v_count = 0 then 'lead'
    when v_count >= v_vip_count or v_lifetime >= v_vip_lifetime then 'vip'
    when v_count >= v_repeat then 'repeat'
    else 'first_time'
  end;

  insert into public.customer_profiles (
    contact_id, tenant_id, purchase_count, lifetime_value_cents,
    average_order_value_cents, first_purchase_at, last_purchase_at,
    customer_tier, updated_at
  )
  values (
    p_contact_id, p_tenant_id, v_count, v_lifetime,
    case when v_count > 0 then round(v_lifetime::numeric / v_count)::bigint else 0 end,
    v_first, v_last, v_tier, now()
  )
  on conflict (contact_id) do update set
    tenant_id = excluded.tenant_id,
    purchase_count = excluded.purchase_count,
    lifetime_value_cents = excluded.lifetime_value_cents,
    average_order_value_cents = excluded.average_order_value_cents,
    first_purchase_at = excluded.first_purchase_at,
    last_purchase_at = excluded.last_purchase_at,
    customer_tier = excluded.customer_tier,
    updated_at = excluded.updated_at;
end;
$$;

revoke execute on function private.recompute_customer_profile(uuid,uuid) from public, anon, authenticated;

create or replace function private.maybe_schedule_review_request(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_transaction_id uuid,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_auto boolean := false;
  v_delay integer := 24;
  v_cooldown integer := 60;
  v_public_url text;
  v_last timestamptz;
begin
  select
    s.review_enabled,
    s.review_auto_send_enabled,
    s.review_delay_hours,
    s.review_min_days_between_requests,
    s.review_public_url
  into v_enabled, v_auto, v_delay, v_cooldown, v_public_url
  from public.customer_settings s
  where s.tenant_id = p_tenant_id;

  if coalesce(v_enabled,false) is false or coalesce(v_auto,false) is false then
    return;
  end if;

  if exists(select 1 from public.review_requests r where r.transaction_id = p_transaction_id) then
    return;
  end if;

  select max(r.created_at) into v_last
  from public.review_requests r
  where r.tenant_id = p_tenant_id
    and r.contact_id = p_contact_id
    and r.status <> 'cancelled';

  if v_last is not null and v_last > now() - make_interval(days => coalesce(v_cooldown,60)) then
    return;
  end if;

  insert into public.review_requests (
    tenant_id, contact_id, transaction_id, channel, status,
    scheduled_for, public_review_url, metadata
  )
  values (
    p_tenant_id, p_contact_id, p_transaction_id, 'whatsapp', 'pending',
    greatest(now(), coalesce(p_occurred_at,now()) + make_interval(hours => coalesce(v_delay,24))),
    nullif(trim(coalesce(v_public_url,'')),''),
    jsonb_build_object('source','customer-transaction')
  )
  on conflict do nothing;
end;
$$;

revoke execute on function private.maybe_schedule_review_request(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;

create or replace function private.customer_transaction_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recompute_customer_profile(old.tenant_id, old.contact_id);
    update public.review_requests
      set status = 'cancelled', updated_at = now()
    where transaction_id = old.id and status in ('pending','queued');
    return old;
  end if;

  perform private.recompute_customer_profile(new.tenant_id, new.contact_id);

  if tg_op = 'UPDATE' and (old.tenant_id <> new.tenant_id or old.contact_id <> new.contact_id) then
    perform private.recompute_customer_profile(old.tenant_id, old.contact_id);
  end if;

  if new.status = 'completed' then
    perform private.maybe_schedule_review_request(new.tenant_id, new.contact_id, new.id, new.occurred_at);
  else
    update public.review_requests
      set status = 'cancelled', updated_at = now()
    where transaction_id = new.id and status in ('pending','queued');
  end if;

  return new;
end;
$$;

revoke execute on function private.customer_transaction_after_change() from public, anon, authenticated;

drop trigger if exists customer_transactions_refresh on public.customer_transactions;
create trigger customer_transactions_refresh
after insert or update or delete on public.customer_transactions
for each row execute function private.customer_transaction_after_change();

insert into public.customer_profiles (
  contact_id, tenant_id, purchase_count, lifetime_value_cents,
  average_order_value_cents, first_purchase_at, last_purchase_at,
  customer_tier, updated_at
)
select
  c.id, c.tenant_id, 0, 0, 0, null, null, 'lead', now()
from public.contacts c
on conflict (contact_id) do nothing;

create or replace view public.customer_lifecycle
with (security_invoker = true)
as
select
  c.tenant_id,
  c.id as contact_id,
  c.display_name,
  c.phone_e164,
  coalesce(p.purchase_count,0) as purchase_count,
  coalesce(p.lifetime_value_cents,0) as lifetime_value_cents,
  coalesce(p.average_order_value_cents,0) as average_order_value_cents,
  p.first_purchase_at,
  p.last_purchase_at,
  coalesce(p.customer_tier,'lead') as customer_tier,
  case
    when p.last_purchase_at is null then 'active'
    when current_date - p.last_purchase_at::date >= s.inactive_after_days then 'inactive'
    when current_date - p.last_purchase_at::date >= s.at_risk_after_days then 'at_risk'
    else 'active'
  end as activity_status
from public.contacts c
left join public.customer_profiles p on p.contact_id = c.id
join public.customer_settings s on s.tenant_id = c.tenant_id;

create or replace view public.review_queue
with (security_invoker = true)
as
select
  r.id,
  r.public_token,
  r.tenant_id,
  r.contact_id,
  c.display_name,
  c.phone_e164,
  r.transaction_id,
  r.channel,
  r.status,
  r.scheduled_for,
  r.sent_at,
  r.responded_at,
  r.rating,
  r.feedback,
  r.public_review_url,
  r.created_at,
  r.updated_at
from public.review_requests r
join public.contacts c on c.id = r.contact_id;

-- Data API: tabelas novas não são mais expostas automaticamente em projetos novos.
revoke all on public.tenants, public.tenant_members, public.contacts, public.tags,
  public.contact_tags, public.conversations, public.messages, public.pipelines,
  public.pipeline_stages, public.deals, public.whatsapp_connections, public.audit_log,
  public.customer_settings, public.customer_transactions, public.customer_profiles,
  public.review_requests
from anon;

grant select on public.tenants, public.tenant_members, public.whatsapp_connections,
  public.audit_log, public.customer_profiles
to authenticated;

grant select, insert, update, delete on public.contacts, public.tags, public.contact_tags,
  public.conversations, public.messages, public.pipelines, public.pipeline_stages,
  public.deals, public.customer_settings, public.customer_transactions, public.review_requests
to authenticated;

grant select on public.customer_lifecycle, public.review_queue to authenticated;

grant all on public.tenants, public.tenant_members, public.contacts, public.tags,
  public.contact_tags, public.conversations, public.messages, public.pipelines,
  public.pipeline_stages, public.deals, public.whatsapp_connections, public.audit_log,
  public.customer_settings, public.customer_transactions, public.customer_profiles,
  public.review_requests
to service_role;

grant select on public.customer_lifecycle, public.review_queue to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;
