# Roadmap

## Backend concluído
- [x] multi-tenant + RLS
- [x] CRM/deals/pipeline
- [x] WhatsApp adapter
- [x] WhatsApp provider/config por tenant
- [x] tarefas/follow-up
- [x] SLA/filas/roteamento
- [x] UTM first/last touch
- [x] propostas
- [x] recorrência/LTV/VIP
- [x] avaliações
- [x] timeline/notas
- [x] custom fields
- [x] consentimento por canal
- [x] lead scoring
- [x] knowledge FTS
- [x] domain events
- [x] automation engine
- [x] Event Router + capability owner registry
- [x] Action Proposal / Authorized Intent
- [x] governed adapter registry + post-read verification
- [x] execution receipts + replay guard
- [x] durable job queue
- [x] outbox
- [x] webhooks
- [x] API keys/scopes
- [x] API pública v1 inicial
- [x] accounts B2B
- [x] catálogo/price books
- [x] histórico de estágio/velocity
- [x] histórico de atribuição
- [x] subscriptions/features/limits
- [x] usage metering
- [x] privacy request/inventory/export
- [x] business calendars/holidays
- [x] migration security CI
- [x] Tech Radar
- [x] AI Gateway abstraction
- [x] LiteLLM-compatible client
- [x] PostHog server analytics foundation
- [x] OpenTelemetry + Langfuse tracing foundation
- [x] cadastro guiado de cliente pelo WhatsApp
- [x] e-mail outbound por tenant
- [x] consentimento específico de oportunidades
- [x] comandos de opt-in/opt-out de oportunidades pelo WhatsApp

## Shared platform próximo
- [ ] provisionar LiteLLM real fora do runtime CRM
- [ ] criar virtual key exclusiva do CRM
- [ ] configurar PostHog
- [ ] configurar Langfuse
- [ ] validar Supabase Queues no projeto isolado
- [ ] validar Supabase Cron no projeto isolado
- [ ] piloto pgvector/hybrid search quando houver embedding real
- [ ] Hermes Builder/Auditor com branch + PR

## Próximo backend
- [x] importador CSV assíncrono
- [x] cálculo de SLA em horário comercial
- [x] backend provisioning/status/QR de sessão WhatsApp por tenant
- [ ] API v1 de deals/tasks/propostas
- [ ] anonimização/exclusão LGPD assistida
- [ ] snapshots de analytics
- [ ] templates de automações por segmento
- [ ] billing provider

## Infra piloto
- [ ] Supabase isolado
- [ ] Vercel isolada
- [ ] login/onboarding
- [ ] primeiro tenant
- [ ] worker agendado
- [ ] WhatsApp real
- [ ] Gemini assist

## Frontend
Adiado até estabilizar backend:
- Customer 360
- Inbox real
- Automation Builder
- Proposal Editor
- Pipeline Editor
- Admin/configurações
- dashboards
