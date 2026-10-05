# Roadmap de execução

## Backend foundation concluída
- [x] multi-tenant + RLS
- [x] contatos, mensagens, pipeline e deals
- [x] WAHA adapter
- [x] MIRA policy/handoff
- [x] tarefas e follow-ups
- [x] departamentos, SLA e roteamento
- [x] atribuição first/last touch
- [x] propostas e aceite
- [x] recorrência / LTV / VIP / risco
- [x] avaliações
- [x] customer timeline
- [x] notas
- [x] campos customizados tipados
- [x] preferências por canal
- [x] lead scoring
- [x] knowledge base FTS
- [x] domain events
- [x] automation rules/runs
- [x] durable job queue
- [x] outbound message outbox
- [x] webhooks outbound
- [x] API keys + scopes
- [x] worker interno
- [x] migration security CI

## Próxima camada de backend
- [ ] accounts/empresas B2B
- [ ] histórico de estágio e velocity
- [ ] catálogo de produtos/serviços
- [ ] importador CSV assíncrono
- [ ] horário comercial/feriados
- [ ] entitlements por plano
- [ ] WhatsApp session/provider por tenant
- [ ] API pública versionada
- [ ] exportação LGPD / exclusão assistida
- [ ] métricas agregadas e snapshots

## Infra do piloto
- [ ] Supabase isolado
- [ ] Vercel isolada
- [ ] login/onboarding
- [ ] primeiro tenant
- [ ] worker agendado
- [ ] sessão WhatsApp real
- [ ] Gemini assist mode

## Frontend
Adiado nesta fase. Depois do backend estabilizado:
- inbox real;
- builder de automações;
- editor de pipeline;
- editor de proposta;
- configurações de SLA;
- customer 360;
- dashboards.

## Comercial
- [ ] landing CRM
- [ ] planos e limites
- [ ] billing
- [ ] onboarding self-service
- [ ] templates por segmento
- [ ] tenant demo isolado
