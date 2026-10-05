# Backend capabilities

## Customer 360
- timeline unificada
- notas
- campos customizados
- preferências por canal
- origem
- compras/LTV
- avaliações
- propostas
- tarefas
- score comercial

## B2B
`accounts` permite empresas com múltiplos contatos, responsável, documento, segmento e status. Deals podem ser vinculados à empresa e `account_metrics` consolida carteira, pipeline e LTV.

## Catálogo e preços
Produtos/serviços vivem em `catalog_items`. Price books suportam preço por quantidade e uma tabela padrão por tenant. Propostas podem referenciar o item canônico.

## Lead scoring
Regras por evento/campo geram score events idempotentes. O agregado classifica cold / warm / hot com thresholds por tenant.

## MIRA Knowledge
FAQ, política, produto, processo e scripts usam full-text search em português no Postgres. Não depende de embeddings pagos.

## Automação
- domain events
- conditions JSON
- ações permitidas
- cooldown por contato/entidade
- runs auditáveis
- durable jobs
- retry/backoff
- dead jobs
- outbox
- webhooks

## Analytics operacional
`deal_stage_history` registra tempo em cada etapa. `deal_velocity` calcula média/mediana por estágio. Atribuições de conversa também têm histórico próprio.

## SaaS / Billing foundation
`tenant_subscriptions` guarda plano, status, features e limites. `usage_events` é idempotente e alimenta `usage_counters` mensais.

Métricas já instrumentadas:
- `messages.whatsapp.sent`
- `automation.events.processed`
- `webhooks.delivered`

## API e integrações
- webhooks outbound com HMAC opcional
- API keys com SHA-256 e scopes
- provider WhatsApp desacoplado
- secrets fora do banco

## Privacidade
Sales/marketing é suprimido quando o contato está opt-out ou transactional-only. Transacional/suporte permanece separado.

## Segurança
- RLS
- security invoker
- schema private
- search_path vazio
- service role server-side
- migration security CI

## Próximos backends
- importador CSV assíncrono
- calendário comercial/feriados
- provider WhatsApp por tenant
- API pública v1
- exportação/exclusão LGPD
- snapshots analíticos
