# MIRA CRM

Atendimento automático + CRM multiempresa, extraído da arquitetura MIRA/WhatsApp do Argoplace sem carregar o monolito de marketplace.

## Stack

- Next.js 16 / React 19
- Supabase Postgres + Auth + RLS
- Vercel
- WhatsApp provider adapter (WAHA primeiro; Meta/BSP depois)
- MIRA em modo assistido por padrão

## MVP

- Inbox de atendimento
- contatos e tags
- funil CRM
- leads/deals
- handoff humano
- webhook WhatsApp idempotente
- auditoria
- multi-tenant

## Rodar

```bash
cp .env.example .env.local
npm install
npm run dev
```

Aplique `supabase/migrations/202610050001_init_mira_crm.sql` em um projeto Supabase novo e isolado.

## Segurança

Não copie secrets do VitalHub. Use um Supabase próprio, novas chaves e novas variáveis de ambiente. O webhook exige `x-mira-webhook-secret`.

## Origem técnica

O núcleo foi redesenhado a partir das ideias já testadas no VitalHub: contatos, conversas, mensagens, ingestão idempotente, handoff e adapter de WhatsApp. Nomes, tabelas e limites foram alterados para um SaaS multiempresa independente.
