# CRM

Backend de CRM + atendimento + automação comercial multiempresa.

## Comece por aqui

O mapa canônico do produto e do código está em `docs/SYSTEM_MAP.md`.

## O que já existe no domínio

- contatos, empresas B2B, tags e Customer 360
- WhatsApp provider-neutral com configuração por tenant
- lifecycle/status/QR de sessão WhatsApp por tenant
- conversas, departamentos, filas, SLA e roteamento
- pipelines, deals, tarefas e follow-up
- catálogo, tabelas de preço e propostas
- UTM / first touch / last touch
- recorrência, LTV, VIP, risco e avaliações
- timeline, notas e custom fields
- preferências/consentimento por canal
- lead scoring explicável
- base de conhecimento full-text para o motor de IA
- AI Gateway provider-neutral via LiteLLM/OpenAI-compatible
- tracing de IA via OpenTelemetry/Langfuse
- product analytics server-side via PostHog
- eventos de domínio e motor de automações
- Event Router com capability owners
- Action Proposal → Authorized Intent → Adapter → Verification
- durable jobs, retry e dead jobs
- outbox de mensagens
- webhooks outbound com HMAC
- API keys com scopes
- API pública v1 inicial
- workflows de privacidade/exportação
- calendários comerciais e feriados
- importação CSV assíncrona com retry e progresso
- SLA contado em horário comercial
- cadastro guiado de cliente pelo WhatsApp
- disparo de e-mail por tenant via outbox
- consentimento específico para oportunidades por canal
- histórico de etapa, velocity e atribuições
- Deal Health Score explicável
- Revenue Recovery / pipeline exposto
- Next Action Recommendations governadas pelo Router
- subscriptions/features/limits e usage metering
- auditoria e isolamento multi-tenant

## Fluxo

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

Backend explícito:

`Domain Event → Automation Rule → Durable Job → Action / Outbox`

Backend governado:

`Domain Event → Event Router → Capability → Action Proposal → Authorized Intent → Adapter → Verify → Receipt`

## Migrations

Aplicar apenas em um Supabase dedicado ao CRM, na ordem:

1. `202610050001_init_crm.sql`
2. `202610050002_customer_lifecycle_reviews.sql`
3. `202610050003_commercial_operations.sql`
4. `202610050004_customer_intelligence.sql`
5. `202610050005_automation_platform.sql`
6. `202610050006_saas_business_foundation.sql`
7. `202610050007_api_privacy_calendars.sql`
8. `202610050008_imports_business_sla.sql`

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

- `docs/SYSTEM_MAP.md`
- `docs/TECH_RADAR.md`
- `docs/PLATFORM_STACK.md`
- `docs/AI_GATEWAY.md`
- `docs/COMMERCIAL_INTELLIGENCE.md`
- `docs/ROUTER.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKEND.md`
- `docs/AUTOMATIONS.md`
- `docs/API.md`
- `docs/PRIVACY.md`
- `docs/WHATSAPP.md`
- `docs/IMPORTS.md`
- `docs/BUSINESS_HOURS.md`
- `docs/CUSTOMER_REGISTRATION.md`
- `docs/EMAIL.md`
- `docs/OPPORTUNITIES.md`
- `docs/ROADMAP.md`
