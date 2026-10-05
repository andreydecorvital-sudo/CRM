# Shared Platform Stack

Camada reaproveitável entre CRM e próximos SaaS.

## Princípio

Produtos conhecem **interfaces estáveis**.
Vendors ficam atrás de adapters/gateways.

```text
Produto
  │
  ├─ AI interface ───────────────→ LiteLLM ─→ Gemini/OpenAI/Claude/local
  │
  ├─ Product analytics interface → PostHog
  │
  ├─ Trace interface ─────────────→ OpenTelemetry ─→ Langfuse
  │
  ├─ Data interface ──────────────→ Supabase/Postgres
  │
  └─ Agent operating model ───────→ Hermes / ChatGPT / futuros agentes
```

## AI Gateway

Código:
- `src/lib/server/platform/ai/gateway.ts`

Contrato:
- OpenAI-compatible `/v1/chat/completions`;
- produto usa aliases;
- provider real fica no gateway;
- timeout limitado;
- sem chave real de provider no app;
- tracing e analytics sem bloquear a resposta.

Variáveis:
- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_MODEL`
- `AI_GATEWAY_TIMEOUT_MS`

A primeira integração de negócio está em:
- `src/lib/server/ai/service.ts`

## PostHog

Código:
- `src/lib/server/platform/analytics/posthog.ts`

Primeiro escopo: server-side.

Guardrail:
- filtro de propriedades sensíveis;
- distinct ID não pode ser e-mail/telefone;
- falha de analytics não deve derrubar operação principal.

Variáveis:
- `POSTHOG_PROJECT_TOKEN`
- `POSTHOG_HOST`

Frontend/session replay fica para a fase estética/onboarding.

## Langfuse / OTel

Inicialização:
- `src/instrumentation.ts`

Wrapper:
- `src/lib/server/platform/observability/langfuse.ts`

Variáveis:
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`
- `LANGFUSE_SAMPLE_RATE`
- `LANGFUSE_CAPTURE_CONTENT`
- `LANGFUSE_TRACING_ENVIRONMENT`
- `OTEL_SERVICE_NAME`

Por padrão:
- metadados operacionais: sim;
- prompt/resposta: não.

## Supabase advanced modules

### Queues

Decisão:
- usar PGMQ em workloads novos;
- não substituir `job_queue` atual sem migração controlada.

### Cron

Cron deve **agendar/enfileirar**, não executar fluxo longo dentro do banco.

### pgvector

Somente quando FTS atual não for suficiente.

Quando o Supabase isolado existir:
1. verificar versão do Postgres/extensões;
2. habilitar módulo;
3. validar advisors;
4. criar migration limpa;
5. testar fila/vector em ambiente real;
6. só então promover ao core.

## Agent stack

Agentes são tooling de engenharia, não feature de cliente.

### Architect
ChatGPT:
- arquitetura;
- produto;
- decisões difíceis;
- revisão.

### Builder
Hermes:
- branch;
- implementação;
- testes;
- PR.

### Auditor
Hermes/read-only:
- CI;
- migrations;
- segurança;
- duplicação;
- drift arquitetural.

### Researcher
Hermes ou agente de pesquisa:
- concorrência;
- libs;
- changelogs;
- tecnologia.

Todos devem respeitar:
- `AGENTS.md`
- `SYSTEM_MAP.md`
- `ROUTER.md`

## Health

Endpoint interno:

`GET /api/internal/platform/health`

Protegido por `CRM_INTERNAL_SECRET`.

Ele mostra apenas readiness booleana; nunca retorna secrets.


## Worker scheduling

A fila durável é drenada por:

`GET /api/internal/jobs/tick?limit=25`

Em Vercel, `vercel.json` agenda o tick a cada minuto.

Autorização aceita:
- `Authorization: Bearer $CRON_SECRET` para Vercel Cron;
- `CRM_WORKER_SECRET` para invocação operacional/manual.

O endpoint nunca deve aceitar execução sem um dos secrets configurados.

O tick processa:
- Event Router;
- Automation Engine;
- Commercial Intelligence;
- governed action execution;
- outbound messages;
- webhooks;
- contact imports.

O Cron é mecanismo de drenagem/recovery. Fluxos orientados a webhook continuam criando jobs imediatamente no banco.
