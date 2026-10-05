-- MIRA CRM v0.5 · automation platform
-- Transactional domain events, durable jobs, automation rules, outbound outbox,
-- webhook delivery, API keys and user notifications.

create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 3 and 120),
  aggregate_type text not null check (char_length(aggregate_type) between 2 and 80),
  aggregate_id uuid,
  contact_id uuid references public.contacts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'pending'
    check (status in ('pending','processing','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists domain_events_dedupe_idx
  on public.domain_events (tenant_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists domain_events_pending_idx
  on public.domain_events (status, next_attempt_at, occurred_at)
  where status in ('pending','failed');

create index if not exists domain_events_contact_idx
  on public.domain_events (tenant_id, contact_id, occurred_at desc)
  where contact_id is not null;

create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null
    check (kind in ('automation','outbound_message','webhook','notification','maintenance')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','dead','cancelled')),
  priority integer not null default 100,
  run_after timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  locked_at timestamptz,
  locked_by text,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_queue_dedupe_idx
  on public.job_queue (tenant_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists job_queue_claim_idx
  on public.job_queue (status, run_after, priority desc, created_at)
  where status = 'queued';

create or replace function private.enqueue_job(
  p_tenant_id uuid,
  p_kind text,
  p_payload jsonb,
  p_dedupe_key text,
  p_run_after timestamptz default now(),
  p_priority integer default 100,
  p_max_attempts integer default 8
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('automation','outbound_message','webhook','notification','maintenance') then
    raise exception 'tipo de job inválido';
  end if;

  insert into public.job_queue (
    tenant_id, kind, status, priority, run_after, max_attempts,
    dedupe_key, payload
  )
  values (
    p_tenant_id,
    p_kind,
    'queued',
    coalesce(p_priority,100),
    coalesce(p_run_after,now()),
    least(greatest(coalesce(p_max_attempts,8),1),50),
    nullif(trim(coalesce(p_dedupe_key,'')),''),
    coalesce(p_payload,'{}'::jsonb)
  )
  on conflict (tenant_id, dedupe_key) where dedupe_key is not null
  do update set
    payload = excluded.payload,
    priority = excluded.priority,
    run_after = excluded.run_after,
    max_attempts = excluded.max_attempts,
    status = case
      when job_queue.status in ('queued','failed','running') then 'queued'
      else job_queue.status
    end,
    locked_at = case
      when job_queue.status in ('queued','failed','running') then null
      else job_queue.locked_at
    end,
    locked_by = case
      when job_queue.status in ('queued','failed','running') then null
      else job_queue.locked_by
    end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function private.enqueue_job(uuid,text,jsonb,text,timestamptz,integer,integer)
from public, anon, authenticated;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  description text,
  trigger_event text not null check (char_length(trigger_event) between 3 and 120),
  conditions jsonb not null default '{"all":[]}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  priority integer not null default 100,
  stop_on_match boolean not null default false,
  cooldown_seconds integer not null default 0
    check (cooldown_seconds between 0 and 2592000),
  created_by uuid references auth.users(id) on delete set null,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_trigger_idx
  on public.automation_rules (tenant_id, trigger_event, enabled, priority);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  event_id uuid not null references public.domain_events(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running','succeeded','failed','skipped')),
  subject_key text not null default 'tenant',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (rule_id, event_id)
);

create index if not exists automation_runs_recent_idx
  on public.automation_runs (tenant_id, started_at desc);

create index if not exists automation_runs_cooldown_idx
  on public.automation_runs (rule_id, subject_key, status, started_at desc);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  channel text not null check (channel in ('whatsapp','email','sms')),
  purpose text not null default 'support'
    check (purpose in ('transactional','support','sales','marketing')),
  body text not null check (char_length(body) between 1 and 12000),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, name)
);

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  channel text not null check (channel in ('whatsapp','email','sms')),
  purpose text not null default 'support'
    check (purpose in ('transactional','support','sales','marketing')),
  body text not null check (char_length(body) between 1 and 12000),
  status text not null default 'pending'
    check (status in ('pending','queued','sending','sent','delivered','read','failed','cancelled','suppressed')),
  scheduled_at timestamptz not null default now(),
  provider text,
  external_id text,
  dedupe_key text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  suppressed_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outbound_messages_dedupe_idx
  on public.outbound_messages (tenant_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists outbound_messages_due_idx
  on public.outbound_messages (tenant_id, status, scheduled_at)
  where status in ('pending','queued','failed');

create or replace function private.enforce_outbound_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preference text := 'unknown';
begin
  if not exists(
    select 1 from public.contacts c
    where c.id = new.contact_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'contato não pertence ao tenant';
  end if;

  if new.conversation_id is not null and not exists(
    select 1 from public.conversations c
    where c.id = new.conversation_id
      and c.tenant_id = new.tenant_id
      and c.contact_id = new.contact_id
  ) then
    raise exception 'conversa incompatível com contato/tenant';
  end if;

  select p.status into v_preference
  from public.contact_channel_preferences p
  where p.contact_id = new.contact_id
    and p.tenant_id = new.tenant_id
    and p.channel = new.channel;

  v_preference := coalesce(v_preference,'unknown');

  if new.purpose in ('marketing','sales')
     and v_preference in ('opted_out','transactional_only')
  then
    new.status := 'suppressed';
    new.suppressed_reason := 'channel_preference:' || v_preference;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_outbound_message() from public, anon, authenticated;

drop trigger if exists outbound_messages_enforce on public.outbound_messages;
create trigger outbound_messages_enforce
before insert or update on public.outbound_messages
for each row execute function private.enforce_outbound_message();

create or replace function private.outbound_message_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending','queued') then
    perform private.enqueue_job(
      new.tenant_id,
      'outbound_message',
      jsonb_build_object('messageId',new.id),
      'outbound:' || new.id::text,
      new.scheduled_at,
      120,
      8
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.outbound_message_after_change() from public, anon, authenticated;

drop trigger if exists outbound_messages_queue_job on public.outbound_messages;
create trigger outbound_messages_queue_job
after insert or update of status, scheduled_at on public.outbound_messages
for each row execute function private.outbound_message_after_change();

create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  url text not null check (url ~ '^https://'),
  event_types text[] not null default array['*']::text[],
  secret_ref text,
  headers jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_subscriptions_active_idx
  on public.webhook_subscriptions (tenant_id, active);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
  event_id uuid not null references public.domain_events(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','sending','succeeded','failed','dead','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_status_code integer,
  last_error text,
  response_excerpt text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, event_id)
);

create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (status, next_attempt_at)
  where status in ('pending','failed');

create or replace function private.webhook_delivery_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_job(
    new.tenant_id,
    'webhook',
    jsonb_build_object('deliveryId',new.id),
    'webhook:' || new.id::text,
    new.next_attempt_at,
    80,
    8
  );
  return new;
end;
$$;

revoke execute on function private.webhook_delivery_after_insert() from public, anon, authenticated;

drop trigger if exists webhook_deliveries_queue_job on public.webhook_deliveries;
create trigger webhook_deliveries_queue_job
after insert on public.webhook_deliveries
for each row execute function private.webhook_delivery_after_insert();

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  prefix text not null check (char_length(prefix) between 6 and 24),
  secret_hash text not null,
  scopes text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, prefix)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) between 2 and 80),
  title text not null check (char_length(title) between 1 and 180),
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_unread_idx
  on public.user_notifications (tenant_id, user_id, created_at desc)
  where read_at is null;

create or replace function private.domain_event_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_job(
    new.tenant_id,
    'automation',
    jsonb_build_object('eventId',new.id),
    'automation:' || new.id::text,
    new.next_attempt_at,
    100,
    8
  );

  insert into public.webhook_deliveries (
    tenant_id, subscription_id, event_id, status, next_attempt_at
  )
  select
    new.tenant_id,
    s.id,
    new.id,
    'pending',
    now()
  from public.webhook_subscriptions s
  where s.tenant_id = new.tenant_id
    and s.active = true
    and ('*' = any(s.event_types) or new.event_type = any(s.event_types))
  on conflict (subscription_id,event_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.domain_event_after_insert() from public, anon, authenticated;

drop trigger if exists domain_events_enqueue on public.domain_events;
create trigger domain_events_enqueue
after insert on public.domain_events
for each row execute function private.domain_event_after_insert();

create or replace function private.emit_domain_event_internal(
  p_tenant_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_contact_id uuid,
  p_payload jsonb,
  p_dedupe_key text,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.domain_events (
    tenant_id, event_type, aggregate_type, aggregate_id, contact_id,
    payload, dedupe_key, occurred_at, next_attempt_at
  )
  values (
    p_tenant_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_contact_id,
    coalesce(p_payload,'{}'::jsonb),
    nullif(trim(coalesce(p_dedupe_key,'')),''),
    coalesce(p_occurred_at,now()),
    now()
  )
  on conflict (tenant_id,dedupe_key) where dedupe_key is not null
  do update set dedupe_key = excluded.dedupe_key
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function private.emit_domain_event_internal(uuid,text,text,uuid,uuid,jsonb,text,timestamptz)
from public, anon, authenticated;

create or replace function public.crm_tag_contact(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_tag_name text,
  p_color text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag public.tags%rowtype;
begin
  if not exists(
    select 1 from public.contacts c
    where c.id = p_contact_id and c.tenant_id = p_tenant_id
  ) then
    raise exception 'contato inválido para o tenant';
  end if;

  if nullif(trim(p_tag_name),'') is null then
    raise exception 'tag obrigatória';
  end if;

  insert into public.tags (tenant_id,name,color)
  values (
    p_tenant_id,
    left(trim(p_tag_name),120),
    nullif(left(trim(coalesce(p_color,'')),32),'')
  )
  on conflict (tenant_id,name) do update set
    color = coalesce(excluded.color,public.tags.color)
  returning * into v_tag;

  insert into public.contact_tags (contact_id,tag_id)
  values (p_contact_id,v_tag.id)
  on conflict (contact_id,tag_id) do nothing;

  return jsonb_build_object(
    'tagId',v_tag.id,
    'name',v_tag.name,
    'contactId',p_contact_id
  );
end;
$$;

revoke all on function public.crm_tag_contact(uuid,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.crm_tag_contact(uuid,uuid,text,text)
to service_role;

create or replace function public.crm_emit_event(
  p_tenant_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_contact_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant inválido';
  end if;

  if p_contact_id is not null and not exists(
    select 1 from public.contacts c
    where c.id = p_contact_id and c.tenant_id = p_tenant_id
  ) then
    raise exception 'contato inválido para o tenant';
  end if;

  return private.emit_domain_event_internal(
    p_tenant_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_contact_id,
    p_payload,
    p_dedupe_key,
    now()
  );
end;
$$;

revoke all on function public.crm_emit_event(uuid,text,text,uuid,uuid,jsonb,text)
from public, anon, authenticated;
grant execute on function public.crm_emit_event(uuid,text,text,uuid,uuid,jsonb,text)
to service_role;

create or replace function public.crm_claim_jobs(
  p_worker_id text,
  p_limit integer default 20,
  p_kinds text[] default null
)
returns setof public.job_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(p_worker_id),'') is null then
    raise exception 'worker id obrigatório';
  end if;

  return query
  with picked as (
    select q.id
    from public.job_queue q
    where q.status = 'queued'
      and q.run_after <= now()
      and (p_kinds is null or q.kind = any(p_kinds))
    order by q.priority desc, q.run_after asc, q.created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit,20),1),100)
  )
  update public.job_queue q
  set status = 'running',
      attempts = q.attempts + 1,
      locked_at = now(),
      locked_by = left(trim(p_worker_id),160),
      updated_at = now()
  from picked
  where q.id = picked.id
  returning q.*;
end;
$$;

revoke all on function public.crm_claim_jobs(text,integer,text[])
from public, anon, authenticated;
grant execute on function public.crm_claim_jobs(text,integer,text[])
to service_role;

create or replace function public.crm_complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.job_queue
  set status = 'succeeded',
      result = coalesce(p_result,'{}'::jsonb),
      last_error = null,
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.crm_complete_job(uuid,text,jsonb)
from public, anon, authenticated;
grant execute on function public.crm_complete_job(uuid,text,jsonb)
to service_role;

create or replace function public.crm_fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_max integer;
  v_status text;
  v_delay integer;
begin
  select attempts,max_attempts into v_attempts,v_max
  from public.job_queue
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id
  for update;

  if v_attempts is null then
    return 'not-owned';
  end if;

  v_status := case when v_attempts >= v_max then 'dead' else 'queued' end;
  v_delay := coalesce(
    p_retry_after_seconds,
    least(3600, greatest(15, (power(2,greatest(v_attempts - 1,0)) * 15)::integer))
  );

  update public.job_queue
  set status = v_status,
      run_after = case when v_status = 'queued'
        then now() + make_interval(secs => least(greatest(v_delay,5),86400))
        else run_after
      end,
      last_error = left(coalesce(p_error,'unknown error'),4000),
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = p_job_id;

  return v_status;
end;
$$;

revoke all on function public.crm_fail_job(uuid,text,text,integer)
from public, anon, authenticated;
grant execute on function public.crm_fail_job(uuid,text,text,integer)
to service_role;

create or replace function public.crm_release_stale_jobs(
  p_older_than_minutes integer default 10
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.job_queue
  set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      run_after = case
        when attempts >= max_attempts then run_after
        else now() + interval '30 seconds'
      end,
      last_error = coalesce(last_error,'') || case
        when coalesce(last_error,'') = '' then '' else E'\n' end || 'stale lock released',
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where status = 'running'
    and locked_at < now() - make_interval(
      mins => least(greatest(coalesce(p_older_than_minutes,10),1),1440)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.crm_release_stale_jobs(integer)
from public, anon, authenticated;
grant execute on function public.crm_release_stale_jobs(integer)
to service_role;

create or replace function private.messages_emit_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_event_type text;
begin
  select c.contact_id into v_contact_id
  from public.conversations c
  where c.id = new.conversation_id;

  v_event_type := case
    when new.direction = 'inbound' then 'message.received'
    else 'message.sent'
  end;

  perform private.emit_domain_event_internal(
    new.tenant_id,
    v_event_type,
    'message',
    new.id,
    v_contact_id,
    jsonb_build_object(
      'conversationId',new.conversation_id,
      'direction',new.direction,
      'actor',new.actor,
      'messageType',new.message_type,
      'status',new.status,
      'text',left(new.text,4000)
    ),
    'message:' || new.id::text,
    new.created_at
  );

  return new;
end;
$$;

revoke execute on function private.messages_emit_domain_event() from public, anon, authenticated;

drop trigger if exists messages_emit_domain_event on public.messages;
create trigger messages_emit_domain_event
after insert on public.messages
for each row execute function private.messages_emit_domain_event();

create or replace function private.deals_emit_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_domain_event_internal(
      new.tenant_id,'deal.created','deal',new.id,new.contact_id,
      jsonb_build_object(
        'pipelineId',new.pipeline_id,
        'stageId',new.stage_id,
        'title',new.title,
        'valueCents',new.value_cents,
        'source',new.source,
        'ownerUserId',new.owner_user_id
      ),
      'deal-created:' || new.id::text,
      new.created_at
    );
    return new;
  end if;

  if old.stage_id is distinct from new.stage_id then
    perform private.emit_domain_event_internal(
      new.tenant_id,'deal.stage_changed','deal',new.id,new.contact_id,
      jsonb_build_object(
        'fromStageId',old.stage_id,
        'toStageId',new.stage_id,
        'title',new.title,
        'valueCents',new.value_cents
      ),
      'deal-stage:' || new.id::text || ':' || new.stage_id::text || ':' || txid_current()::text,
      new.updated_at
    );
  end if;

  if old.won_at is null and new.won_at is not null then
    perform private.emit_domain_event_internal(
      new.tenant_id,'deal.won','deal',new.id,new.contact_id,
      jsonb_build_object('title',new.title,'valueCents',new.value_cents),
      'deal-won:' || new.id::text,
      new.won_at
    );
  end if;

  if old.lost_at is null and new.lost_at is not null then
    perform private.emit_domain_event_internal(
      new.tenant_id,'deal.lost','deal',new.id,new.contact_id,
      jsonb_build_object('title',new.title,'valueCents',new.value_cents),
      'deal-lost:' || new.id::text,
      new.lost_at
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.deals_emit_domain_event() from public, anon, authenticated;

drop trigger if exists deals_emit_domain_event on public.deals;
create trigger deals_emit_domain_event
after insert or update of stage_id, won_at, lost_at on public.deals
for each row execute function private.deals_emit_domain_event();

create or replace function private.transactions_emit_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    perform private.emit_domain_event_internal(
      new.tenant_id,
      'transaction.' || new.status,
      'transaction',
      new.id,
      new.contact_id,
      jsonb_build_object(
        'externalId',new.external_id,
        'source',new.source,
        'amountCents',new.amount_cents,
        'status',new.status
      ),
      'transaction:' || new.id::text || ':' || new.status,
      new.occurred_at
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.transactions_emit_domain_event() from public, anon, authenticated;

drop trigger if exists transactions_emit_domain_event on public.customer_transactions;
create trigger transactions_emit_domain_event
after insert or update of status on public.customer_transactions
for each row execute function private.transactions_emit_domain_event();

create or replace function private.proposals_emit_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_domain_event_internal(
      new.tenant_id,'proposal.created','proposal',new.id,new.contact_id,
      jsonb_build_object(
        'number',new.number,
        'status',new.status,
        'totalCents',new.total_cents,
        'dealId',new.deal_id
      ),
      'proposal-created:' || new.id::text,
      new.created_at
    );
  elsif old.status is distinct from new.status then
    perform private.emit_domain_event_internal(
      new.tenant_id,
      'proposal.' || new.status,
      'proposal',
      new.id,
      new.contact_id,
      jsonb_build_object(
        'number',new.number,
        'fromStatus',old.status,
        'toStatus',new.status,
        'totalCents',new.total_cents,
        'dealId',new.deal_id
      ),
      'proposal-status:' || new.id::text || ':' || new.status,
      new.updated_at
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.proposals_emit_domain_event() from public, anon, authenticated;

drop trigger if exists proposals_emit_domain_event on public.proposals;
create trigger proposals_emit_domain_event
after insert or update of status on public.proposals
for each row execute function private.proposals_emit_domain_event();

create or replace function private.reviews_emit_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    perform private.emit_domain_event_internal(
      new.tenant_id,
      'review.' || new.status,
      'review',
      new.id,
      new.contact_id,
      jsonb_build_object(
        'status',new.status,
        'rating',new.rating,
        'channel',new.channel,
        'transactionId',new.transaction_id
      ),
      'review-status:' || new.id::text || ':' || new.status,
      coalesce(new.responded_at,new.sent_at,new.created_at)
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.reviews_emit_domain_event() from public, anon, authenticated;

drop trigger if exists reviews_emit_domain_event on public.review_requests;
create trigger reviews_emit_domain_event
after insert or update of status on public.review_requests
for each row execute function private.reviews_emit_domain_event();

alter table public.domain_events enable row level security;
alter table public.job_queue enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.message_templates enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.api_keys enable row level security;
alter table public.user_notifications enable row level security;

create policy "members domain_events" on public.domain_events
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members automation_rules" on public.automation_rules
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members automation_runs" on public.automation_runs
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members message_templates" on public.message_templates
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members outbound_messages" on public.outbound_messages
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members webhook_subscriptions" on public.webhook_subscriptions
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members webhook_deliveries" on public.webhook_deliveries
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "users notifications read" on public.user_notifications
for select to authenticated
using (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
);

create policy "users notifications update" on public.user_notifications
for update to authenticated
using (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
)
with check (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
);

revoke all on public.domain_events, public.job_queue, public.automation_rules,
  public.automation_runs, public.message_templates, public.outbound_messages,
  public.webhook_subscriptions, public.webhook_deliveries, public.api_keys,
  public.user_notifications
from anon;

grant select on public.domain_events, public.automation_runs,
  public.outbound_messages, public.webhook_deliveries
to authenticated;

grant select, insert, update, delete on public.automation_rules,
  public.message_templates, public.webhook_subscriptions
to authenticated;

grant select, update on public.user_notifications to authenticated;

grant all on public.domain_events, public.job_queue, public.automation_rules,
  public.automation_runs, public.message_templates, public.outbound_messages,
  public.webhook_subscriptions, public.webhook_deliveries, public.api_keys,
  public.user_notifications
to service_role;
