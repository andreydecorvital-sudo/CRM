# MIRA CRM — arquitetura

## Princípios

- SaaS multiempresa desde o banco.
- WhatsApp é provider-neutral.
- MIRA não é dona do dado.
- IA inicia em `assist`.
- mensagens inbound são idempotentes.
- decisões concorrentes críticas são atômicas no Postgres.
- side effects externos passam por outbox/job queue.
- segredos ficam fora do banco em texto puro.

## Fluxo de negócio

WhatsApp → contato/conversa → departamento/SLA → roteamento → MIRA/humano → deal → follow-up → proposta → venda → recorrência → avaliação → reativação.

## Fluxo de automação

Mudança transacional → `domain_events` → `job_queue` → worker → scoring → regras → ações.

Isso cria um transactional outbox: o evento nasce junto com a alteração que o originou e o side effect externo acontece depois.

## Durable jobs

`crm_claim_jobs` usa `FOR UPDATE SKIP LOCKED`.

O ciclo é:
- queued;
- running;
- succeeded;
- retry;
- dead.

Locks abandonados podem ser liberados por `crm_release_stale_jobs`.

## Scoring

`lead_score_rules` descreve a condição. `lead_score_events` registra por que o score mudou. `contact_scores` mantém o agregado e a classificação cold/warm/hot.

## Consentimento

`contact_channel_preferences` controla WhatsApp, email, SMS e telefone.

A outbox bloqueia sales/marketing quando o contato está `opted_out` ou `transactional_only`.

## Knowledge

`knowledge_entries` usa índice GIN + full-text search em português. O objetivo inicial é recuperação barata e auditável para a MIRA.

## Webhooks

Eventos podem gerar `webhook_deliveries`. O worker usa HTTPS, timeout, retry e HMAC opcional.

`secret_ref` aponta para variável de ambiente. Não armazena segredo.

## API keys

A chave completa é exibida uma vez. O banco mantém prefixo + SHA-256 + scopes.

## Concorrência

- roteamento: lock na conversa;
- aceite de proposta: lock na proposta;
- jobs: skip locked;
- automações: unique rule/event;
- scoring: event_key idempotente;
- outbox: dedupe_key;
- webhooks: unique subscription/event.

## Segurança

- RLS em tabela pública;
- views com security invoker;
- helpers internos em schema private;
- SECURITY DEFINER com search_path vazio;
- RPCs privilegiados apenas para service_role;
- worker protegido por secret;
- CI fiscaliza migrations.

## Infra pendente

Ainda falta o projeto Supabase e Vercel isolado do CRM. Nenhuma migration deve ser aplicada em banco de outro produto.
