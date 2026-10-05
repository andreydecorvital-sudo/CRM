# MIRA CRM

CRM + atendimento + automação comercial multiempresa.

## Stack

- Next.js 16 / React 19
- Supabase Postgres + Auth + RLS
- Vercel
- WhatsApp provider adapter (WAHA primeiro; Meta/BSP depois)
- MIRA em modo assistido por padrão

## Núcleo atual

- Inbox WhatsApp e handoff humano
- departamentos, filas, SLA e roteamento
- CRM, contatos, tags, pipelines e deals
- tarefas e follow-ups sincronizados com o deal
- origem / UTM com first touch e last touch
- propostas com link público e aceite
- recorrência, LTV, VIP, risco e inatividade
- avaliações pós-venda
- timeline unificada do cliente
- notas e campos customizados
- preferências/consentimento por canal
- lead scoring configurável
- base de conhecimento da MIRA com full-text search
- eventos de domínio e motor de automações
- outbox de mensagens com retry
- webhooks outbound
- API keys com hash e scopes
- auditoria e isolamento multi-tenant

Fluxo:

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

Por baixo, o backend opera:

`Domain Event → Scoring → Automation Rules → Durable Job → Action/Outbox/Webhook`

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

## Worker

O endpoint interno `/api/internal/jobs/tick` processa automações, mensagens outbound e webhooks.

Proteja com `CRM_WORKER_SECRET`. Pode ser chamado por cron/worker externo depois da infraestrutura estar criada.

## Segurança

- RLS nas tabelas públicas
- views com `security_invoker`
- helpers internos em schema `private`
- `SECURITY DEFINER` com `search_path = ''`
- RPCs privilegiados restritos ao `service_role`
- nenhum secret de provider no browser
- API keys armazenadas somente como hash
- outbound respeita preferência de canal
- CI valida migrations automaticamente

## CI

`CRM CI` executa:

`typecheck → lint → migration security check → next build`

## Documentação

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKEND.md`
- `docs/AUTOMATIONS.md`
- `docs/ROADMAP.md`
