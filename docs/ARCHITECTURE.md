# MIRA CRM — arquitetura

## Princípios

- SaaS multiempresa desde o banco.
- WhatsApp é provider-neutral; WAHA é só o primeiro adapter.
- MIRA nunca é dona do dado: conversa, lead, tarefa, proposta, compra e avaliação vivem no domínio CRM.
- IA inicia em `assist`; `auto` só é habilitado por tenant e política.
- Toda mensagem recebida é idempotente por conversa + external_id.
- Segredos de provider ficam fora das tabelas em texto puro.
- Decisões concorrentes importantes são atômicas no Postgres.

## Fluxo

WhatsApp provider → webhook → contato/conversa → departamento/SLA → roteamento → MIRA/humano → deal → follow-up → proposta → venda → recorrência → avaliação → reativação.

## Concorrência e atomicidade

### Roteamento
`crm_route_conversation` bloqueia a conversa antes de escolher atendente. Evita dois workers distribuírem a mesma conversa simultaneamente.

### Proposta
`crm_create_proposal` cria cabeçalho e itens na mesma transação. `crm_accept_proposal` bloqueia a proposta antes do aceite e é idempotente.

### Follow-up
`deals.next_followup_at` sincroniza uma única tarefa automática por deal através de `automation_key`.

## Atribuição

`lead_attributions` preserva todos os touches. A view `contact_attribution` fornece first touch e last touch sem destruir o histórico intermediário.

## SLA

Departamento define metas de primeira resposta/resolução. A conversa armazena deadlines calculados e a primeira mensagem outbound captura `first_response_at`.

## Segurança

- RLS em tabelas do schema público.
- membership helper no schema `private`.
- RPCs privilegiados executáveis apenas pelo `service_role`.
- `SECURITY DEFINER` com `search_path = ''`.
- views com `security_invoker = true`.
- proposta e avaliação públicas usam token e endpoints server-side.

## Infra pendente

O código está pronto para Supabase/Vercel isolados, mas migrations não devem ser aplicadas em projetos de outros produtos.
