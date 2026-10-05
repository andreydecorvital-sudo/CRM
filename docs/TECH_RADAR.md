# Tech Radar

Radar técnico para o CRM e para os próximos SaaS.

Objetivo: evitar duas coisas:
1. cada produto reinventar infraestrutura básica;
2. instalar tecnologia só porque parece interessante.

## ADOPT — padrão recomendado

### LiteLLM AI Gateway

**Papel:** gateway único para modelos.

**Por que adotamos**
- API OpenAI-compatible;
- múltiplos providers atrás da mesma interface;
- virtual keys;
- budgets/rate limits;
- routing/fallbacks;
- custo/modelo fora do produto.

**Regra**
Produtos não recebem diretamente `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY`.
Recebem somente:
- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`
- alias de modelo.

**Código CRM**
- `src/lib/server/platform/ai/gateway.ts`
- `src/lib/server/ai/service.ts`

**Infra exemplo**
- `infra/litellm/config.example.yaml`

### PostHog

**Papel:** product analytics.

Usar para:
- onboarding;
- ativação;
- uso de feature;
- retenção;
- conversão;
- experimentos futuros.

**Regra**
- backend não envia texto de conversa, e-mail, telefone, prompt ou segredo;
- distinct id deve ser ID interno estável;
- eventos usam formato `objeto verbo`.

**Código**
- `src/lib/server/platform/analytics/posthog.ts`

### Langfuse + OpenTelemetry

**Papel:** observabilidade de IA/agentes.

Usar para:
- traces;
- latência;
- modelo;
- tokens;
- erro;
- avaliação futura.

**Regra**
Captura de prompt/resposta fica **desligada por padrão**.
`LANGFUSE_CAPTURE_CONTENT=true` deve ser decisão explícita por produto/ambiente.

**Código**
- `src/instrumentation.ts`
- `src/lib/server/platform/observability/langfuse.ts`

### OpenTelemetry

**Papel:** padrão de instrumentação.

Langfuse é um consumidor de OTel, não o dono da arquitetura de telemetria.
Isso permite trocar/exportar traces no futuro sem reescrever o domínio.

### Supabase Queues / PGMQ

**Papel:** fila Postgres-native para workloads novos.

Estado: **adotar no Supabase isolado do CRM**, não migrar o `job_queue` atual cegamente.

Motivo:
- o CRM já possui uma fila durável funcional;
- PGMQ deve primeiro entrar em workloads novos e independentes;
- migração da fila central só depois de benchmark/replay tests.

Primeiros candidatos:
- geração de embeddings;
- processamento de documentos;
- tarefas de IA de volume;
- fan-out de integrações.

### Supabase Cron / pg_cron

**Papel:** scheduler simples próximo do banco.

Primeiros candidatos:
- enqueue periódico;
- limpeza de registros;
- manutenção;
- snapshots;
- reativação diária.

Não usar para lógica longa. Cron dispara trabalho; worker executa.

### pgvector

**Papel:** embeddings e busca semântica dentro do Postgres.

Primeiro uso provável:
- knowledge base;
- busca semântica de atendimento;
- similaridade de produtos/imóveis.

Não criar embeddings até existir um caso que supere FTS/hybrid search atual.

### Hermes Agent

**Papel:** agente interno de engenharia/operação.

Não faz parte do runtime vendido ao cliente.

Perfis:
- Builder;
- Auditor;
- Researcher.

Permissão inicial:
- repo por branch/PR;
- infraestrutura read-only quando possível;
- produção sem write genérico.

## TRIAL — testar com casos reais

### Inngest

Testar quando surgir fluxo com:
- espera de horas/dias;
- múltiplos passos duráveis;
- retries por etapa;
- event-driven orchestration externo ao banco.

Não adicionar enquanto `job_queue` + Cron resolverem o problema.

### Trigger.dev

Testar para:
- jobs long-running;
- agentes;
- streaming;
- human-in-the-loop;
- browser workloads.

Comparar com Inngest por um caso real antes de padronizar.

### Meilisearch

Testar apenas quando Postgres FTS/hybrid search deixar de atender:
- catálogo grande;
- typo tolerance agressiva;
- experiência de busca instantânea.

## ASSESS — acompanhar

### Modelos locais / vLLM / Ollama

Interessantes para:
- custo previsível;
- privacidade;
- tarefas classificatórias de volume.

Entram atrás do LiteLLM; o produto não precisa saber que o provider mudou.

### MCP como interface interna

Bom para ferramentas de agentes, mas não substituir APIs transacionais críticas.
MCP pode chamar capacidades; autorização continua no Router/Governed Action Plane.

### Agent-to-Agent / A2A

Acompanhar para coordenação de agentes, sem transformar o core dos produtos em protocolo experimental.

## HOLD — não usar agora

### Temporal

Excelente para execução durável em escala grande, mas complexidade operacional desnecessária hoje.
Reavaliar se workflows passarem a exigir:
- milhares de execuções simultâneas longas;
- replay sofisticado;
- coordenação distribuída complexa.

### Banco vetorial separado

Não adicionar Pinecone/Qdrant/Weaviate enquanto pgvector resolver o workload.

### Vários providers chamados diretamente pelo produto

Proibido como padrão.
Provider novo entra atrás do AI Gateway.

## Regras de adoção

Uma tecnologia só entra em ADOPT quando:
1. resolve dor real;
2. possui owner;
3. tem estratégia de falha;
4. tem custo conhecido;
5. tem observabilidade;
6. pode ser removida sem destruir domínio;
7. não duplica uma capacidade já suficiente.

## Revisão

Revisar este radar quando:
- surgir um novo SaaS;
- custo operacional mudar;
- tecnologia crítica tiver breaking change;
- um item de TRIAL provar valor;
- uma dependência deixar de ser necessária.
