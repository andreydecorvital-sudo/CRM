# CRM Event Router + Governed Action Plane

## Objetivo

O Router é a camada de orquestração do CRM.

Ele recebe **eventos canônicos**, determina **qual capability é dona do assunto** e cria dispatches auditáveis. Quando um evento pode exigir uma ação material, o fluxo governado é:

```text
Domain Event
  ↓
Event Router
  ↓
Capability Owner
  ↓
Action Proposal (proposalOnly=true)
  ↓
Authorization
  ├─ reject
  └─ authorize
       ↓
Authorized Intent
       ↓
Execution Job
       ↓
Adapter Registry
       ↓
Factual Re-hydration
       ↓
Execute
       ↓
Post-read Verification
       ↓
Execution Receipt
```

Nenhuma etapa pode ser tratada como sinônimo da próxima.

## Separação de responsabilidades

### Event Router

Local:
- `src/lib/server/router/event-router.ts`
- `src/lib/server/router/policy.ts`
- `src/lib/server/router/capabilities.ts`

Responsabilidade:
- ler `domain_events`;
- aplicar política determinística;
- classificar severidade;
- escolher capabilities;
- persistir `event_router_dispatches`.

O Router **não executa writes de negócio**.

### Capability Owner

Cada capability possui owner canônico no registry `capabilityOwners`.

Exemplos:

- `inbox` → Inbox;
- `sales` → Sales;
- `tasks` → Next Action;
- `proposals` → Proposals;
- `lifecycle` → Customer Lifecycle;
- `opportunities` → Opportunities;
- `integrations` → Integrations;
- `ai` → AI Engine.

Um módulo novo deve possuir owner claro antes de receber eventos.

### Action Proposal

Local:
- `src/lib/server/router/proposals.ts`

Tabela:
- `action_proposals`

Uma Proposal é apenas uma recomendação materializada.

Regras:
- nasce com `proposal_only=true`;
- não é executável;
- preserva evidência;
- preserva dados faltantes;
- possui risco e confiança;
- `action_key` é determinístico para idempotência.

### Authorization

Local:
- `src/lib/server/router/authorization.ts`

RPC:
- `crm_decide_action_proposal`

A autorização não executa a ação.

Fontes permitidas:
- `human`;
- `policy`.

Autorização automática por policy possui allowlist inicial restrita:

- `task.create`
- `contact.tag`
- `deal.follow_up`

Além disso exige:
- risco `low`;
- confiança >= 0.90;
- zero dados faltantes.

### Authorized Intent

Tabela:
- `authorized_intents`

O Authorized Intent congela o snapshot aprovado da Proposal.

Invariantes:
- mesmo `action_key`;
- mesmo tenant;
- mesmo action type;
- mesmo target;
- `authorization_granted=true`;
- `proposal_only_cleared=true`.

A criação do Intent apenas agenda o estágio de execução. Ela não chama adapter na transação de autorização.

### Adapter Registry

Local:
- `src/lib/server/router/registry.ts`
- `src/lib/server/router/adapters/*`

Adapters registrados inicialmente:

- `internal.task.create.v1`
- `internal.contact.tag.v1`
- `internal.deal.follow-up.v1`

Ter um `action_type` conhecido não significa existir adapter. Sem adapter, o receipt termina em `adapter_missing`.

### Re-hidratação factual

Antes de executar, o adapter relê o estado atual.

Exemplos:
- contato ainda pertence ao tenant;
- deal ainda existe e não foi ganho/perdido;
- usuário ainda pertence ao tenant;
- prazo ainda é válido.

A Proposal não é tratada como verdade eterna.

### Execution Receipt

Tabela:
- `action_execution_receipts`

Estados:

- `executing`
- `verified`
- `failed`
- `unknown`
- `rolled_back`
- `blocked`
- `adapter_missing`

`unknown` é terminal e impede replay cego.

## Event Router vs Automation Engine

São sistemas diferentes de propósito.

### Automation Engine

`src/lib/server/automation/*`

É usado para workflows que o tenant configurou explicitamente:

```text
evento X
+ condição Y
→ executar ação Z
```

Essas regras são consideradas **pré-autorizadas pela configuração** e continuam usando guardrails, consentimento e outbox.

### Event Router

É usado para observação/orquestração sistêmica:

```text
aconteceu algo
→ quem é o owner?
→ exige atenção?
→ pode gerar uma proposta?
```

Uma recomendação do Router ou da IA não ganha autoridade de escrita por existir.

## Event policies iniciais

Exemplos:

| Evento | Capabilities | Wake |
|---|---|---|
| message.received | inbox, customer | route |
| conversation.sla.* | inbox, tasks, analytics | propose |
| deal.created | sales, tasks, analytics | propose |
| deal.stage.changed | sales, tasks, analytics | propose |
| deal.won | sales, lifecycle, analytics | route |
| proposal.sent/viewed | proposals, sales, tasks | propose |
| transaction.completed | lifecycle, customer, analytics | route |
| checkout.abandoned | acquisition, sales, opportunities, tasks | propose |
| whatsapp.session.failed | integrations, inbox | propose |

Políticas vivem em `router/policy.ts`, não espalhadas em páginas/API routes.

## Durable jobs

Novos kinds:
- `event_router`
- `action_execution`

Quando um `domain_event` nasce:
- Automation Engine recebe seu próprio job;
- Event Router recebe outro job.

Um não depende do outro.

Quando um Authorized Intent nasce:
- cria job `action_execution`;
- o worker reivindica o job;
- o executor ainda precisa adquirir o lease próprio do receipt.

## Exactly-once / replay safety

Há dois níveis:

1. `job_queue` possui dedupe e worker lease;
2. `action_execution_receipts` possui lease por Authorized Intent.

Receipts terminais:
- verified;
- unknown;
- rolled_back;
- blocked;
- adapter_missing.

`failed` pode ser retomado somente pelo pipeline controlado.

## Internal API

Protegida por `CRM_INTERNAL_SECRET`.

### Rodar Router para um evento

```
POST /api/internal/router/events/:eventId
```

### Listar dispatches

```
GET /api/internal/router/dispatches?tenantId=<uuid>
```

### Proposals

```
GET  /api/internal/router/proposals?tenantId=<uuid>
POST /api/internal/router/proposals
```

### Decidir Proposal

```
POST /api/internal/router/proposals/:proposalId/decision
```

Autorizar não significa que a resposta HTTP executou a ação.

### Registry

```
GET /api/internal/router/adapters
```

## Regra para novas ações

Para adicionar uma mutação governada:

1. criar/usar `action_type`;
2. definir risco;
3. criar adapter;
4. implementar rehydrate;
5. implementar execute;
6. implementar verify;
7. declarar semântica `idempotent` ou `uncertain`;
8. só depois considerar policy auto-authorization;
9. nunca inserir ação de alto risco na allowlist por conveniência.

## IA

A IA pode:
- analisar contexto;
- priorizar;
- gerar recommendation;
- criar Action Proposal.

A IA não pode:
- criar Authorized Intent fingindo ser humano;
- chamar adapter diretamente;
- apagar `proposal_only`;
- declarar ação executada sem receipt `verified`.
