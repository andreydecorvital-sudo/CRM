-- CRM v0.4 · customer intelligence foundation
-- Backend-first: timeline, custom fields, consent, lead scoring, saved views and AI knowledge.

alter table public.customer_settings
  add column if not exists lead_score_warm_threshold integer not null default 25,
  add column if not exists lead_score_hot_threshold integer not null default 60,
  add constraint customer_settings_score_thresholds_check
    check (
      lead_score_warm_threshold >= 0
      and lead_score_hot_threshold > lead_score_warm_threshold
    );

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 12000),
  pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_notes_contact_idx
  on public.contact_notes (tenant_id, contact_id, pinned desc, created_at desc);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('contact','deal','conversation','proposal')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text not null check (char_length(label) between 1 and 120),
  data_type text not null
    check (data_type in ('text','number','date','boolean','select','multi_select','json')),
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity_type, key)
);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('contact','deal','conversation','proposal')),
  entity_id uuid not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (definition_id, entity_id)
);

create index if not exists custom_field_values_entity_idx
  on public.custom_field_values (tenant_id, entity_type, entity_id);

create or replace function private.validate_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.custom_field_definitions%rowtype;
  v_valid boolean := false;
begin
  select * into v_definition
  from public.custom_field_definitions d
  where d.id = new.definition_id;

  if v_definition.id is null then
    raise exception 'campo customizado inexistente';
  end if;

  if v_definition.tenant_id <> new.tenant_id
     or v_definition.entity_type <> new.entity_type
  then
    raise exception 'campo customizado incompatível com tenant/entidade';
  end if;

  v_valid := case new.entity_type
    when 'contact' then exists(
      select 1 from public.contacts x
      where x.id = new.entity_id and x.tenant_id = new.tenant_id
    )
    when 'deal' then exists(
      select 1 from public.deals x
      where x.id = new.entity_id and x.tenant_id = new.tenant_id
    )
    when 'conversation' then exists(
      select 1 from public.conversations x
      where x.id = new.entity_id and x.tenant_id = new.tenant_id
    )
    when 'proposal' then exists(
      select 1 from public.proposals x
      where x.id = new.entity_id and x.tenant_id = new.tenant_id
    )
    else false
  end;

  if not v_valid then
    raise exception 'entidade não pertence ao tenant';
  end if;

  if v_definition.data_type = 'boolean' and jsonb_typeof(new.value) <> 'boolean' then
    raise exception 'valor booleano inválido';
  elsif v_definition.data_type = 'number' and jsonb_typeof(new.value) <> 'number' then
    raise exception 'valor numérico inválido';
  elsif v_definition.data_type in ('text','date','select') and jsonb_typeof(new.value) <> 'string' then
    raise exception 'valor textual inválido';
  elsif v_definition.data_type = 'multi_select' and jsonb_typeof(new.value) <> 'array' then
    raise exception 'valor multi_select inválido';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_custom_field_value() from public, anon, authenticated;

drop trigger if exists custom_field_values_validate on public.custom_field_values;
create trigger custom_field_values_validate
before insert or update on public.custom_field_values
for each row execute function private.validate_custom_field_value();

create table if not exists public.contact_channel_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email','sms','phone')),
  status text not null default 'unknown'
    check (status in ('unknown','opted_in','opted_out','transactional_only')),
  source text,
  reason text,
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, channel)
);

create index if not exists contact_channel_preferences_tenant_idx
  on public.contact_channel_preferences (tenant_id, channel, status);

create or replace function private.validate_contact_channel_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(
    select 1 from public.contacts c
    where c.id = new.contact_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'contato não pertence ao tenant';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_contact_channel_preference() from public, anon, authenticated;

drop trigger if exists contact_channel_preferences_validate on public.contact_channel_preferences;
create trigger contact_channel_preferences_validate
before insert or update on public.contact_channel_preferences
for each row execute function private.validate_contact_channel_preference();

create table if not exists public.lead_score_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  event_type text,
  field_path text not null check (char_length(field_path) between 1 and 240),
  operator text not null
    check (operator in ('eq','neq','gt','gte','lt','lte','contains','exists','in')),
  compare_value jsonb,
  points integer not null check (points between -100 and 100),
  enabled boolean not null default true,
  priority integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_score_rules_event_idx
  on public.lead_score_rules (tenant_id, event_type, enabled, priority);

create table if not exists public.lead_score_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  rule_id uuid references public.lead_score_rules(id) on delete set null,
  event_key text not null,
  points integer not null check (points between -100 and 100),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, event_key)
);

create index if not exists lead_score_events_contact_idx
  on public.lead_score_events (tenant_id, contact_id, created_at desc);

create table if not exists public.contact_scores (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  score integer not null default 0,
  grade text not null default 'cold' check (grade in ('cold','warm','hot')),
  last_reason text,
  updated_at timestamptz not null default now()
);

create index if not exists contact_scores_rank_idx
  on public.contact_scores (tenant_id, score desc, updated_at desc);

create or replace function private.refresh_contact_score(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score integer := 0;
  v_warm integer := 25;
  v_hot integer := 60;
  v_grade text := 'cold';
begin
  if not exists(
    select 1 from public.contacts c
    where c.id = p_contact_id and c.tenant_id = p_tenant_id
  ) then
    return;
  end if;

  select coalesce(sum(e.points),0)::integer
  into v_score
  from public.lead_score_events e
  where e.tenant_id = p_tenant_id
    and e.contact_id = p_contact_id;

  select s.lead_score_warm_threshold, s.lead_score_hot_threshold
  into v_warm, v_hot
  from public.customer_settings s
  where s.tenant_id = p_tenant_id;

  v_warm := coalesce(v_warm,25);
  v_hot := coalesce(v_hot,60);

  v_grade := case
    when v_score >= v_hot then 'hot'
    when v_score >= v_warm then 'warm'
    else 'cold'
  end;

  insert into public.contact_scores (
    contact_id, tenant_id, score, grade, last_reason, updated_at
  )
  values (
    p_contact_id, p_tenant_id, v_score, v_grade, nullif(trim(coalesce(p_reason,'')),''), now()
  )
  on conflict (contact_id) do update set
    tenant_id = excluded.tenant_id,
    score = excluded.score,
    grade = excluded.grade,
    last_reason = coalesce(excluded.last_reason, public.contact_scores.last_reason),
    updated_at = now();
end;
$$;

revoke execute on function private.refresh_contact_score(uuid,uuid,text) from public, anon, authenticated;

create or replace function private.lead_score_events_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_contact_score(old.tenant_id, old.contact_id, 'score event removed');
    return old;
  end if;

  perform private.refresh_contact_score(new.tenant_id, new.contact_id, new.reason);

  if tg_op = 'UPDATE'
     and (old.tenant_id <> new.tenant_id or old.contact_id <> new.contact_id)
  then
    perform private.refresh_contact_score(old.tenant_id, old.contact_id, 'score event moved');
  end if;

  return new;
end;
$$;

revoke execute on function private.lead_score_events_after_change() from public, anon, authenticated;

drop trigger if exists lead_score_events_refresh on public.lead_score_events;
create trigger lead_score_events_refresh
after insert or update or delete on public.lead_score_events
for each row execute function private.lead_score_events_after_change();

insert into public.contact_scores (contact_id, tenant_id, score, grade)
select c.id, c.tenant_id, 0, 'cold'
from public.contacts c
on conflict (contact_id) do nothing;

create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'faq'
    check (kind in ('faq','policy','product','process','script','other')),
  title text not null check (char_length(title) between 1 and 240),
  content text not null check (char_length(content) between 1 and 50000),
  status text not null default 'draft'
    check (status in ('draft','active','archived')),
  source_url text,
  tags text[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_entries_status_idx
  on public.knowledge_entries (tenant_id, status, kind, updated_at desc);

create index if not exists knowledge_entries_fts_idx
  on public.knowledge_entries
  using gin (
    to_tsvector(
      'portuguese'::regconfig,
      coalesce(title,'') || ' ' || coalesce(content,'')
    )
  );

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('contact','deal','conversation','task','proposal','customer')),
  name text not null check (char_length(name) between 1 and 120),
  filters jsonb not null default '{}'::jsonb,
  sort jsonb not null default '[]'::jsonb,
  shared boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, entity_type, name)
);

create or replace function public.crm_apply_score_event(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_rule_id uuid,
  p_event_key text,
  p_points integer,
  p_reason text,
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
  if not exists(
    select 1 from public.contacts c
    where c.id = p_contact_id and c.tenant_id = p_tenant_id
  ) then
    raise exception 'contato inválido para o tenant';
  end if;

  if p_rule_id is not null and not exists(
    select 1 from public.lead_score_rules r
    where r.id = p_rule_id and r.tenant_id = p_tenant_id
  ) then
    raise exception 'regra inválida para o tenant';
  end if;

  insert into public.lead_score_events (
    tenant_id, contact_id, rule_id, event_key, points, reason, metadata
  )
  values (
    p_tenant_id,
    p_contact_id,
    p_rule_id,
    trim(p_event_key),
    least(greatest(p_points,-100),100),
    left(coalesce(nullif(trim(p_reason),''),'score rule'),500),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (tenant_id,event_key) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function public.crm_apply_score_event(uuid,uuid,uuid,text,integer,text,jsonb)
from public, anon, authenticated;
grant execute on function public.crm_apply_score_event(uuid,uuid,uuid,text,integer,text,jsonb)
to service_role;

create or replace function public.crm_search_knowledge(
  p_tenant_id uuid,
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  kind text,
  title text,
  content text,
  source_url text,
  tags text[],
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    k.id,
    k.kind,
    k.title,
    k.content,
    k.source_url,
    k.tags,
    ts_rank_cd(
      to_tsvector(
        'portuguese'::regconfig,
        coalesce(k.title,'') || ' ' || coalesce(k.content,'')
      ),
      websearch_to_tsquery('portuguese'::regconfig, trim(p_query))
    )::real as rank
  from public.knowledge_entries k
  where k.tenant_id = p_tenant_id
    and k.status = 'active'
    and nullif(trim(p_query),'') is not null
    and to_tsvector(
      'portuguese'::regconfig,
      coalesce(k.title,'') || ' ' || coalesce(k.content,'')
    ) @@ websearch_to_tsquery('portuguese'::regconfig, trim(p_query))
  order by rank desc, k.updated_at desc
  limit least(greatest(coalesce(p_limit,8),1),20);
$$;

revoke all on function public.crm_search_knowledge(uuid,text,integer) from public, anon;
grant execute on function public.crm_search_knowledge(uuid,text,integer) to authenticated, service_role;

alter table public.contact_notes enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.contact_channel_preferences enable row level security;
alter table public.lead_score_rules enable row level security;
alter table public.lead_score_events enable row level security;
alter table public.contact_scores enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.saved_views enable row level security;

create policy "members contact_notes" on public.contact_notes
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members custom_field_definitions" on public.custom_field_definitions
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members custom_field_values" on public.custom_field_values
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members contact_channel_preferences" on public.contact_channel_preferences
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members lead_score_rules" on public.lead_score_rules
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members lead_score_events" on public.lead_score_events
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members contact_scores" on public.contact_scores
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy "members knowledge_entries" on public.knowledge_entries
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy "members saved_views read" on public.saved_views
for select to authenticated
using (
  (select private.is_tenant_member(tenant_id))
  and (shared = true or user_id = (select auth.uid()))
);

create policy "members saved_views insert" on public.saved_views
for insert to authenticated
with check (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
);

create policy "members saved_views update" on public.saved_views
for update to authenticated
using (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
)
with check (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
);

create policy "members saved_views delete" on public.saved_views
for delete to authenticated
using (
  (select private.is_tenant_member(tenant_id))
  and user_id = (select auth.uid())
);

create or replace view public.contact_timeline
with (security_invoker = true)
as
select
  c.tenant_id,
  c.id as contact_id,
  n.created_at as occurred_at,
  'note'::text as event_type,
  n.id::text as entity_id,
  case when n.pinned then 'Nota fixada' else 'Nota' end as title,
  left(n.body,500) as body,
  jsonb_build_object(
    'pinned',n.pinned,
    'authorUserId',n.author_user_id
  ) || n.metadata as metadata
from public.contacts c
join public.contact_notes n on n.contact_id = c.id

union all

select
  conv.tenant_id,
  conv.contact_id,
  m.created_at,
  case when m.direction = 'inbound' then 'message.inbound' else 'message.outbound' end,
  m.id::text,
  case
    when m.actor = 'ai' then 'Mensagem da IA'
    when m.actor = 'human' then 'Mensagem da equipe'
    else 'Mensagem do cliente'
  end,
  left(m.text,500),
  jsonb_build_object(
    'direction',m.direction,
    'actor',m.actor,
    'status',m.status
  ) || m.metadata
from public.messages m
join public.conversations conv on conv.id = m.conversation_id

union all

select
  t.tenant_id,
  t.contact_id,
  coalesce(t.completed_at,t.created_at),
  case when t.status = 'done' then 'task.completed' else 'task.created' end,
  t.id::text,
  t.title,
  left(coalesce(t.description,''),500),
  jsonb_build_object(
    'status',t.status,
    'kind',t.kind,
    'priority',t.priority,
    'dueAt',t.due_at,
    'assignedTo',t.assigned_to
  )
from public.tasks t
where t.contact_id is not null

union all

select
  tx.tenant_id,
  tx.contact_id,
  tx.occurred_at,
  'transaction.' || tx.status,
  tx.id::text,
  case
    when tx.status = 'completed' then 'Compra concluída'
    when tx.status = 'refunded' then 'Compra reembolsada'
    else 'Compra cancelada'
  end,
  tx.source,
  jsonb_build_object(
    'amountCents',tx.amount_cents,
    'externalId',tx.external_id,
    'source',tx.source
  ) || tx.metadata
from public.customer_transactions tx

union all

select
  r.tenant_id,
  r.contact_id,
  coalesce(r.responded_at,r.sent_at,r.created_at),
  'review.' || r.status,
  r.id::text,
  'Avaliação',
  left(coalesce(r.feedback,''),500),
  jsonb_build_object(
    'status',r.status,
    'rating',r.rating,
    'channel',r.channel
  )
from public.review_requests r

union all

select
  a.tenant_id,
  a.contact_id,
  a.captured_at,
  'attribution.' || a.touch_type,
  a.id::text,
  'Origem registrada',
  concat_ws(' / ',a.source,a.medium,a.campaign),
  jsonb_build_object(
    'source',a.source,
    'medium',a.medium,
    'campaign',a.campaign,
    'clickId',a.click_id
  ) || a.metadata
from public.lead_attributions a

union all

select
  p.tenant_id,
  p.contact_id,
  coalesce(p.accepted_at,p.viewed_at,p.sent_at,p.created_at),
  'proposal.' || p.status,
  p.id::text,
  'Proposta #' || p.number::text,
  p.title,
  jsonb_build_object(
    'status',p.status,
    'totalCents',p.total_cents,
    'expiresAt',p.expires_at
  )
from public.proposals p;

revoke all on public.contact_notes, public.custom_field_definitions,
  public.custom_field_values, public.contact_channel_preferences,
  public.lead_score_rules, public.lead_score_events, public.contact_scores,
  public.knowledge_entries, public.saved_views
from anon;

grant select, insert, update, delete on public.contact_notes,
  public.custom_field_definitions, public.custom_field_values,
  public.contact_channel_preferences, public.lead_score_rules,
  public.knowledge_entries, public.saved_views
to authenticated;

grant select on public.lead_score_events, public.contact_scores,
  public.contact_timeline
to authenticated;

grant all on public.contact_notes, public.custom_field_definitions,
  public.custom_field_values, public.contact_channel_preferences,
  public.lead_score_rules, public.lead_score_events, public.contact_scores,
  public.knowledge_entries, public.saved_views
to service_role;

grant select on public.contact_timeline to service_role;
