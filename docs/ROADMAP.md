# Roadmap de execução

## Base concluída
- [x] repo independente
- [x] multi-tenant + RLS
- [x] contatos, mensagens, inbox e auditoria
- [x] pipeline, deals e tags
- [x] adapter WAHA
- [x] política de handoff da MIRA
- [x] 253 · recorrência / LTV / VIP / risco
- [x] 257 · avaliações / link público / cooldown
- [x] tarefas e follow-ups
- [x] sincronização automática de follow-up do deal
- [x] departamentos, SLA e roteamento
- [x] first touch / last touch / UTM
- [x] propostas com itens, totais, link público e aceite
- [x] RPCs atômicos para roteamento e aceite
- [x] hardening de RLS e SECURITY DEFINER
- [x] CI de typecheck + build

## Piloto vendável
- [ ] Supabase isolado do CRM
- [ ] Vercel do CRM
- [ ] login, onboarding e convite de equipe
- [ ] primeiro tenant real
- [ ] inbox lendo dados reais
- [ ] envio real pelo WhatsApp
- [ ] QR/session por tenant
- [ ] configuração visual de departamentos e SLA
- [ ] cadastro real de pipeline
- [ ] editor real de proposta
- [ ] importação de contatos
- [ ] MIRA gerar rascunho com Gemini
- [ ] métricas reais no dashboard

## Automação
- [ ] classificador de intenção → departamento
- [ ] resposta automática por política
- [ ] horário comercial e feriados
- [ ] worker de tarefas vencidas
- [ ] worker de avaliações pendentes
- [ ] campanhas de reativação
- [ ] captura web de UTM/lead
- [ ] webhooks de entrega/leitura do WhatsApp
- [ ] alertas de SLA

## Comercial
- [ ] landing específica do CRM
- [ ] planos e limites
- [ ] billing
- [ ] onboarding self-service
- [ ] templates por segmento
- [ ] demonstração com tenant fake isolado

## Afiliados
Produto/módulo separado. Pode reutilizar autenticação, tenants, filas, auditoria e scheduler, mas mantém domínio próprio.
