# MIRA CRM — definição de produto

## Tese

O MIRA CRM é um sistema operacional comercial para PMEs. Ele conecta atendimento, execução, negociação, pós-venda e inteligência do cliente sem tratar IA como um módulo isolado.

Fluxo principal:

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

A MIRA atua dentro desse fluxo e respeita políticas do tenant. Ela classifica, prioriza, sugere e executa apenas ações explicitamente permitidas.

## Customer 360

Cada contato concentra:
- conversas;
- tarefas;
- propostas;
- compras;
- avaliações;
- origem;
- notas;
- campos customizados;
- preferências de canal;
- score comercial;
- timeline cronológica.

## Atendimento

- WhatsApp provider-neutral;
- departamentos;
- filas;
- prioridade;
- SLA;
- handoff;
- roteamento manual, round-robin ou menor fila.

## Execução comercial

- tarefas;
- follow-up;
- responsável;
- prazo;
- prioridade;
- automações orientadas a eventos.

## Aquisição

- first touch;
- last touch;
- UTM;
- click IDs;
- referrer;
- landing page;
- base para atribuição e ROI.

## Negociação

- pipeline;
- deals;
- propostas;
- desconto;
- validade;
- visualização;
- aceite idempotente.

## Carteira

- compras;
- LTV;
- ticket médio;
- primeira compra;
- recorrente;
- VIP;
- ativo / em risco / inativo.

## Pós-venda

- avaliação;
- cooldown;
- nota;
- comentário;
- reputação externa sem review gating.

## Lead intelligence

Lead scoring é configurável por evento/campo e gera histórico explicável. A MIRA pode usar score, recorrência, origem, SLA e comportamento para decidir prioridade.

## Knowledge

A base interna da MIRA possui FAQ, políticas, produtos, processos e scripts. A primeira implementação usa full-text search em português no Postgres, sem exigir embeddings pagos.

## Automation Platform

Automações são produto de primeira classe:
- domain events;
- condições JSON;
- ações permitidas;
- cooldown por contato;
- runs auditáveis;
- fila durável;
- retry/backoff;
- outbox;
- webhooks.

## Princípios

1. vender resultado, não telas;
2. WhatsApp é canal, não o produto;
3. todo dado pertence ao tenant e ao domínio CRM;
4. automação não pode perder jobs nem duplicar ações críticas;
5. IA precisa de guardrails e rastreabilidade;
6. opt-out deve ser respeitado antes do provider;
7. integrações são assíncronas e resilientes;
8. frontend não dita arquitetura do backend.
