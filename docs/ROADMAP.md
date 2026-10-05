# Roadmap de execução

## Sprint 0 — base
- [x] repo/base independente
- [x] multi-tenant no banco
- [x] contatos, inbox, mensagens e auditoria
- [x] pipeline/deals/tags
- [x] adapter WAHA
- [x] política de handoff da MIRA
- [x] 253 · clientes recorrentes / LTV / VIP / risco
- [x] 257 · coleta de avaliações / link público / cooldown
- [x] hardening de RLS e SECURITY DEFINER
- [x] CI de typecheck + build
- [ ] criar Supabase isolado
- [ ] conectar Vercel
- [ ] primeiro tenant real

## Sprint 1 — piloto vendável
- [ ] login e convite de equipe
- [ ] inbox lendo dados reais
- [ ] envio real pelo WhatsApp
- [ ] QR/session por tenant
- [ ] MIRA gerar rascunho com Gemini
- [ ] filtros reais no CRM
- [ ] mover lead entre etapas
- [ ] notas e follow-up
- [ ] tela de configuração das regras de recorrência
- [ ] worker que envia avaliações pendentes

## Sprint 2 — automação
- [ ] resposta automática por regras
- [ ] horário comercial
- [ ] SLA e fila
- [ ] playbooks por segmento
- [ ] webhooks de entrega/leitura
- [ ] métricas de atendimento e vendas
- [ ] campanhas de reativação de clientes em risco/inativos
- [ ] métricas de NPS/CSAT e temas recorrentes de feedback

## Produto 2 — Afiliados
Manter como módulo/produto separado. Reutilizar autenticação, tenants, filas, auditoria e scheduler; criar domínio próprio para ofertas, links, canais, campanhas, cliques, vendas e comissão.
