# MIRA CRM

CRM + atendimento + automação comercial multiempresa.

## Stack

- Next.js 16 / React 19
- Supabase Postgres + Auth + RLS
- Vercel
- WhatsApp provider adapter
- MIRA em modo assistido por padrão

## Núcleo atual

- Inbox, SLA, departamentos e roteamento
- CRM, contatos, tags, pipelines e deals
- tarefas e follow-ups sincronizados
- origem / UTM first touch + last touch
- propostas públicas e aceite
- recorrência, LTV, VIP, risco e avaliações
- timeline, notas e campos customizados
- consentimento/preferências por canal
- lead scoring configurável
- base de conhecimento full-text para MIRA
- domain events + motor de automações
- durable job queue + retry/dead jobs
- outbox de mensagens
- webhooks outbound
- API keys com hash + scopes
- empresas/contas B2B
- catálogo, tabelas de preço e vínculo com proposta
- histórico de etapa e velocity
- histórico de atribuição de conversas
- planos, features, limites e medição de uso
- auditoria e isolamento multi-tenant

Fluxo de negócio:

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

Fluxo técnico:

`Domain Event → Scoring → Automation Rule → Durable Job → Action / Outbox / Webhook`

## Rodar

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Migrations

Aplicar em projeto Supabase novo e isolado, na ordem:

1. `202610050001_init_mira_crm.sql`
2. `202610050002_customer_lifecycle_reviews.sql`
3. `202610050003_commercial_operations.sql`
4. `202610050004_customer_intelligence.sql`
5. `202610050005_automation_platform.sql`
6. `202610050006_saas_business_foundation.sql`

## Worker

`/api/internal/jobs/tick` processa automações, outbox e webhooks.

Proteção: `CRM_WORKER_SECRET`.

## Segurança

- RLS em toda tabela pública
- views com `security_invoker`
- helpers em schema `private`
- `SECURITY DEFINER` com `search_path = ''`
- RPCs privilegiados restritos ao `service_role`
- API keys armazenadas só como hash
- outbox respeita opt-out
- CI valida migrations

## CI

`typecheck → lint → migration security check → next build`

## Docs

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKEND.md`
- `docs/AUTOMATIONS.md`
- `docs/ROADMAP.md`
