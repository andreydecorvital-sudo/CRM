# MIRA CRM

CRM + atendimento + automação comercial multiempresa.

## Stack

- Next.js 16 / React 19
- Supabase Postgres + Auth + RLS
- Vercel
- WhatsApp provider adapter (WAHA primeiro; Meta/BSP depois)
- MIRA em modo assistido por padrão

## Produto atual

- Inbox WhatsApp e handoff humano
- departamentos, filas, SLA e roteamento
- CRM, contatos, tags, pipelines e deals
- tarefas e follow-ups com sincronização automática do deal
- origem / UTM com first touch e last touch
- propostas com itens, desconto, link público, visualização e aceite
- recorrência, LTV, ticket, VIP, risco e inatividade
- avaliações pós-venda com cooldown
- auditoria e isolamento multi-tenant

O fluxo de produto é:

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

## Rodar

```bash
cp .env.example .env.local
npm install
npm run dev
```

Para um projeto Supabase novo e isolado, aplique as migrations na ordem:

1. `202610050001_init_mira_crm.sql`
2. `202610050002_customer_lifecycle_reviews.sql`
3. `202610050003_commercial_operations.sql`

## Segurança

Não copie secrets do VitalHub. Use um Supabase próprio e novas credenciais.

- RLS nas tabelas expostas;
- helper de membership em schema privado;
- RPCs privilegiados restritos ao `service_role`;
- `SECURITY DEFINER` com `search_path = ''`;
- views com `security_invoker`;
- links públicos usam tokens aleatórios e passam pelo servidor;
- nenhum provider secret vai para o browser.

## CI

O workflow `CRM CI` executa instalação, TypeScript e `next build` em push/PR.

## Produto

Veja `docs/PRODUCT.md` e `docs/ARCHITECTURE.md`.
