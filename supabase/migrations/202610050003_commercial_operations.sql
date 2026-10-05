-- MIRA CRM v0.3 · commercial operations
-- Follow-ups, departments/routing, attribution and proposals.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  routing_mode text not null default 'manual'
    check (routing_mode in ('manual','round_robin','least_open')),
  sla_first_response_minutes integer not null default 15
    check (sla_first_response_minutes between 1 and 10080),
  sla_resolution_minutes integer
    check (sla_resolution_minutes is null or sla_resolution_minutes between 1 and 43200),
  business_hours jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists public.department_members (
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  routing_weight smallint not null default 1 check (routing_weight between 1 and 100),
  last_assigned_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (department_id, user_id)
);

alter table public.conversations
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists first_response_at timestamptz,
  add column if not exists sla_first_response_due_at timestamptz,
  add column if not exists sla_resolution_due_at timestamptz;

create index if not exists conversations_department_queue_idx
  on public.conversations (tenant_id, department_id, status, priority, last_message_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  kind text not null default 'follow_up'
    check (kind in ('follow_up','call','whatsapp','email','meeting','internal')),
  status text not null default 'open'
    check (status in ('open','done','cancelled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  due_at timestamptz not null,
  completed_at timestamptz,
  auto_created boolean not null default false,
  automation_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_queue_idx
  on public.tasks (tenant_id, status, due_at, priority);

create unique index if not exists tasks_automation_key_idx
  on public.tasks (tenant_id, automation_key)
  where automation_key is not null;

create or replace function private.sync_deal_followup_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'deal-followup:' || new.id::text;
begin
  if new.won_at is not null or new.lost_at is not null or new.next_followup_at is null then
    update public.tasks
    set status = case when status = 'open' then 'cancelled' else status end,
        updated_at = now()
    where tenant_id = new.tenant_id
      and automation_key = v_key;
    return new;
  end if;

  insert into public.tasks (
    tenant_id, contact_id, deal_id, assigned_to, title, kind, status,
    priority, due_at, auto_created, automation_key, metadata
  )
  values (
    new.tenant_id, new.contact_id, new.id, new.owner_user_id,
    'Follow-up · ' || new.title, 'follow_up', 'open',
    'normal', new.next_followup_at, true, v_key,
    jsonb_build_object('source','deal.next_followup_at')
  )
  on conflict (tenant_id, automation_key) where automation_key is not null
  do update set
    contact_id = excluded.contact_id,
    deal_id = excluded.deal_id,
    assigned_to = excluded.assigned_to,
    title = excluded.title,
    status = 'open',
    due_at = excluded.due_at,
    updated_at = now();

  return new;
end;
$$;

revoke execute on function private.sync_deal_followup_task() from public, anon, authenticated;

drop trigger if exists deals_sync_followup_task on public.deals;
create trigger deals_sync_followup_task
after insert or update of next_followup_at, owner_user_id, won_at, lost_at on public.deals
for each row execute function private.sync_deal_followup_task();

create table if not exists public.lead_attributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  touch_type text not null default 'visit'
    check (touch_type in ('visit','lead','conversation','conversion','manual')),
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  referrer text,
  landing_path text,
  click_id text,
  channel text,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists lead_attributions_contact_idx
  on public.lead_attributions (tenant_id, contact_id, captured_at asc);

create index if not exists lead_attributions_campaign_idx
  on public.lead_attributions (tenant_id, campaign, captured_at desc);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  number bigint generated by default as identity,
  public_token uuid not null default gen_random_uuid() unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  deal_id uuid references public.deals(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','accepted','rejected','expired','cancelled')),
  currency text not null default 'BRL',
  title text not null default 'Proposta comercial',
  intro text,
  terms text,
  expires_at timestamptz,
  discount_type text not null default 'none'
    check (discount_type in ('none','fixed','percentage')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  accepted_by_name text,
  accepted_by_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create index if not exists proposals_pipeline_idx
  on public.proposals (tenant_id, status, updated_at desc);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists proposal_items_order_idx
  on public.proposal_items (proposal_id, position, created_at);

alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.tasks enable row level security;
alter table public.lead_attributions enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;

create policy "members departments" on public.departments
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members department_members" on public.department_members
for all to authenticated
using (exists (
  select 1 from public.departments d
  where d.id = department_id and (select private.is_tenant_member(d.tenant_id))
))
with check (exists (
  select 1 from public.departments d
  where d.id = department_id and (select private.is_tenant_member(d.tenant_id))
));

create policy "members tasks" on public.tasks
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members lead_attributions" on public.lead_attributions
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members proposals" on public.proposals
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members proposal_items" on public.proposal_items
for all to authenticated
using (exists (
  select 1 from public.proposals p
  where p.id = proposal_id and (select private.is_tenant_member(p.tenant_id))
))
with check (exists (
  select 1 from public.proposals p
  where p.id = proposal_id and (select private.is_tenant_member(p.tenant_id))
));

create or replace function private.set_conversation_sla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first integer;
  v_resolution integer;
begin
  if new.department_id is null then
    new.sla_first_response_due_at := null;
    new.sla_resolution_due_at := null;
    return new;
  end if;

  select d.sla_first_response_minutes, d.sla_resolution_minutes
  into v_first, v_resolution
  from public.departments d
  where d.id = new.department_id
    and d.tenant_id = new.tenant_id
    and d.active = true;

  if v_first is null then
    raise exception 'department inválido para o tenant';
  end if;

  if tg_op = 'INSERT' or new.department_id is distinct from old.department_id then
    new.sla_first_response_due_at :=
      coalesce(new.first_message_at, new.created_at, now()) + make_interval(mins => v_first);
    new.sla_resolution_due_at :=
      case when v_resolution is null then null
      else coalesce(new.first_message_at, new.created_at, now()) + make_interval(mins => v_resolution)
      end;
  end if;

  return new;
end;
$$;

revoke execute on function private.set_conversation_sla() from public, anon, authenticated;

drop trigger if exists conversations_set_sla on public.conversations;
create trigger conversations_set_sla
before insert or update of department_id on public.conversations
for each row execute function private.set_conversation_sla();

create or replace function private.capture_first_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'outbound'
     and new.actor in ('human','mira')
     and new.status in ('sent','delivered','read')
  then
    update public.conversations
    set first_response_at = coalesce(first_response_at, coalesce(new.sent_at, new.created_at)),
        updated_at = now()
    where id = new.conversation_id
      and tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;

revoke execute on function private.capture_first_response() from public, anon, authenticated;

drop trigger if exists messages_capture_first_response on public.messages;
create trigger messages_capture_first_response
after insert or update of status on public.messages
for each row execute function private.capture_first_response();

create or replace function private.recompute_proposal_totals(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal bigint := 0;
  v_type text := 'none';
  v_value numeric(12,2) := 0;
  v_discount bigint := 0;
begin
  select coalesce(sum(round(i.quantity * i.unit_price_cents)::bigint),0)
  into v_subtotal
  from public.proposal_items i
  where i.proposal_id = p_proposal_id;

  select p.discount_type, p.discount_value
  into v_type, v_value
  from public.proposals p
  where p.id = p_proposal_id;

  v_discount := case
    when v_type = 'fixed' then least(v_subtotal, round(v_value * 100)::bigint)
    when v_type = 'percentage' then least(v_subtotal, round(v_subtotal * least(v_value,100) / 100)::bigint)
    else 0
  end;

  update public.proposals
  set subtotal_cents = v_subtotal,
      discount_cents = v_discount,
      total_cents = greatest(0, v_subtotal - v_discount),
      updated_at = now()
  where id = p_proposal_id;
end;
$$;

revoke execute on function private.recompute_proposal_totals(uuid) from public, anon, authenticated;

create or replace function private.proposal_items_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recompute_proposal_totals(old.proposal_id);
    return old;
  end if;

  perform private.recompute_proposal_totals(new.proposal_id);

  if tg_op = 'UPDATE' and old.proposal_id <> new.proposal_id then
    perform private.recompute_proposal_totals(old.proposal_id);
  end if;

  return new;
end;
$$;

revoke execute on function private.proposal_items_after_change() from public, anon, authenticated;

drop trigger if exists proposal_items_recompute on public.proposal_items;
create trigger proposal_items_recompute
after insert or update or delete on public.proposal_items
for each row execute function private.proposal_items_after_change();

create or replace function private.proposals_discount_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.discount_type is distinct from old.discount_type
     or new.discount_value is distinct from old.discount_value
  then
    perform private.recompute_proposal_totals(new.id);
  end if;
  return new;
end;
$$;

revoke execute on function private.proposals_discount_after_change() from public, anon, authenticated;

drop trigger if exists proposals_recompute_discount on public.proposals;
create trigger proposals_recompute_discount
after update of discount_type, discount_value on public.proposals
for each row execute function private.proposals_discount_after_change();


create or replace function public.crm_create_proposal(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_deal_id uuid,
  p_owner_user_id uuid,
  p_title text,
  p_intro text,
  p_terms text,
  p_expires_at timestamptz,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals%rowtype;
  v_item jsonb;
  v_description text;
  v_quantity numeric;
  v_unit_price bigint;
  v_position integer := 0;
begin
  if not exists(select 1 from public.contacts c where c.id = p_contact_id and c.tenant_id = p_tenant_id) then
    raise exception 'contato inválido para o tenant';
  end if;

  if p_deal_id is not null and not exists(
    select 1 from public.deals d where d.id = p_deal_id and d.tenant_id = p_tenant_id and d.contact_id = p_contact_id
  ) then
    raise exception 'negociação inválida para o contato';
  end if;

  if p_owner_user_id is not null and not exists(
    select 1 from public.tenant_members tm where tm.tenant_id = p_tenant_id and tm.user_id = p_owner_user_id
  ) then
    raise exception 'responsável inválido para o tenant';
  end if;

  if coalesce(jsonb_typeof(p_items),'') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'proposta precisa de pelo menos um item';
  end if;

  if coalesce(p_discount_type,'none') not in ('none','fixed','percentage') then
    raise exception 'tipo de desconto inválido';
  end if;

  insert into public.proposals (
    tenant_id, contact_id, deal_id, owner_user_id, title, intro, terms,
    expires_at, discount_type, discount_value, status
  )
  values (
    p_tenant_id, p_contact_id, p_deal_id, p_owner_user_id,
    coalesce(nullif(trim(p_title),''),'Proposta comercial'),
    nullif(trim(coalesce(p_intro,'')),''),
    nullif(trim(coalesce(p_terms,'')),''),
    p_expires_at,
    coalesce(p_discount_type,'none'),
    greatest(coalesce(p_discount_value,0),0),
    'draft'
  )
  returning * into v_proposal;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_description := nullif(trim(coalesce(v_item->>'description','')),'');
    v_quantity := coalesce((v_item->>'quantity')::numeric, 1);
    v_unit_price := coalesce((v_item->>'unitPriceCents')::bigint, 0);
    v_position := v_position + 1;

    if v_description is null then raise exception 'descrição de item obrigatória'; end if;
    if v_quantity <= 0 then raise exception 'quantidade inválida'; end if;
    if v_unit_price < 0 then raise exception 'preço inválido'; end if;

    insert into public.proposal_items (
      proposal_id, position, description, quantity, unit_price_cents, metadata
    )
    values (
      v_proposal.id,
      coalesce((v_item->>'position')::integer, v_position),
      v_description,
      v_quantity,
      v_unit_price,
      coalesce(v_item->'metadata','{}'::jsonb)
    );
  end loop;

  select * into v_proposal from public.proposals where id = v_proposal.id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata
  )
  values (
    p_tenant_id, 'system', 'proposal-rpc', 'proposal.created',
    'proposal', v_proposal.id::text,
    jsonb_build_object('number',v_proposal.number,'totalCents',v_proposal.total_cents)
  );

  return jsonb_build_object(
    'id', v_proposal.id,
    'number', v_proposal.number,
    'publicToken', v_proposal.public_token,
    'totalCents', v_proposal.total_cents
  );
end;
$$;

revoke all on function public.crm_create_proposal(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,numeric,jsonb)
from public, anon, authenticated;
grant execute on function public.crm_create_proposal(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,numeric,jsonb)
to service_role;


create or replace function public.crm_route_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_department public.departments%rowtype;
  v_user_id uuid;
begin
  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for update;

  if v_conversation.id is null then raise exception 'conversa não encontrada'; end if;
  if v_conversation.assigned_to is not null then
    return jsonb_build_object('assigned',true,'userId',v_conversation.assigned_to,'reason','already-assigned');
  end if;
  if v_conversation.department_id is null then
    return jsonb_build_object('assigned',false,'reason','no-department');
  end if;

  select * into v_department
  from public.departments d
  where d.id = v_conversation.department_id
    and d.tenant_id = v_conversation.tenant_id
    and d.active = true;

  if v_department.id is null then
    return jsonb_build_object('assigned',false,'reason','department-inactive');
  end if;
  if v_department.routing_mode = 'manual' then
    return jsonb_build_object('assigned',false,'reason','manual-routing');
  end if;

  if v_department.routing_mode = 'least_open' then
    select dm.user_id into v_user_id
    from public.department_members dm
    left join public.conversations c
      on c.tenant_id = v_conversation.tenant_id
     and c.department_id = v_department.id
     and c.assigned_to = dm.user_id
     and c.status <> 'resolved'
    where dm.department_id = v_department.id
      and dm.active = true
    group by dm.user_id, dm.last_assigned_at
    order by count(c.id) asc, dm.last_assigned_at asc nulls first, dm.user_id
    limit 1;
  else
    select dm.user_id into v_user_id
    from public.department_members dm
    where dm.department_id = v_department.id
      and dm.active = true
    order by dm.last_assigned_at asc nulls first, dm.user_id
    limit 1;
  end if;

  if v_user_id is null then
    return jsonb_build_object('assigned',false,'reason','no-active-member');
  end if;

  update public.conversations
  set assigned_to = v_user_id,
      updated_at = now()
  where id = v_conversation.id;

  update public.department_members
  set last_assigned_at = now()
  where department_id = v_department.id
    and user_id = v_user_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata
  )
  values (
    v_conversation.tenant_id, 'system', 'routing',
    'conversation.assigned', 'conversation', v_conversation.id::text,
    jsonb_build_object('departmentId',v_department.id,'userId',v_user_id,'mode',v_department.routing_mode)
  );

  return jsonb_build_object('assigned',true,'userId',v_user_id,'reason',v_department.routing_mode);
end;
$$;

revoke all on function public.crm_route_conversation(uuid) from public, anon, authenticated;
grant execute on function public.crm_route_conversation(uuid) to service_role;

create or replace function public.crm_accept_proposal(
  p_public_token uuid,
  p_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals%rowtype;
  v_name text := nullif(trim(coalesce(p_name,'')),'');
  v_email text := nullif(trim(coalesce(p_email,'')),'');
begin
  if v_name is null then raise exception 'nome obrigatório'; end if;

  select * into v_proposal
  from public.proposals p
  where p.public_token = p_public_token
  for update;

  if v_proposal.id is null then raise exception 'proposta não encontrada'; end if;

  if v_proposal.status = 'accepted' then
    return jsonb_build_object('accepted',true,'alreadyAccepted',true,'proposalId',v_proposal.id);
  end if;

  if v_proposal.expires_at is not null and v_proposal.expires_at < now() then
    update public.proposals
    set status = 'expired', updated_at = now()
    where id = v_proposal.id and status in ('sent','viewed');
    raise exception 'proposta expirada';
  end if;

  if v_proposal.status not in ('sent','viewed') then
    raise exception 'proposta indisponível para aceite';
  end if;

  update public.proposals
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_name = left(v_name,160),
      accepted_by_email = case when v_email is null then null else left(v_email,240) end,
      updated_at = now()
  where id = v_proposal.id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata
  )
  values (
    v_proposal.tenant_id, 'system', 'public-proposal',
    'proposal.accepted', 'proposal', v_proposal.id::text,
    jsonb_build_object('number',v_proposal.number,'hasEmail',v_email is not null)
  );

  return jsonb_build_object('accepted',true,'alreadyAccepted',false,'proposalId',v_proposal.id);
end;
$$;

revoke all on function public.crm_accept_proposal(uuid,text,text) from public, anon, authenticated;
grant execute on function public.crm_accept_proposal(uuid,text,text) to service_role;

create or replace view public.task_queue
with (security_invoker = true)
as
select
  t.*,
  (t.status = 'open' and t.due_at < now()) as overdue,
  c.display_name as contact_name,
  d.title as deal_title
from public.tasks t
left join public.contacts c on c.id = t.contact_id
left join public.deals d on d.id = t.deal_id;

create or replace view public.contact_attribution
with (security_invoker = true)
as
with first_touch as (
  select distinct on (a.tenant_id, a.contact_id)
    a.tenant_id, a.contact_id, a.source, a.medium, a.campaign, a.content, a.term,
    a.referrer, a.landing_path, a.click_id, a.channel, a.captured_at
  from public.lead_attributions a
  order by a.tenant_id, a.contact_id, a.captured_at asc, a.id asc
),
last_touch as (
  select distinct on (a.tenant_id, a.contact_id)
    a.tenant_id, a.contact_id, a.source, a.medium, a.campaign, a.content, a.term,
    a.referrer, a.landing_path, a.click_id, a.channel, a.captured_at
  from public.lead_attributions a
  order by a.tenant_id, a.contact_id, a.captured_at desc, a.id desc
)
select
  c.tenant_id,
  c.id as contact_id,
  c.display_name,
  ft.source as first_source,
  ft.medium as first_medium,
  ft.campaign as first_campaign,
  ft.captured_at as first_touch_at,
  lt.source as last_source,
  lt.medium as last_medium,
  lt.campaign as last_campaign,
  lt.captured_at as last_touch_at
from public.contacts c
left join first_touch ft on ft.tenant_id = c.tenant_id and ft.contact_id = c.id
left join last_touch lt on lt.tenant_id = c.tenant_id and lt.contact_id = c.id;

create or replace view public.department_workload
with (security_invoker = true)
as
select
  d.id as department_id,
  d.tenant_id,
  d.name,
  d.routing_mode,
  d.sla_first_response_minutes,
  count(c.id) filter (where c.status <> 'resolved')::integer as open_conversations,
  count(c.id) filter (
    where c.status <> 'resolved'
      and c.first_response_at is null
      and c.sla_first_response_due_at < now()
  )::integer as first_response_sla_breaches
from public.departments d
left join public.conversations c on c.department_id = d.id
group by d.id;

create or replace view public.proposal_summary
with (security_invoker = true)
as
select
  p.id,
  p.number,
  p.public_token,
  p.tenant_id,
  p.contact_id,
  c.display_name as contact_name,
  c.email as contact_email,
  p.deal_id,
  p.owner_user_id,
  p.status,
  p.currency,
  p.title,
  p.expires_at,
  p.subtotal_cents,
  p.discount_cents,
  p.total_cents,
  p.sent_at,
  p.viewed_at,
  p.accepted_at,
  p.created_at,
  p.updated_at
from public.proposals p
join public.contacts c on c.id = p.contact_id;

revoke all on public.departments, public.department_members, public.tasks,
  public.lead_attributions, public.proposals, public.proposal_items
from anon;

grant select, insert, update, delete on public.departments, public.department_members,
  public.tasks, public.lead_attributions, public.proposals, public.proposal_items
to authenticated;

grant select on public.task_queue, public.contact_attribution,
  public.department_workload, public.proposal_summary
to authenticated;

grant all on public.departments, public.department_members, public.tasks,
  public.lead_attributions, public.proposals, public.proposal_items
to service_role;

grant select on public.task_queue, public.contact_attribution,
  public.department_workload, public.proposal_summary
to service_role;

grant usage, select on sequence public.proposals_number_seq to authenticated, service_role;
