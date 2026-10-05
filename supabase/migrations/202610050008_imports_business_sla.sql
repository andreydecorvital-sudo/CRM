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
