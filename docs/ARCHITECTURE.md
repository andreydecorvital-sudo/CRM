# CRM — arquitetura

## Princípios

- multi-tenant desde o banco
- provider-neutral
- IA não é dona do dado
- side effects externos passam por fila/outbox
- decisões críticas são atômicas
- frontend não define domínio
- secrets não ficam em texto puro

## Fluxo de negócio

WhatsApp → contato/conversa → fila/SLA → IA/humano → deal → follow-up → proposta → venda → recorrência → avaliação → reativação.

## Event-driven core

Mudança transacional → `domain_events` → `job_queue` → worker → scoring → regras → ações.

Eventos e jobs têm dedupe keys. Claims usam `FOR UPDATE SKIP LOCKED`. Jobs abandonados podem ser liberados e retries usam backoff.

## Customer intelligence

- `contact_timeline`
- custom fields
- channel preferences
- lead scoring
- knowledge base
- first/last touch

## Commercial domain

- pipelines/deals
- tasks
- proposals
- accounts B2B
- catalog/price books
- deal stage history
- account metrics

## SaaS domain

- tenant subscription
- feature flags
- limits
- usage events idempotentes
- monthly usage counters

O backend registra uso; enforcement pode ser ativado por feature/limit sem alterar o domínio.

## Concorrência

- roteamento: lock de conversa
- aceite: lock da proposta
- jobs: skip locked
- automações: rule/event único
- scoring: event_key
- outbox: dedupe_key
- webhooks: subscription/event
- usage: tenant/dedupe_key

## Segurança

- RLS em public
- views com security invoker
- helpers em private
- SECURITY DEFINER com search_path vazio
- RPCs privilegiados só service_role
- worker com secret
- CI fiscaliza migrations

## Infra pendente

Ainda não existe Supabase/Vercel isolado do CRM. Não aplicar migrations em bancos de outros produtos.
