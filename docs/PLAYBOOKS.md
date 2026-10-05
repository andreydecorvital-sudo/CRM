# Playbook Engine + Workflow Simulator

## Objetivo

Playbook é a camada de produto por cima do Automation Engine.

Ele descreve uma intenção comercial reutilizável:

```text
Evento
+ condições
+ ações
+ cooldown
+ política de parada
→ Automation Rule
```

O Playbook **não cria um segundo motor**.

`compilePlaybook()` transforma a definição em uma `AutomationRule` compatível com o runtime já existente.

## Modos

### draft

Em construção.

Compila com:
- `enabled=false`

### shadow

Pronto para simulação/observação.

Compila com:
- `enabled=false`

É o modo recomendado antes de qualquer ativação.

### active

Compila com:
- `enabled=true`

Um playbook ativo exige `simulationApproved=true` no compile. Sem aprovação explícita da simulação, o compiler recusa habilitá-lo.

## Workflow Simulator

Arquivo:

- `src/lib/server/playbooks/simulator.ts`

O simulador usa as mesmas funções do runtime:

- `evaluateConditions()`
- `renderValue()`

Portanto condição/template não possuem uma implementação especial só para demo.

Ele **não chama**:
- banco;
- provider;
- adapter externo;
- outbox;
- Router de execução.

## Impacto calculado

Para um conjunto de Domain Events:

- eventos de entrada;
- eventos do trigger;
- eventos que realmente bateram;
- contatos únicos;
- ações consideradas;
- tarefas que seriam criadas;
- follow-ups que seriam definidos;
- tags;
- mudanças de fila;
- notificações;
- mensagens que seriam enfileiradas;
- mensagens suprimidas;
- motivo das supressões.

## Consent simulation

`message.queue` é simulada com a mesma semântica conservadora do serviço de consentimento.

### support / transactional
Permitido.

### sales
Bloqueado em:
- `opted_out`
- `transactional_only`

### marketing
Exige:
- `opted_in`

### opportunity
Exige:
- oportunidades habilitadas;
- canal habilitado nas preferências de oportunidade;
- canal sem opt-out/transactional-only.

Isso permite responder antes da ativação:

> “Esse playbook teria tentado enviar 71 mensagens; 18 seriam bloqueadas por consentimento.”

## Templates iniciais

### high_ticket_paid_lead

`deal.created`

Lead de mídia paga com ticket >= R$ 5 mil:
- tag;
- tarefa prioritária;
- próximo follow-up.

### proposal_sent_followup

`proposal.sent`

Toda proposta enviada:
- gera follow-up em 24h.

### price_intent_inbound

`message.received`

Detecta termos:
- preço;
- valor;
- orçamento.

Ações:
- tag;
- tarefa de resposta rápida.

### won_deal_opportunity_optin

`deal.won`

Exemplo de mensagem de oportunidade pós-venda sujeita ao consentimento específico.

## Internal API

Protegida por `CRM_INTERNAL_SECRET`.

### Templates

```
GET /api/internal/playbooks
```

Template específico:

```
GET /api/internal/playbooks?key=high_ticket_paid_lead
```

### Validar

```json
POST /api/internal/playbooks
{
  "operation":"validate",
  "playbook":{...},
  "simulationApproved":true
}
```

### Compilar

```json
{
  "operation":"compile",
  "tenantId":"...",
  "playbook":{...}
}
```

A resposta contém a `AutomationRule`, mas **não persiste nem ativa**.

### Simular

```json
{
  "operation":"simulate",
  "templateKey":"high_ticket_paid_lead",
  "events":[
    {
      "event":{...},
      "consent":{...}
    }
  ]
}
```

## Activation Gate

Regra desejada para persistência futura:

```text
Draft
 ↓
Validate
 ↓
Simulate
 ↓
Review impact
 ↓
Shadow
 ↓
Approve
 ↓
Active
```

A implementação atual não possui endpoint para publicar/ativar no banco propositalmente.

Antes do Supabase real, estamos validando o contrato e o comportamento.

## Authoring em linguagem natural

O AI Gateway já pode converter linguagem natural em `PlaybookDefinition` através de `draftPlaybookFromText()`.

Exemplo:

> “Quando entrar lead do Meta acima de 5 mil, marque como alto ticket e crie follow-up em 30 minutos.”

A IA só produz um **draft estruturado**, e o backend força `mode=draft` mesmo que o modelo tente retornar outro modo.

Endpoint interno:

```json
POST /api/internal/playbooks
{
  "operation":"draft_from_text",
  "tenantId":"...",
  "instruction":"Quando entrar lead do Meta acima de 5 mil, marque como alto ticket e crie follow-up em 30 minutos."
}
```

Depende do AI Gateway configurado. Sem gateway, o authoring falha isoladamente e os templates/simulador continuam funcionando.

Ela não:
- ativa playbook;
- escreve Automation Rule diretamente;
- ignora validation;
- ignora simulation;
- altera consentimento.

## Próxima evolução

Depois do banco isolado:

- tabela de playbooks/drafts;
- versionamento;
- simulation runs persistidos;
- approval/audit;
- publicação atômica em `automation_rules`;
- replay de eventos históricos;
- comparação before/after;
- templates por segmento;
- authoring em linguagem natural via AI Gateway.
