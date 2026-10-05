# MIRA CRM — definição de produto

## Tese

O produto não é um chatbot anexado a um Kanban. É um sistema operacional comercial para PMEs que concentra atendimento, execução, negociação, pós-venda e inteligência do cliente.

Fluxo principal:

`Origem → Lead → Atendimento → Tarefa → Proposta → Venda → Recorrência → Avaliação → Reativação`

A MIRA atua dentro desse fluxo e respeita políticas do tenant. Ela pode classificar, sugerir, priorizar e executar somente ações explicitamente liberadas.

## Superfícies

### Atendimento
- inbox WhatsApp;
- departamentos e filas;
- prioridade;
- SLA de primeira resposta e resolução;
- handoff humano;
- roteamento manual, round-robin ou menor fila.

### CRM
- contatos e histórico;
- pipelines e oportunidades;
- tags, temperatura, responsável;
- filtros por origem, recorrência, prioridade e atividade.

### Execução
- tarefas e follow-ups;
- prazo, prioridade, responsável e canal;
- tarefa automática sincronizada com `deals.next_followup_at`.

### Aquisição
- first touch e last touch;
- UTM source/medium/campaign/content/term;
- click ids;
- referrer e landing page;
- base para ROI por campanha.

### Propostas
- itens, quantidade e preço;
- desconto fixo ou percentual;
- validade;
- link público;
- status draft/sent/viewed/accepted/rejected/expired/cancelled;
- aceite idempotente.

### Carteira
- compras;
- LTV e ticket médio;
- lead / primeira compra / recorrente / VIP;
- ativo / em risco / inativo.

### Pós-venda
- coleta de avaliação;
- delay e cooldown por tenant;
- nota e comentário;
- reputação externa sem review gating.

## Princípios comerciais

1. vender resultado, não número de telas;
2. WhatsApp é canal, não o produto inteiro;
3. histórico do cliente é único entre vendas, suporte e pós-venda;
4. automação deve reduzir follow-up esquecido e tempo de resposta;
5. MIRA deve explicar por que priorizou ou executou uma ação;
6. recursos avançados podem ser limitados por plano sem fragmentar o dado do cliente.
