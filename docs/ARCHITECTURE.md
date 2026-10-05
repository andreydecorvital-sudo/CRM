# MIRA CRM — arquitetura inicial

## Princípios

- SaaS multiempresa desde o banco.
- WhatsApp é provider-neutral; WAHA é só o primeiro adapter.
- MIRA nunca é dona do dado: conversa, lead, compra, avaliação e auditoria vivem no domínio CRM.
- IA inicia em `assist`; `auto` só é habilitado por tenant e por política.
- Toda mensagem recebida é idempotente por conversa + external_id.
- Nenhum segredo de provider entra em tabela em texto puro; `secret_ref` aponta para secret manager/env.
- Recorrência e reputação fazem parte do mesmo ciclo do cliente, sem virar bancos paralelos.

## Fluxo

WhatsApp provider → webhook normalizado → ingestão idempotente → contato/conversa → classificação MIRA → CRM → venda → transação → recorrência → pós-venda → avaliação → reativação.

## 253 · Recorrência

A compra é registrada em `customer_transactions`. Um trigger recalcula `customer_profiles` com:

- número de compras;
- LTV;
- ticket médio;
- primeira e última compra;
- tier: lead / primeira compra / recorrente / VIP.

O status de atividade é calculado separadamente na view `customer_lifecycle`: ativo / em risco / inativo. Assim um VIP pode estar em risco sem perder a informação de valor.

## 257 · Avaliações

`review_requests` controla fila, envio e resposta. Cada pedido recebe `public_token` aleatório e a rota pública só permite registrar nota/feedback daquele token. A automação respeita delay e cooldown configuráveis por tenant.

Não existe review gating: uma eventual URL pública de Google/marketplace é disponibilizada sem condicionar à nota informada.

## Segurança

- RLS em tabelas expostas.
- helper de membership em schema `private`.
- `SECURITY DEFINER` usa `search_path = ''` e nomes totalmente qualificados.
- RPC de ingestão do provider é executável apenas pelo `service_role`.
- views públicas usam `security_invoker = true`.
- grants do Data API são explícitos.

## Fases seguintes

1. Supabase e Vercel isolados.
2. Auth + convites.
3. Inbox/CRM com dados reais.
4. Sessão WhatsApp por tenant.
5. worker de mensagens/agendamentos.
6. MIRA/Gemini em modo assistido.
7. automação segura por política.
