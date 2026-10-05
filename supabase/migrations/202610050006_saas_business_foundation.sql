-- MIRA CRM v0.6 · B2B accounts, catalog, history and SaaS entitlements.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 240),
  legal_name text,
  document_id text,
  website text,
  industry text,
  size_label text,
  status text not null default 'prospect'
    check (status in ('prospect','customer','inactive')),
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_tenant_status_idx
  on public.accounts (tenant_id, status, name);

create unique index if not exists accounts_document_idx
  on public.accounts (tenant_id, document_id)
  where document_id is not null and document_id <> '';

create or replace function private.validate_account_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if new.owner_user_id is not null and not exists(
    select 1 from public.tenant_members tm
    where tm.tenant_id = new.tenant_id and tm.user_id = new.owner_user_id
  ) then
    raise exception 'responsável não pertence ao tenant';
  end if;
  return new;
end;
$;

revoke execute on function private.validate_account_owner() from public, anon, authenticated;

drop trigger if exists accounts_validate_owner on public.accounts;
create trigger accounts_validate_owner
before insert or update of owner_user_id, tenant_id on public.accounts
for each row execute function private.validate_account_owner();

create table if not exists public.account_contacts (
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (account_id, contact_id)
);

create unique index if not exists account_contacts_one_primary_idx
  on public.account_contacts (account_id)
  where is_primary = true;

create or replace function private.validate_account_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_tenant uuid;
  v_contact_tenant uuid;
begin
  select a.tenant_id into v_account_tenant
  from public.accounts a where a.id = new.account_id;

  select c.tenant_id into v_contact_tenant
  from public.contacts c where c.id = new.contact_id;

  if v_account_tenant is null or v_contact_tenant is null or v_account_tenant <> v_contact_tenant then
    raise exception 'account/contact incompatíveis';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_account_contact() from public, anon, authenticated;

drop trigger if exists account_contacts_validate on public.account_contacts;
create trigger account_contacts_validate
before insert or update on public.account_contacts
for each row execute function private.validate_account_contact();

alter table public.deals
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

alter table public.proposals
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create or replace function private.validate_account_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is null then return new; end if;

  if not exists(
    select 1 from public.accounts a
    where a.id = new.account_id and a.tenant_id = new.tenant_id
  ) then
    raise exception 'account não pertence ao tenant';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_account_reference() from public, anon, authenticated;

drop trigger if exists deals_validate_account on public.deals;
create trigger deals_validate_account
before insert or update of account_id on public.deals
for each row execute function private.validate_account_reference();

drop trigger if exists proposals_validate_account on public.proposals;
create trigger proposals_validate_account
before insert or update of account_id on public.proposals
for each row execute function private.validate_account_reference();

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_type text not null default 'product'
    check (item_type in ('product','service')),
  sku text,
  name text not null check (char_length(name) between 1 and 240),
  description text,
  default_price_cents bigint not null default 0 check (default_price_cents >= 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalog_items_sku_idx
  on public.catalog_items (tenant_id, sku)
  where sku is not null and sku <> '';

create index if not exists catalog_items_active_idx
  on public.catalog_items (tenant_id, active, item_type, name);

create table if not exists public.price_books (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  active boolean not null default true,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create unique index if not exists price_books_one_default_idx
  on public.price_books (tenant_id)
  where is_default = true;

create table if not exists public.price_book_items (
  price_book_id uuid not null references public.price_books(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  price_cents bigint not null check (price_cents >= 0),
  min_quantity numeric(12,3) not null default 1 check (min_quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (price_book_id, catalog_item_id, min_quantity)
);

create or replace function private.validate_price_book_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book_tenant uuid;
  v_item_tenant uuid;
begin
  select p.tenant_id into v_book_tenant from public.price_books p where p.id = new.price_book_id;
  select i.tenant_id into v_item_tenant from public.catalog_items i where i.id = new.catalog_item_id;

  if v_book_tenant is null or v_item_tenant is null or v_book_tenant <> v_item_tenant then
    raise exception 'price book/item incompatíveis';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_price_book_item() from public, anon, authenticated;

drop trigger if exists price_book_items_validate on public.price_book_items;
create trigger price_book_items_validate
before insert or update on public.price_book_items
for each row execute function private.validate_price_book_item();

alter table public.proposal_items
  add column if not exists catalog_item_id uuid references public.catalog_items(id) on delete set null;

create or replace function private.validate_proposal_catalog_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal_tenant uuid;
  v_item_tenant uuid;
begin
  if new.catalog_item_id is null then return new; end if;

  select p.tenant_id into v_proposal_tenant
  from public.proposals p where p.id = new.proposal_id;

  select i.tenant_id into v_item_tenant
  from public.catalog_items i where i.id = new.catalog_item_id;

  if v_proposal_tenant is null or v_item_tenant is null or v_proposal_tenant <> v_item_tenant then
    raise exception 'item de catálogo incompatível com proposta';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_proposal_catalog_item() from public, anon, authenticated;

drop trigger if exists proposal_items_validate_catalog on public.proposal_items;
create trigger proposal_items_validate_catalog
before insert or update of catalog_item_id, proposal_id on public.proposal_items
for each row execute function private.validate_proposal_catalog_item();

create table if not exists public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  entered_at timestamptz not null,
  left_at timestamptz,
  duration_seconds bigint,
  created_at timestamptz not null default now()
);

create index if not exists deal_stage_history_deal_idx
  on public.deal_stage_history (tenant_id, deal_id, entered_at asc);

create index if not exists deal_stage_history_stage_idx
  on public.deal_stage_history (tenant_id, stage_id, entered_at desc);

create unique index if not exists deal_stage_history_open_idx
  on public.deal_stage_history (deal_id)
  where left_at is null;

create or replace function private.sync_deal_stage_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(new.updated_at,now());
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history (
      tenant_id, deal_id, pipeline_id, stage_id, entered_at
    )
    values (
      new.tenant_id, new.id, new.pipeline_id, new.stage_id,
      coalesce(new.created_at,now())
    );
    return new;
  end if;

  if old.stage_id is distinct from new.stage_id then
    update public.deal_stage_history
    set left_at = v_now,
        duration_seconds = greatest(0,floor(extract(epoch from (v_now - entered_at)))::bigint)
    where deal_id = new.id and left_at is null;

    insert into public.deal_stage_history (
      tenant_id, deal_id, pipeline_id, stage_id, entered_at
    )
    values (
      new.tenant_id, new.id, new.pipeline_id, new.stage_id, v_now
    );
  end if;

  if (old.won_at is null and new.won_at is not null)
     or (old.lost_at is null and new.lost_at is not null)
  then
    v_now := coalesce(new.won_at,new.lost_at,new.updated_at,now());
    update public.deal_stage_history
    set left_at = v_now,
        duration_seconds = greatest(0,floor(extract(epoch from (v_now - entered_at)))::bigint)
    where deal_id = new.id and left_at is null;
  end if;

  return new;
end;
$$;

revoke execute on function private.sync_deal_stage_history() from public, anon, authenticated;

drop trigger if exists deals_stage_history on public.deals;
create trigger deals_stage_history
after insert or update of stage_id, won_at, lost_at on public.deals
for each row execute function private.sync_deal_stage_history();

insert into public.deal_stage_history (
  tenant_id, deal_id, pipeline_id, stage_id, entered_at
)
select
  d.tenant_id, d.id, d.pipeline_id, d.stage_id, d.created_at
from public.deals d
where d.won_at is null
  and d.lost_at is null
  and not exists(
    select 1 from public.deal_stage_history h
    where h.deal_id = d.id and h.left_at is null
  )
on conflict do nothing;

create table if not exists public.conversation_assignment_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_department_id uuid references public.departments(id) on delete set null,
  to_department_id uuid references public.departments(id) on delete set null,
  from_user_id uuid references auth.users(id) on delete set null,
  to_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_assignment_history_idx
  on public.conversation_assignment_history (tenant_id, conversation_id, created_at desc);

create or replace function private.capture_conversation_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.department_id is distinct from new.department_id
     or old.assigned_to is distinct from new.assigned_to
  then
    insert into public.conversation_assignment_history (
      tenant_id, conversation_id,
      from_department_id, to_department_id,
      from_user_id, to_user_id,
      source
    )
    values (
      new.tenant_id, new.id,
      old.department_id, new.department_id,
      old.assigned_to, new.assigned_to,
      'conversation-update'
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.capture_conversation_assignment_history() from public, anon, authenticated;

drop trigger if exists conversations_assignment_history on public.conversations;
create trigger conversations_assignment_history
after update of department_id, assigned_to on public.conversations
for each row execute function private.capture_conversation_assignment_history();

create table if not exists public.tenant_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_key text not null default 'trial',
  status text not null default 'trial'
    check (status in ('trial','active','past_due','paused','cancelled')),
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  external_customer_id text,
  external_subscription_id text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.ensure_tenant_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_subscriptions (
    tenant_id, plan_key, status, features, limits
  )
  values (
    new.id,
    'trial',
    'trial',
    jsonb_build_object(
      'crm',true,
      'whatsapp',true,
      'automations',true,
      'proposals',true,
      'webhooks',true
    ),
    '{}'::jsonb
  )
  on conflict (tenant_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.ensure_tenant_subscription() from public, anon, authenticated;

drop trigger if exists tenants_subscription_default on public.tenants;
create trigger tenants_subscription_default
after insert on public.tenants
for each row execute function private.ensure_tenant_subscription();

insert into public.tenant_subscriptions (
  tenant_id, plan_key, status, features, limits
)
select
  t.id,
  'trial',
  'trial',
  jsonb_build_object(
    'crm',true,
    'whatsapp',true,
    'automations',true,
    'proposals',true,
    'webhooks',true
  ),
  '{}'::jsonb
from public.tenants t
on conflict (tenant_id) do nothing;

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null check (metric ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  quantity bigint not null default 1 check (quantity > 0),
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);

create index if not exists usage_events_metric_idx
  on public.usage_events (tenant_id, metric, occurred_at desc);

create table if not exists public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  period_start date not null,
  period_end date not null,
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, period_start)
);

create or replace function private.usage_event_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month',new.occurred_at at time zone 'UTC')::date;
  v_end date := (date_trunc('month',new.occurred_at at time zone 'UTC') + interval '1 month')::date;
begin
  insert into public.usage_counters (
    tenant_id, metric, period_start, period_end, quantity, updated_at
  )
  values (
    new.tenant_id, new.metric, v_start, v_end, new.quantity, now()
  )
  on conflict (tenant_id,metric,period_start) do update set
    quantity = usage_counters.quantity + excluded.quantity,
    period_end = excluded.period_end,
    updated_at = now();

  return new;
end;
$$;

revoke execute on function private.usage_event_after_insert() from public, anon, authenticated;

drop trigger if exists usage_events_increment on public.usage_events;
create trigger usage_events_increment
after insert on public.usage_events
for each row execute function private.usage_event_after_insert();

create or replace function public.crm_record_usage(
  p_tenant_id uuid,
  p_metric text,
  p_quantity bigint,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists(select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant inválido';
  end if;

  insert into public.usage_events (
    tenant_id,metric,quantity,dedupe_key,metadata
  )
  values (
    p_tenant_id,
    trim(p_metric),
    greatest(coalesce(p_quantity,1),1),
    trim(p_dedupe_key),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (tenant_id,dedupe_key) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function public.crm_record_usage(uuid,text,bigint,text,jsonb)
from public, anon, authenticated;
grant execute on function public.crm_record_usage(uuid,text,bigint,text,jsonb)
to service_role;

create or replace view public.account_metrics
with (security_invoker = true)
as
select
  a.id as account_id,
  a.tenant_id,
  a.name,
  a.status,
  (
    select count(*)::integer
    from public.account_contacts ac
    where ac.account_id = a.id
  ) as contacts_count,
  (
    select count(*)::integer
    from public.deals d
    where d.account_id = a.id
      and d.won_at is null
      and d.lost_at is null
  ) as open_deals,
  (
    select coalesce(sum(d.value_cents),0)::bigint
    from public.deals d
    where d.account_id = a.id
      and d.won_at is null
      and d.lost_at is null
  ) as open_pipeline_cents,
  (
    select coalesce(sum(tx.amount_cents),0)::bigint
    from public.customer_transactions tx
    where tx.status = 'completed'
      and exists(
        select 1 from public.account_contacts ac
        where ac.account_id = a.id
          and ac.contact_id = tx.contact_id
      )
  ) as lifetime_value_cents,
  (
    select max(tx.occurred_at)
    from public.customer_transactions tx
    where tx.status = 'completed'
      and exists(
        select 1 from public.account_contacts ac
        where ac.account_id = a.id
          and ac.contact_id = tx.contact_id
      )
  ) as last_purchase_at
from public.accounts a;

create or replace view public.deal_velocity
with (security_invoker = true)
as
select
  h.tenant_id,
  h.pipeline_id,
  h.stage_id,
  count(*)::integer as passages,
  avg(h.duration_seconds)::bigint as avg_duration_seconds,
  percentile_cont(0.5) within group (order by h.duration_seconds) as median_duration_seconds
from public.deal_stage_history h
where h.duration_seconds is not null
group by h.tenant_id,h.pipeline_id,h.stage_id;

alter table public.accounts enable row level security;
alter table public.account_contacts enable row level security;
alter table public.catalog_items enable row level security;
alter table public.price_books enable row level security;
alter table public.price_book_items enable row level security;
alter table public.deal_stage_history enable row level security;
alter table public.conversation_assignment_history enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.usage_counters enable row level security;

create policy "members accounts" on public.accounts
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members account_contacts" on public.account_contacts
for all to authenticated
using (exists(
  select 1 from public.accounts a
  where a.id = account_id and (select private.is_tenant_member(a.tenant_id))
))
with check (exists(
  select 1 from public.accounts a
  where a.id = account_id and (select private.is_tenant_member(a.tenant_id))
));

create policy "members catalog_items" on public.catalog_items
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members price_books" on public.price_books
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members price_book_items" on public.price_book_items
for all to authenticated
using (exists(
  select 1 from public.price_books p
  where p.id = price_book_id and (select private.is_tenant_member(p.tenant_id))
))
with check (exists(
  select 1 from public.price_books p
  where p.id = price_book_id and (select private.is_tenant_member(p.tenant_id))
));

create policy "members deal_stage_history" on public.deal_stage_history
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members conversation_assignment_history" on public.conversation_assignment_history
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members tenant_subscriptions read" on public.tenant_subscriptions
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members usage_counters read" on public.usage_counters
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

revoke all on public.accounts, public.account_contacts, public.catalog_items,
  public.price_books, public.price_book_items, public.deal_stage_history,
  public.conversation_assignment_history, public.tenant_subscriptions,
  public.usage_events, public.usage_counters
from anon;

grant select,insert,update,delete on public.accounts, public.account_contacts,
  public.catalog_items, public.price_books, public.price_book_items
to authenticated;

grant select on public.deal_stage_history, public.conversation_assignment_history,
  public.tenant_subscriptions, public.usage_counters,
  public.account_metrics, public.deal_velocity
to authenticated;

grant all on public.accounts, public.account_contacts, public.catalog_items,
  public.price_books, public.price_book_items, public.deal_stage_history,
  public.conversation_assignment_history, public.tenant_subscriptions,
  public.usage_events, public.usage_counters
to service_role;

grant select on public.account_metrics, public.deal_velocity to service_role;
