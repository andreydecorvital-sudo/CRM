# MIRA CRM

Backend de CRM + atendimento + automação comercial multiempresa.

## O que já existe no domínio

- contatos, empresas B2B, tags e Customer 360
- WhatsApp provider-neutral com configuração por tenant
- conversas, departamentos, filas, SLA e roteamento
- pipelines, deals, tarefas e follow-up
- catálogo, tabelas de preço e propostas
- UTM / first touch / last touch
- recorrência, LTV, VIP, risco e avaliações
- timeline, notas e custom fields
- preferências/consentimento por canal
- lead scoring explicável
- base de conhecimento full-text para MIRA
- eventos de domínio e motor de automações
- durable jobs, retry e dead jobs
- outbox de mensagens
- webhooks outbound com HMAC
- API keys com scopes
- API pública v1 inicial
- workflows de privacidade/exportação
- calendários comerciais e feriados
- histórico de etapa, velocity e atribuições
- subscriptions/features/limits e usage metering
- auditoria e isolamento multi-tenant

## Fluxo

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

Backend:

`Domain Event → Scoring → Automation Rule → Durable Job → Action / Outbox / Webhook`

## Migrations

Aplicar apenas em um Supabase dedicado ao CRM, na ordem:

1. `202610050001_init_mira_crm.sql`
2. `202610050002_customer_lifecycle_reviews.sql`
3. `202610050003_commercial_operations.sql`
4. `202610050004_customer_intelligence.sql`
5. `202610050005_automation_platform.sql`
6. `202610050006_saas_business_foundation.sql`
7. `202610050007_api_privacy_calendars.sql`

## Worker

`/api/internal/jobs/tick` processa automações, outbox e webhooks.

Proteção: `CRM_WORKER_SECRET`.

## API pública

Primeiras rotas:

- `GET /api/v1/contacts`
- `POST /api/v1/contacts`
- `POST /api/v1/events`

API key define tenant + scopes; o cliente nunca informa tenant arbitrariamente.

Veja `docs/API.md`.

## WhatsApp

Conexões são resolvidas por tenant. Fallback WAHA global é desabilitado por padrão e só existe para piloto controlado.

Veja `docs/WHATSAPP.md`.

## Segurança

- RLS em toda tabela pública
- views com `security_invoker`
- helpers em schema `private`
- `SECURITY DEFINER` com `search_path = ''`
- RPC privilegiada apenas para `service_role`
- API keys armazenadas como hash
- opt-out aplicado antes do provider
- secrets referenciados por nome, não em texto no banco
- CI valida migrations

## CI

`typecheck → lint → migration security check → next build`

## Docs

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKEND.md`
- `docs/AUTOMATIONS.md`
- `docs/API.md`
- `docs/PRIVACY.md`
- `docs/WHATSAPP.md`
- `docs/ROADMAP.md`
