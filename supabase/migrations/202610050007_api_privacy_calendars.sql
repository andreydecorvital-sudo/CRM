-- MIRA CRM v0.7 · public API support, privacy workflows and business calendars.

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  request_type text not null
    check (request_type in ('access','export','correction','deletion')),
  status text not null default 'requested'
    check (status in ('requested','reviewing','processing','ready','completed','rejected','cancelled')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  reason text,
  result_ref text,
  decision_notes text,
  requested_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_requests_queue_idx
  on public.privacy_requests (tenant_id, status, due_at, requested_at);

create table if not exists public.business_calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  timezone text not null default 'America/Sao_Paulo',
  weekly_schedule jsonb not null default '{
    "1":[{"start":"09:00","end":"18:00"}],
    "2":[{"start":"09:00","end":"18:00"}],
    "3":[{"start":"09:00","end":"18:00"}],
    "4":[{"start":"09:00","end":"18:00"}],
    "5":[{"start":"09:00","end":"18:00"}],
    "6":[],
    "7":[]
  }'::jsonb,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,name)
);

create unique index if not exists business_calendars_one_default_idx
  on public.business_calendars (tenant_id)
  where is_default = true;

create table if not exists public.business_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  calendar_id uuid not null references public.business_calendars(id) on delete cascade,
  holiday_date date not null,
  name text not null check (char_length(name) between 1 and 160),
  full_day boolean not null default true,
  intervals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (calendar_id,holiday_date)
);

create or replace function private.validate_business_holiday()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1 from public.business_calendars c
    where c.id = new.calendar_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'calendário não pertence ao tenant';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_business_holiday() from public, anon, authenticated;

drop trigger if exists business_holidays_validate on public.business_holidays;
create trigger business_holidays_validate
before insert or update on public.business_holidays
for each row execute function private.validate_business_holiday();

alter table public.departments
  add column if not exists business_calendar_id uuid references public.business_calendars(id) on delete set null;

create or replace function private.validate_department_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.business_calendar_id is null then return new; end if;

  if not exists(
    select 1 from public.business_calendars c
    where c.id = new.business_calendar_id
      and c.tenant_id = new.tenant_id
      and c.active = true
  ) then
    raise exception 'calendário inválido para departamento';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_department_calendar() from public, anon, authenticated;

drop trigger if exists departments_validate_calendar on public.departments;
create trigger departments_validate_calendar
before insert or update of business_calendar_id, tenant_id on public.departments
for each row execute function private.validate_department_calendar();

create or replace function private.ensure_default_business_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_calendars (
    tenant_id,name,timezone,is_default,active
  )
  values (
    new.id,'Comercial','America/Sao_Paulo',true,true
  )
  on conflict (tenant_id,name) do nothing;

  return new;
end;
$$;

revoke execute on function private.ensure_default_business_calendar() from public, anon, authenticated;

drop trigger if exists tenants_default_business_calendar on public.tenants;
create trigger tenants_default_business_calendar
after insert on public.tenants
for each row execute function private.ensure_default_business_calendar();

insert into public.business_calendars (
  tenant_id,name,timezone,is_default,active
)
select t.id,'Comercial','America/Sao_Paulo',true,true
from public.tenants t
where not exists(
  select 1 from public.business_calendars c
  where c.tenant_id = t.id and c.is_default = true
)
on conflict (tenant_id,name) do nothing;

create or replace function public.crm_upsert_contact(
  p_tenant_id uuid,
  p_external_contact_id text,
  p_display_name text default null,
  p_phone_e164 text default null,
  p_email text default null,
  p_city text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
begin
  if not exists(select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant inválido';
  end if;

  if nullif(trim(p_external_contact_id),'') is null then
    raise exception 'external_contact_id obrigatório';
  end if;

  insert into public.contacts (
    tenant_id,external_contact_id,phone_e164,display_name,email,city,
    metadata,first_seen_at,last_seen_at
  )
  values (
    p_tenant_id,
    trim(p_external_contact_id),
    nullif(trim(coalesce(p_phone_e164,'')),''),
    coalesce(nullif(trim(coalesce(p_display_name,'')),''),'Contato'),
    nullif(lower(trim(coalesce(p_email,''))),''),
    nullif(trim(coalesce(p_city,'')),''),
    coalesce(p_metadata,'{}'::jsonb),
    now(),
    now()
  )
  on conflict (tenant_id,external_contact_id) do update set
    phone_e164 = coalesce(excluded.phone_e164,public.contacts.phone_e164),
    display_name = case
      when excluded.display_name <> 'Contato' then excluded.display_name
      else public.contacts.display_name
    end,
    email = coalesce(excluded.email,public.contacts.email),
    city = coalesce(excluded.city,public.contacts.city),
    metadata = public.contacts.metadata || excluded.metadata,
    last_seen_at = greatest(public.contacts.last_seen_at,excluded.last_seen_at),
    updated_at = now()
  returning * into v_contact;

  return jsonb_build_object(
    'id',v_contact.id,
    'tenantId',v_contact.tenant_id,
    'externalContactId',v_contact.external_contact_id,
    'displayName',v_contact.display_name,
    'phoneE164',v_contact.phone_e164,
    'email',v_contact.email,
    'city',v_contact.city
  );
end;
$$;

revoke all on function public.crm_upsert_contact(uuid,text,text,text,text,text,jsonb)
from public, anon, authenticated;
grant execute on function public.crm_upsert_contact(uuid,text,text,text,text,text,jsonb)
to service_role;

create or replace function public.crm_contact_privacy_inventory(
  p_tenant_id uuid,
  p_contact_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contactId',c.id,
    'messages',(
      select count(*)
      from public.messages m
      join public.conversations conv on conv.id = m.conversation_id
      where conv.tenant_id = p_tenant_id and conv.contact_id = c.id
    ),
    'conversations',(
      select count(*) from public.conversations x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),
    'deals',(
      select count(*) from public.deals x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),
    'transactions',(
      select count(*) from public.customer_transactions x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),
    'proposals',(
      select count(*) from public.proposals x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),
    'reviews',(
      select count(*) from public.review_requests x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),
    'tasks',(
      select count(*) from public.tasks x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),
    'hasFinancialHistory',exists(
      select 1 from public.customer_transactions x
      where x.tenant_id = p_tenant_id
        and x.contact_id = c.id
        and x.status in ('completed','refunded')
    )
  )
  from public.contacts c
  where c.id = p_contact_id and c.tenant_id = p_tenant_id;
$$;

revoke all on function public.crm_contact_privacy_inventory(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.crm_contact_privacy_inventory(uuid,uuid)
to service_role;

create or replace function public.crm_export_contact_data(
  p_tenant_id uuid,
  p_contact_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exportedAt',now(),
    'contact',to_jsonb(c),
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'account',to_jsonb(a),
        'role',ac.role,
        'isPrimary',ac.is_primary
      ) order by a.name)
      from public.account_contacts ac
      join public.accounts a on a.id = ac.account_id
      where ac.contact_id = c.id and a.tenant_id = p_tenant_id
    ),'[]'::jsonb),
    'notes',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.contact_notes x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'tags',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from public.contact_tags ct
      join public.tags t on t.id = ct.tag_id
      where ct.contact_id = c.id and t.tenant_id = p_tenant_id
    ),'[]'::jsonb),
    'preferences',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.channel)
      from public.contact_channel_preferences x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'attribution',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.captured_at)
      from public.lead_attributions x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'conversations',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'conversation',to_jsonb(conv),
          'messages',coalesce((
            select jsonb_agg(to_jsonb(m) order by m.created_at)
            from public.messages m
            where m.tenant_id = p_tenant_id and m.conversation_id = conv.id
          ),'[]'::jsonb)
        )
        order by conv.created_at
      )
      from public.conversations conv
      where conv.tenant_id = p_tenant_id and conv.contact_id = c.id
    ),'[]'::jsonb),
    'deals',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.deals x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'tasks',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.tasks x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'proposals',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.proposals x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'transactions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.occurred_at)
      from public.customer_transactions x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb),
    'reviews',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.review_requests x
      where x.tenant_id = p_tenant_id and x.contact_id = c.id
    ),'[]'::jsonb)
  )
  from public.contacts c
  where c.id = p_contact_id and c.tenant_id = p_tenant_id;
$$;

revoke all on function public.crm_export_contact_data(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.crm_export_contact_data(uuid,uuid)
to service_role;

alter table public.privacy_requests enable row level security;
alter table public.business_calendars enable row level security;
alter table public.business_holidays enable row level security;

create policy "members privacy_requests" on public.privacy_requests
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members business_calendars" on public.business_calendars
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members business_holidays" on public.business_holidays
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

revoke all on public.privacy_requests, public.business_calendars,
  public.business_holidays
from anon;

grant select,insert,update,delete on public.privacy_requests,
  public.business_calendars, public.business_holidays
to authenticated;

grant all on public.privacy_requests, public.business_calendars,
  public.business_holidays
to service_role;
