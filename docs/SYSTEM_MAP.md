# CRM — System Map

> Documento canônico para entender produto, domínio, banco e código.
>
> Sempre que uma implementação mudar arquitetura, domínio, fluxo crítico ou ownership de módulos, atualizar este arquivo.

## 1. Produto em uma frase

CRM de execução comercial para empresas que vendem por conversa: captura o lead, organiza atendimento, garante próxima ação, acompanha proposta/venda e continua trabalhando recompra, avaliação e reativação.

**Produto independente.** Não depende de Argoplace, MIRA, VitalHub ou qualquer outro produto.

## 2. Mapa mental do produto

```mermaid
flowchart LR
  A[Origem do lead] --> B[Contato]
  B --> C[Atendimento]
  C --> D[Qualificação]
  D --> E[Deal / oportunidade]
  E --> F[Próxima ação]
  F --> G[Proposta]
  G --> H{Resultado}
  H -->|Ganho| I[Cliente]
  H -->|Perdido| J[Motivo de perda]
  I --> K[Compra / LTV]
  K --> L[Avaliação]
  K --> M[Recompra]
  K --> N[Reativação]

  W[WhatsApp] --> C
  EM[E-mail] --> C
  API[API / integrações] --> B

  AUTO[Motor de automação] --> F
  AUTO --> C
  AUTO --> G
  AUTO --> N

  AI[Camada de IA própria] --> C
  AI --> D
  AI --> F

  CONS[Consentimento] --> W
  CONS --> EM

  ANALYTICS[Analytics] --> E
  ANALYTICS --> I
  ANALYTICS --> K
```

## 3. Regra central do produto

Toda oportunidade ativa deve ter:

1. **dono**;
2. **estado**;
3. **próxima ação**;
4. **prazo**;
5. **histórico auditável**.

O CRM não existe só para guardar cards. Ele existe para impedir dinheiro parado por falta de execução.

## 4. Fluxos críticos

### 4.1 WhatsApp inbound

```mermaid
sequenceDiagram
  participant WAHA
  participant Webhook
  participant DB
  participant Registration
  participant Automation

  WAHA->>Webhook: message
  Webhook->>DB: crm_ingest_whatsapp_inbound
  DB-->>Webhook: contact + conversation + message
  Webhook->>Registration: processa cadastro/comandos
  DB->>Automation: domain events
```

Código:
- `src/app/api/webhooks/whatsapp/waha/route.ts`
- `src/lib/server/whatsapp/ingest.ts`
- `src/lib/server/registration/service.ts`

Banco:
- `contacts`
- `conversations`
- `messages`
- `contact_registration_sessions`

### 4.2 Mensagem outbound

```mermaid
flowchart LR
  RULE[Regra / serviço] --> OUT[outbound_messages]
  OUT --> JOB[job_queue]
  JOB --> WORKER[worker]
  WORKER --> CONSENT[checkOutboundConsent]
  CONSENT -->|permitido| PROVIDER[WhatsApp / E-mail]
  CONSENT -->|bloqueado| SUP[suppressed]
```

Nunca enviar direto de regra de negócio para provider.

Código:
- `src/lib/server/outbound/processor.ts`
- `src/lib/server/consent/service.ts`
- `src/lib/server/worker/process.ts`

### 4.3 Cadastro pelo WhatsApp

```text
novo contato
  ↓
nome
  ↓
e-mail
  ↓
cidade opcional
  ↓
quer receber oportunidades?
  ↓
cadastro concluído
```

Config por tenant:
- `customer_registration_settings`

Estado:
- `contact_registration_sessions`

Código:
- `src/lib/server/registration/service.ts`
- `src/lib/server/registration/settings.ts`

### 4.4 Oportunidades

Oportunidade é uma finalidade própria. Não equivale a marketing genérico.

```text
oportunidade encontrada
  ↓
contact_opportunity_preferences.enabled?
  ↓
canal permitido?
  ↓
limite semanal?
  ↓
channel preference permite?
  ↓
outbox
  ↓
checagem de consentimento novamente
  ↓
provider
```

Código:
- `src/lib/server/opportunities/service.ts`
- `src/lib/server/consent/service.ts`

### 4.5 Automação

```mermaid
flowchart LR
  EVENT[domain_events] --> SCORE[Scoring]
  EVENT --> RULES[automation_rules]
  RULES --> RUN[automation_runs]
  RUN --> JOB[job_queue]
  JOB --> ACTION[actions]
  ACTION --> TASK[Task]
  ACTION --> MSG[Outbox]
  ACTION --> TAG[Tag]
  ACTION --> ROUTE[Routing]
```

Código:
- `src/lib/server/automation/engine.ts`
- `src/lib/server/automation/conditions.ts`
- `src/lib/server/automation/actions.ts`
- `src/lib/server/automation/jobs.ts`
- `src/lib/server/automation/scoring.ts`

## 5. Mapa de domínio → código → banco

| Domínio | Código principal | Tabelas / views |
|---|---|---|
| Tenants e usuários | server + RLS | tenants, tenant_members |
| Contatos | customers/, timeline/ | contacts, contact_notes, contact_tags |
| Empresas B2B | accounts/ | accounts, account_contacts, account_metrics |
| Inbox | whatsapp/, departments/ | conversations, messages, departments |
| WhatsApp | whatsapp/ | whatsapp_connections, whatsapp_session_events |
| E-mail | email/ | email_connections, outbound_messages |
| Consentimento | consent/ | contact_channel_preferences |
| Oportunidades | opportunities/ | contact_opportunity_preferences |
| Cadastro WA | registration/ | customer_registration_settings, contact_registration_sessions |
| CRM comercial | domain + services | pipelines, pipeline_stages, deals |
| Tarefas | tasks/ | tasks |
| Propostas | proposals/ | proposals, proposal_items |
| Catálogo | catalog/ | catalog_items, price_books, price_book_items |
| Pós-venda | reviews/, lifecycle | customer_transactions, review_requests |
| Automação | automation/ | domain_events, automation_rules, automation_runs, job_queue |
| Outbound | outbound/ | outbound_messages, message_templates |
| API pública | public-api/ + app/api/v1 | api_keys, usage_* |
| Privacidade | privacy/ | privacy_requests |
| Analytics | analytics/ | deal_stage_history, deal_velocity |
| Billing SaaS | billing/ | tenant_subscriptions, usage_events, usage_counters |
| IA | ai/ | knowledge entries + contexto do domínio |

## 6. Mapa técnico de runtime

```mermaid
flowchart TB
  UI[Next.js App] --> ROUTES[Route Handlers]
  EXT[Webhooks / API] --> ROUTES
  ROUTES --> SERVICES[src/lib/server]
  SERVICES --> REST[supabaseRest]
  REST --> DB[(Supabase Postgres)]

  DB --> EVENTS[domain_events]
  EVENTS --> JOBS[job_queue]
  JOBS --> WORKER[Worker Tick]

  WORKER --> OUT[outbound processor]
  WORKER --> AUTO[automation engine]
  WORKER --> WEBHOOK[webhook processor]
  WORKER --> IMPORT[import processor]

  OUT --> WAHA[WAHA]
  OUT --> EMAIL[Resend]
```

## 7. WhatsApp lifecycle

```text
whatsapp_connections
  ↓ provision
WAHA session
  ↓
STARTING
  ↓
SCAN_QR_CODE → QR temporário
  ↓
WORKING
  ↓
connected
```

Se parar:
- `STOPPED` → disconnected
- `FAILED` → error
- `PASSKEY_REQUIRED` → pairing/manual intervention

Estado persistente:
- `whatsapp_connections`

Histórico:
- `whatsapp_session_events`

QR:
- **nunca persistir no banco**.

Código:
- `src/lib/server/whatsapp/waha-admin.ts`
- `src/app/api/internal/whatsapp/[tenantId]/session/route.ts`
- `src/app/api/internal/whatsapp/[tenantId]/qr/route.ts`

## 8. Invariantes que não podem ser quebrados

### Multi-tenant
Toda entidade de negócio deve estar isolada por `tenant_id`.

### Segurança
- `service_role` somente no backend.
- RLS em toda tabela pública.
- `SECURITY DEFINER` com `search_path = ''`.
- RPC privilegiada deve revogar PUBLIC/anon/authenticated.

### Side effects
Envio externo deve passar por fila/outbox quando houver possibilidade de retry, duplicação ou falha parcial.

### Consentimento
Nenhuma mensagem promocional pode ignorar preferência do contato.

### Idempotência
Inbound, jobs, automações, webhooks, usage e importações precisam tolerar retry.

### Providers
Domínio não conhece detalhes de WAHA/Resend. Provider é adapter.

### IA
A IA é componente do CRM, não autoridade do banco. Nunca inventa ação executada e nunca substitui regra transacional.

### Independência
Não introduzir dependência de Argoplace, MIRA ou VitalHub.

## 9. Onde alterar cada coisa

| Quero mudar... | Comece por |
|---|---|
| regra de automação | `src/lib/server/automation/` |
| envio WhatsApp | `src/lib/server/whatsapp/` + outbound |
| conexão/QR WAHA | `src/lib/server/whatsapp/waha-admin.ts` |
| envio e-mail | `src/lib/server/email/` |
| opt-in/opt-out | `src/lib/server/consent/` e opportunities |
| cadastro pelo WhatsApp | `src/lib/server/registration/` |
| pipeline/deal | migrations + domain/services |
| proposta | `src/lib/server/proposals/` |
| tarefa/follow-up | `src/lib/server/tasks/` |
| Customer 360 | customers/timeline/custom-fields |
| API externa | `src/app/api/v1/` + public-api |
| LGPD | `src/lib/server/privacy/` |
| métricas SaaS | billing/entitlements |
| IA | `src/lib/server/ai/` + knowledge |

## 10. Estado atual do produto

### Backend já estruturado
- multi-tenant + RLS;
- CRM/deals/tasks/propostas;
- Inbox e WhatsApp;
- SLA/roteamento;
- cadastro pelo WhatsApp;
- e-mail outbound;
- consentimento/oportunidades;
- Customer 360;
- automações/jobs/outbox;
- importação CSV;
- API pública inicial;
- privacidade;
- analytics;
- subscriptions/usage.

### Ainda não é produção comercial completa
Faltam principalmente:
- Supabase isolado implantado;
- Vercel isolada;
- auth/onboarding;
- WAHA real provisionado em infraestrutura;
- worker agendado real;
- billing provider;
- testes E2E e observabilidade;
- frontend final.

## 11. Regra para novas implementações

Antes de adicionar feature:

1. identificar domínio;
2. decidir tabela/evento;
3. garantir `tenant_id`;
4. decidir se há side effect;
5. se houver side effect, usar job/outbox;
6. definir idempotência;
7. definir consentimento/segurança;
8. atualizar este mapa se o fluxo estrutural mudar.
