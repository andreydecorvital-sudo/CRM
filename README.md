# MIRA CRM

Atendimento automático + CRM multiempresa, extraído da arquitetura MIRA/WhatsApp do Argoplace sem carregar o monolito de marketplace.

## Stack

- Next.js 16 / React 19
- Supabase Postgres + Auth + RLS
- Vercel
- WhatsApp provider adapter (WAHA primeiro; Meta/BSP depois)
- MIRA em modo assistido por padrão

## Módulos atuais

- Inbox de atendimento
- contatos, tags e pipeline
- leads/deals e handoff humano
- webhook WhatsApp idempotente
- auditoria multi-tenant
- **253 · Recorrência:** compras, LTV, ticket médio, 1ª compra, recorrente, VIP, em risco e inativo
- **257 · Avaliações:** fila pós-venda, cooldown, link público, nota, feedback e auditoria

## Rodar

```bash
cp .env.example .env.local
npm install
npm run dev
```

Para um projeto Supabase novo e isolado, aplique na ordem:

1. `supabase/migrations/202610050001_init_mira_crm.sql`
2. `supabase/migrations/202610050002_customer_lifecycle_reviews.sql`

## Segurança

Não copie secrets do VitalHub. Use um Supabase próprio, novas chaves e novas variáveis de ambiente. O webhook exige `x-mira-webhook-secret`.

A v0.2 move o helper de membership para o schema privado, restringe o RPC de ingestão ao `service_role`, usa RLS e grants explícitos e cria views com `security_invoker`.

## Avaliações

O coletor não faz review gating: a URL pública de avaliação pode ser oferecida a qualquer cliente que conclua o formulário, independentemente da nota interna. A automação nasce desligada por tenant e só agenda mensagens quando `review_enabled` e `review_auto_send_enabled` estiverem ativos.

## Origem técnica

O núcleo foi redesenhado a partir das ideias já testadas no VitalHub: contatos, conversas, mensagens, ingestão idempotente, handoff e adapter de WhatsApp. Nomes, tabelas e limites foram alterados para um SaaS multiempresa independente.
