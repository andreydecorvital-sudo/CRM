-- CRM v0.8 · async contact imports + business-time SLA.

alter table public.job_queue
  drop constraint if exists job_queue_kind_check;

alter table public.job_queue
  add constraint job_queue_kind_check
  check (kind in (
    'automation',
    'outbound_message',
    'webhook',
    'notification',
    'maintenance',
    'contact_import'
  ));

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
  if p_kind not in (
    'automation',
    'outbound_message',
    'webhook',
    'notification',
    'maintenance',
    'contact_import'
  ) then
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
  on conflict (tenant_id,dedupe_key) where dedupe_key is not null
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

create or replace function public.crm_enqueue_job(
  p_tenant_id uuid,
  p_kind text,
  p_payload jsonb,
  p_dedupe_key text default null,
  p_run_after timestamptz default now(),
  p_priority integer default 100,
  p_max_attempts integer default 8
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

  return private.enqueue_job(
    p_tenant_id,
    p_kind,
    p_payload,
    p_dedupe_key,
    p_run_after,
    p_priority,
    p_max_attempts
  );
end;
$$;

revoke all on function public.crm_enqueue_job(uuid,text,jsonb,text,timestamptz,integer,integer)
from public, anon, authenticated;
grant execute on function public.crm_enqueue_job(uuid,text,jsonb,text,timestamptz,integer,integer)
to service_role;

create table if not exists public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'staging'
    check (status in ('staging','queued','processing','completed','failed','cancelled')),
  source_filename text,
  delimiter text not null default ',' check (char_length(delimiter) = 1),
  mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  success_rows integer not null default 0 check (success_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_imports_queue_idx
  on public.contact_imports (tenant_id,status,created_at desc);

create table if not exists public.contact_import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_id uuid not null references public.contact_imports(id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  raw_data jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','skipped')),
  contact_id uuid references public.contacts(id) on delete set null,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id,row_number)
);

create index if not exists contact_import_rows_pending_idx
  on public.contact_import_rows (import_id,status,row_number);

create or replace function private.validate_contact_import_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1 from public.contact_imports i
    where i.id = new.import_id
      and i.tenant_id = new.tenant_id
      and i.status in ('staging','queued','processing')
  ) then
    raise exception 'import inválido para tenant/status';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_contact_import_row() from public, anon, authenticated;

drop trigger if exists contact_import_rows_validate on public.contact_import_rows;
create trigger contact_import_rows_validate
before insert or update of import_id,tenant_id on public.contact_import_rows
for each row execute function private.validate_contact_import_row();

create or replace function public.crm_refresh_contact_import_stats(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.contact_imports%rowtype;
  v_total integer := 0;
  v_success integer := 0;
  v_failed integer := 0;
  v_done integer := 0;
  v_pending integer := 0;
  v_status text;
begin
  select * into v_import
  from public.contact_imports
  where id = p_import_id
  for update;

  if v_import.id is null then
    raise exception 'import não encontrado';
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'succeeded')::integer,
    count(*) filter (where status = 'failed')::integer,
    count(*) filter (where status in ('succeeded','failed','skipped'))::integer,
    count(*) filter (where status in ('pending','processing'))::integer
  into v_total,v_success,v_failed,v_done,v_pending
  from public.contact_import_rows
  where import_id = p_import_id;

  v_status := case
    when v_import.status = 'cancelled' then 'cancelled'
    when v_pending = 0 and v_total > 0 then 'completed'
    when v_done > 0 then 'processing'
    else v_import.status
  end;

  update public.contact_imports
  set total_rows = v_total,
      processed_rows = v_done,
      success_rows = v_success,
      failed_rows = v_failed,
      status = v_status,
      started_at = case
        when v_status = 'processing' then coalesce(started_at,now())
        else started_at
      end,
      completed_at = case
        when v_status = 'completed' then coalesce(completed_at,now())
        else null
      end,
      updated_at = now()
  where id = p_import_id
  returning * into v_import;

  return jsonb_build_object(
    'id',v_import.id,
    'status',v_import.status,
    'totalRows',v_import.total_rows,
    'processedRows',v_import.processed_rows,
    'successRows',v_import.success_rows,
    'failedRows',v_import.failed_rows
  );
end;
$$;

revoke all on function public.crm_refresh_contact_import_stats(uuid)
from public, anon, authenticated;
grant execute on function public.crm_refresh_contact_import_stats(uuid)
to service_role;

create or replace function private.validate_business_calendar_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1 from pg_catalog.pg_timezone_names z
    where z.name = new.timezone
  ) then
    raise exception 'timezone inválido: %',new.timezone;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_business_calendar_timezone() from public, anon, authenticated;

drop trigger if exists business_calendars_validate_timezone on public.business_calendars;
create trigger business_calendars_validate_timezone
before insert or update of timezone on public.business_calendars
for each row execute function private.validate_business_calendar_timezone();

create or replace function private.add_business_minutes(
  p_calendar_id uuid,
  p_start timestamptz,
  p_minutes integer
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_schedule jsonb;
  v_cursor timestamptz := coalesce(p_start,now());
  v_remaining integer := greatest(coalesce(p_minutes,0),0);
  v_date date;
  v_day_key text;
  v_intervals jsonb;
  v_interval jsonb;
  v_start_local time;
  v_end_local time;
  v_interval_start timestamptz;
  v_interval_end timestamptz;
  v_effective_start timestamptz;
  v_available integer;
  v_holiday_full boolean;
  v_holiday_intervals jsonb;
  v_guard integer := 0;
begin
  if v_remaining = 0 then return v_cursor; end if;

  select c.timezone,c.weekly_schedule
  into v_timezone,v_schedule
  from public.business_calendars c
  where c.id = p_calendar_id and c.active = true;

  if v_timezone is null then
    return v_cursor + make_interval(mins => v_remaining);
  end if;

  loop
    v_guard := v_guard + 1;
    if v_guard > 400 then
      raise exception 'calendário sem janela útil em 400 dias';
    end if;

    v_date := (v_cursor at time zone v_timezone)::date;
    v_day_key := extract(isodow from v_date)::integer::text;

    select h.full_day,h.intervals
    into v_holiday_full,v_holiday_intervals
    from public.business_holidays h
    where h.calendar_id = p_calendar_id
      and h.holiday_date = v_date
    limit 1;

    if found then
      v_intervals := case
        when coalesce(v_holiday_full,true) then '[]'::jsonb
        else coalesce(v_holiday_intervals,'[]'::jsonb)
      end;
    else
      v_intervals := coalesce(v_schedule -> v_day_key,'[]'::jsonb);
    end if;

    for v_interval in
      select value
      from jsonb_array_elements(v_intervals)
      order by value->>'start'
    loop
      begin
        v_start_local := (v_interval->>'start')::time;
        v_end_local := (v_interval->>'end')::time;
      exception when others then
        raise exception 'intervalo comercial inválido em %: %',v_date,v_interval;
      end;

      if v_end_local <= v_start_local then
        raise exception 'intervalo comercial deve terminar após iniciar: %',v_interval;
      end if;

      v_interval_start := (v_date + v_start_local) at time zone v_timezone;
      v_interval_end := (v_date + v_end_local) at time zone v_timezone;
      v_effective_start := greatest(v_cursor,v_interval_start);

      if v_effective_start < v_interval_end then
        v_available := floor(extract(epoch from (v_interval_end - v_effective_start)) / 60)::integer;

        if v_remaining <= v_available then
          return v_effective_start + make_interval(mins => v_remaining);
        end if;

        v_remaining := v_remaining - v_available;
        v_cursor := v_interval_end;
      end if;
    end loop;

    v_cursor := ((v_date + 1)::timestamp at time zone v_timezone);
    v_holiday_full := null;
    v_holiday_intervals := null;
  end loop;
end;
$$;

revoke execute on function private.add_business_minutes(uuid,timestamptz,integer)
from public, anon, authenticated;

create or replace function private.set_conversation_sla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first integer;
  v_resolution integer;
  v_calendar_id uuid;
  v_base timestamptz;
begin
  if new.department_id is null then
    new.sla_first_response_due_at := null;
    new.sla_resolution_due_at := null;
    return new;
  end if;

  select
    d.sla_first_response_minutes,
    d.sla_resolution_minutes,
    coalesce(
      d.business_calendar_id,
      (
        select c.id
        from public.business_calendars c
        where c.tenant_id = new.tenant_id
          and c.is_default = true
          and c.active = true
        limit 1
      )
    )
  into v_first,v_resolution,v_calendar_id
  from public.departments d
  where d.id = new.department_id
    and d.tenant_id = new.tenant_id
    and d.active = true;

  if v_first is null then
    raise exception 'department inválido para o tenant';
  end if;

  if tg_op = 'INSERT' or new.department_id is distinct from old.department_id then
    v_base := coalesce(new.first_message_at,new.created_at,now());

    new.sla_first_response_due_at := case
      when v_calendar_id is null then v_base + make_interval(mins => v_first)
      else private.add_business_minutes(v_calendar_id,v_base,v_first)
    end;

    new.sla_resolution_due_at := case
      when v_resolution is null then null
      when v_calendar_id is null then v_base + make_interval(mins => v_resolution)
      else private.add_business_minutes(v_calendar_id,v_base,v_resolution)
    end;
  end if;

  return new;
end;
$$;

revoke execute on function private.set_conversation_sla() from public, anon, authenticated;

alter table public.contact_imports enable row level security;
alter table public.contact_import_rows enable row level security;

create policy "members contact_imports" on public.contact_imports
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members contact_import_rows" on public.contact_import_rows
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

revoke all on public.contact_imports,public.contact_import_rows from anon;

grant select,insert,update,delete on public.contact_imports to authenticated;
grant select on public.contact_import_rows to authenticated;

grant all on public.contact_imports,public.contact_import_rows to service_role;


-- Customer registration by WhatsApp + email delivery + opportunity consent.

alter table public.message_templates
  add column if not exists subject text,
  add column if not exists html_body text;

alter table public.message_templates
  drop constraint if exists message_templates_purpose_check;

alter table public.message_templates
  add constraint message_templates_purpose_check
  check (purpose in ('transactional','support','sales','marketing','opportunity'));

alter table public.outbound_messages
  add column if not exists subject text,
  add column if not exists html_body text;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_purpose_check;

alter table public.outbound_messages
  add constraint outbound_messages_purpose_check
  check (purpose in ('transactional','support','sales','marketing','opportunity'));

create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('resend')),
  status text not null default 'disconnected'
    check (status in ('disconnected','connected','error')),
  from_email text not null,
  from_name text,
  reply_to text,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.customer_registration_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  trigger_mode text not null default 'new_contact'
    check (trigger_mode in ('new_contact','keyword','manual')),
  trigger_keywords text[] not null default array['cadastro','me cadastrar']::text[],
  collect_name boolean not null default true,
  collect_email boolean not null default true,
  collect_city boolean not null default false,
  email_required boolean not null default false,
  ask_opportunities boolean not null default true,
  default_opportunity_channels text[] not null default array['whatsapp','email']::text[],
  welcome_message text not null default 'Posso fazer seu cadastro rapidinho por aqui.',
  prompt_name text not null default 'Para começar, qual é o seu nome?',
  prompt_email text not null default 'Qual é o seu melhor e-mail? Se preferir não informar, responda PULAR.',
  prompt_city text not null default 'Em qual cidade você está? Se preferir não informar, responda PULAR.',
  prompt_opportunities text not null default 'Quer receber oportunidades e novidades relevantes? Responda SIM ou NÃO. Você pode mudar isso quando quiser.',
  invalid_email_message text not null default 'Esse e-mail parece inválido. Envie novamente ou responda PULAR.',
  completion_message text not null default 'Cadastro concluído. Obrigado!',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_opportunity_channels <@ array['whatsapp','email']::text[])
);

create table if not exists public.contact_registration_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  step text not null
    check (step in ('name','email','city','opportunities','done')),
  attempts integer not null default 0 check (attempts >= 0),
  collected jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_prompt_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contact_registration_one_active_idx
  on public.contact_registration_sessions (tenant_id, contact_id)
  where status = 'active';

create index if not exists contact_registration_recent_idx
  on public.contact_registration_sessions (tenant_id, status, updated_at desc);

create table if not exists public.contact_opportunity_preferences (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  enabled boolean not null default false,
  channels text[] not null default '{}'::text[]
    check (channels <@ array['whatsapp','email']::text[]),
  topics text[] not null default '{}'::text[],
  frequency text not null default 'important_only'
    check (frequency in ('realtime','daily','weekly','important_only')),
  max_per_week integer not null default 3
    check (max_per_week between 1 and 50),
  consent_source text,
  consent_version text not null default 'v1',
  consent_text text,
  captured_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, contact_id)
);

create index if not exists contact_opportunity_enabled_idx
  on public.contact_opportunity_preferences (tenant_id, enabled, updated_at desc);

create or replace function private.validate_email_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if position('@' in new.from_email) <= 1 then
    raise exception 'from_email inválido';
  end if;

  if new.reply_to is not null and position('@' in new.reply_to) <= 1 then
    raise exception 'reply_to inválido';
  end if;

  if new.secret_ref is not null
     and new.secret_ref !~ '^[A-Z][A-Z0-9_]{2,120}$'
  then
    raise exception 'secret_ref inválido';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_email_connection()
from public, anon, authenticated;

drop trigger if exists email_connections_validate on public.email_connections;
create trigger email_connections_validate
before insert or update on public.email_connections
for each row execute function private.validate_email_connection();

create or replace function private.validate_registration_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1
    from public.contacts c
    where c.id = new.contact_id
      and c.tenant_id = new.tenant_id
  ) then
    raise exception 'contato não pertence ao tenant';
  end if;

  if not exists(
    select 1
    from public.conversations c
    where c.id = new.conversation_id
      and c.tenant_id = new.tenant_id
      and c.contact_id = new.contact_id
      and c.channel = 'whatsapp'
  ) then
    raise exception 'conversa WhatsApp incompatível com contato/tenant';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_registration_session()
from public, anon, authenticated;

drop trigger if exists contact_registration_sessions_validate
on public.contact_registration_sessions;

create trigger contact_registration_sessions_validate
before insert or update of tenant_id,contact_id,conversation_id
on public.contact_registration_sessions
for each row execute function private.validate_registration_session();

create or replace function private.validate_opportunity_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1
    from public.contacts c
    where c.id = new.contact_id
      and c.tenant_id = new.tenant_id
  ) then
    raise exception 'contato não pertence ao tenant';
  end if;

  if new.enabled and cardinality(new.channels) = 0 then
    raise exception 'oportunidades habilitadas exigem pelo menos um canal';
  end if;

  new.revoked_at := case
    when new.enabled then null
    when old.enabled is distinct from new.enabled or tg_op = 'INSERT' then now()
    else new.revoked_at
  end;

  new.captured_at := case
    when new.enabled and new.captured_at is null then now()
    else new.captured_at
  end;

  return new;
end;
$$;

revoke execute on function private.validate_opportunity_preference()
from public, anon, authenticated;

drop trigger if exists contact_opportunity_preferences_validate
on public.contact_opportunity_preferences;

create trigger contact_opportunity_preferences_validate
before insert or update
on public.contact_opportunity_preferences
for each row execute function private.validate_opportunity_preference();

create or replace function private.ensure_customer_registration_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_registration_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.ensure_customer_registration_settings()
from public, anon, authenticated;

drop trigger if exists tenants_registration_settings_default on public.tenants;
create trigger tenants_registration_settings_default
after insert on public.tenants
for each row execute function private.ensure_customer_registration_settings();

insert into public.customer_registration_settings (tenant_id)
select t.id
from public.tenants t
on conflict (tenant_id) do nothing;

create or replace function public.crm_set_opportunity_preference(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_enabled boolean,
  p_channels text[],
  p_frequency text default 'important_only',
  p_source text default null,
  p_consent_text text default null,
  p_consent_version text default 'v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preference public.contact_opportunity_preferences%rowtype;
  v_channels text[] := coalesce(p_channels,'{}'::text[]);
  v_channel text;
begin
  if not exists(
    select 1 from public.contacts c
    where c.id = p_contact_id and c.tenant_id = p_tenant_id
  ) then
    raise exception 'contato inválido para o tenant';
  end if;

  if not (v_channels <@ array['whatsapp','email']::text[]) then
    raise exception 'canal de oportunidade inválido';
  end if;

  if coalesce(p_enabled,false) and cardinality(v_channels) = 0 then
    raise exception 'selecione pelo menos um canal';
  end if;

  if p_frequency not in ('realtime','daily','weekly','important_only') then
    raise exception 'frequência inválida';
  end if;

  insert into public.contact_opportunity_preferences (
    tenant_id,
    contact_id,
    enabled,
    channels,
    frequency,
    consent_source,
    consent_version,
    consent_text,
    captured_at,
    revoked_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_contact_id,
    coalesce(p_enabled,false),
    v_channels,
    p_frequency,
    nullif(trim(coalesce(p_source,'')),''),
    coalesce(nullif(trim(coalesce(p_consent_version,'')),''),'v1'),
    nullif(trim(coalesce(p_consent_text,'')),''),
    case when coalesce(p_enabled,false) then now() else null end,
    case when coalesce(p_enabled,false) then null else now() end,
    now()
  )
  on conflict (tenant_id,contact_id) do update set
    enabled = excluded.enabled,
    channels = excluded.channels,
    frequency = excluded.frequency,
    consent_source = excluded.consent_source,
    consent_version = excluded.consent_version,
    consent_text = excluded.consent_text,
    captured_at = case
      when excluded.enabled then now()
      else public.contact_opportunity_preferences.captured_at
    end,
    revoked_at = case when excluded.enabled then null else now() end,
    updated_at = now()
  returning * into v_preference;

  if v_preference.enabled then
    foreach v_channel in array v_preference.channels
    loop
      insert into public.contact_channel_preferences (
        tenant_id,
        contact_id,
        channel,
        status,
        source,
        reason,
        captured_at,
        metadata,
        updated_at
      )
      values (
        p_tenant_id,
        p_contact_id,
        v_channel,
        'opted_in',
        coalesce(nullif(trim(coalesce(p_source,'')),''),'opportunities'),
        'explicit opportunity opt-in',
        now(),
        jsonb_build_object('scope','opportunities'),
        now()
      )
      on conflict (contact_id,channel) do update set
        status = 'opted_in',
        source = excluded.source,
        reason = excluded.reason,
        captured_at = excluded.captured_at,
        metadata = public.contact_channel_preferences.metadata || excluded.metadata,
        updated_at = now();
    end loop;
  end if;

  perform private.emit_domain_event_internal(
    p_tenant_id,
    'preference.opportunities_updated',
    'contact',
    p_contact_id,
    p_contact_id,
    jsonb_build_object(
      'enabled',v_preference.enabled,
      'channels',v_preference.channels,
      'frequency',v_preference.frequency,
      'source',v_preference.consent_source
    ),
    'opportunity-preference:' || p_contact_id::text || ':' || txid_current()::text,
    now()
  );

  return jsonb_build_object(
    'id',v_preference.id,
    'publicToken',v_preference.public_token,
    'contactId',v_preference.contact_id,
    'enabled',v_preference.enabled,
    'channels',v_preference.channels,
    'frequency',v_preference.frequency,
    'maxPerWeek',v_preference.max_per_week
  );
end;
$$;

revoke all on function public.crm_set_opportunity_preference(
  uuid,uuid,boolean,text[],text,text,text,text
) from public, anon, authenticated;

grant execute on function public.crm_set_opportunity_preference(
  uuid,uuid,boolean,text[],text,text,text,text
) to service_role;

create or replace function public.crm_update_opportunity_preference_by_token(
  p_token uuid,
  p_enabled boolean,
  p_channels text[],
  p_frequency text default 'important_only'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pref public.contact_opportunity_preferences%rowtype;
begin
  select * into v_pref
  from public.contact_opportunity_preferences p
  where p.public_token = p_token
  for update;

  if v_pref.id is null then
    raise exception 'preferência não encontrada';
  end if;

  return public.crm_set_opportunity_preference(
    v_pref.tenant_id,
    v_pref.contact_id,
    p_enabled,
    p_channels,
    p_frequency,
    'preference-center',
    'Preferência atualizada pelo próprio cliente.',
    v_pref.consent_version
  );
end;
$$;

revoke all on function public.crm_update_opportunity_preference_by_token(
  uuid,boolean,text[],text
) from public, anon, authenticated;

grant execute on function public.crm_update_opportunity_preference_by_token(
  uuid,boolean,text[],text
) to service_role;

create or replace function private.enforce_outbound_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preference text := 'unknown';
  v_opportunity_enabled boolean := false;
  v_opportunity_channels text[] := '{}'::text[];
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

  if new.purpose = 'marketing' and v_preference <> 'opted_in' then
    new.status := 'suppressed';
    new.suppressed_reason := 'marketing-consent-required';
  elsif new.purpose = 'sales'
        and v_preference in ('opted_out','transactional_only')
  then
    new.status := 'suppressed';
    new.suppressed_reason := 'channel_preference:' || v_preference;
  elsif new.purpose = 'opportunity' then
    select p.enabled,p.channels
    into v_opportunity_enabled,v_opportunity_channels
    from public.contact_opportunity_preferences p
    where p.tenant_id = new.tenant_id
      and p.contact_id = new.contact_id;

    if not coalesce(v_opportunity_enabled,false) then
      new.status := 'suppressed';
      new.suppressed_reason := 'opportunities-disabled';
    elsif not (new.channel = any(coalesce(v_opportunity_channels,'{}'::text[]))) then
      new.status := 'suppressed';
      new.suppressed_reason := 'opportunities-channel-disabled';
    elsif v_preference in ('opted_out','transactional_only') then
      new.status := 'suppressed';
      new.suppressed_reason := 'channel_preference:' || v_preference;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_outbound_message()
from public, anon, authenticated;

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
  v_received_at timestamptz := coalesce(p_received_at,now());
  v_contact_created boolean := false;
begin
  if not exists(select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant inválido';
  end if;

  if nullif(trim(p_external_contact_id),'') is null then
    raise exception 'external_contact_id obrigatório';
  end if;

  if nullif(trim(p_external_message_id),'') is null then
    raise exception 'external_message_id obrigatório';
  end if;

  insert into public.contacts (
    tenant_id,
    external_contact_id,
    phone_e164,
    display_name,
    metadata,
    first_seen_at,
    last_seen_at
  )
  values (
    p_tenant_id,
    trim(p_external_contact_id),
    nullif(trim(coalesce(p_phone_e164,'')),''),
    coalesce(nullif(trim(coalesce(p_display_name,'')),''),'Contato'),
    coalesce(p_metadata,'{}'::jsonb),
    v_received_at,
    v_received_at
  )
  on conflict (tenant_id,external_contact_id) do nothing
  returning * into v_contact;

  if v_contact.id is not null then
    v_contact_created := true;
  else
    update public.contacts
    set
      phone_e164 = coalesce(
        nullif(trim(coalesce(p_phone_e164,'')),''),
        public.contacts.phone_e164
      ),
      display_name = case
        when nullif(trim(coalesce(p_display_name,'')),'') is not null
          then trim(p_display_name)
        else public.contacts.display_name
      end,
      metadata = public.contacts.metadata || coalesce(p_metadata,'{}'::jsonb),
      last_seen_at = greatest(public.contacts.last_seen_at,v_received_at),
      updated_at = now()
    where tenant_id = p_tenant_id
      and external_contact_id = trim(p_external_contact_id)
    returning * into v_contact;
  end if;

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
      tenant_id,
      contact_id,
      channel,
      provider,
      status,
      category,
      priority,
      unread_count,
      first_message_at,
      last_message_at,
      last_inbound_at
    )
    values (
      p_tenant_id,
      v_contact.id,
      'whatsapp',
      coalesce(p_metadata->>'provider','waha'),
      'open',
      'other',
      'normal',
      0,
      v_received_at,
      v_received_at,
      v_received_at
    )
    returning * into v_conversation;
  end if;

  insert into public.messages (
    tenant_id,
    conversation_id,
    external_id,
    direction,
    actor,
    message_type,
    text,
    status,
    sent_at,
    metadata,
    created_at
  )
  values (
    p_tenant_id,
    v_conversation.id,
    trim(p_external_message_id),
    'inbound',
    'contact',
    'text',
    coalesce(p_text,''),
    'received',
    v_received_at,
    coalesce(p_metadata,'{}'::jsonb),
    v_received_at
  )
  on conflict (conversation_id,external_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object(
      'duplicate',true,
      'contactCreated',v_contact_created,
      'contactId',v_contact.id,
      'conversationId',v_conversation.id
    );
  end if;

  update public.conversations
  set
    status = case when status = 'waiting_contact' then 'open' else status end,
    unread_count = unread_count + 1,
    last_message_at = greatest(coalesce(last_message_at,v_received_at),v_received_at),
    last_inbound_at = greatest(coalesce(last_inbound_at,v_received_at),v_received_at),
    updated_at = now()
  where id = v_conversation.id;

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_tenant_id,
    'provider',
    coalesce(p_metadata->>'provider','whatsapp'),
    'message.inbound',
    'conversation',
    v_conversation.id::text,
    jsonb_build_object(
      'messageId',v_message_id,
      'contactCreated',v_contact_created
    )
  );

  return jsonb_build_object(
    'duplicate',false,
    'contactCreated',v_contact_created,
    'contactId',v_contact.id,
    'conversationId',v_conversation.id,
    'messageId',v_message_id
  );
end;
$$;

revoke all on function public.crm_ingest_whatsapp_inbound(
  uuid,text,text,text,text,text,timestamptz,jsonb
) from public, anon, authenticated;

grant execute on function public.crm_ingest_whatsapp_inbound(
  uuid,text,text,text,text,text,timestamptz,jsonb
) to service_role;

alter table public.email_connections enable row level security;
alter table public.customer_registration_settings enable row level security;
alter table public.contact_registration_sessions enable row level security;
alter table public.contact_opportunity_preferences enable row level security;

create policy "members email_connections read"
on public.email_connections
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members customer_registration_settings"
on public.customer_registration_settings
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members contact_registration_sessions read"
on public.contact_registration_sessions
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members contact_opportunity_preferences"
on public.contact_opportunity_preferences
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

revoke all on public.email_connections,
  public.customer_registration_settings,
  public.contact_registration_sessions,
  public.contact_opportunity_preferences
from anon;

grant select on public.email_connections,
  public.contact_registration_sessions
to authenticated;

grant select,insert,update,delete on public.customer_registration_settings,
  public.contact_opportunity_preferences
to authenticated;

grant all on public.email_connections,
  public.customer_registration_settings,
  public.contact_registration_sessions,
  public.contact_opportunity_preferences
to service_role;
