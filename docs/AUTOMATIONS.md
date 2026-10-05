# Motor de automações

## Objetivo

Automação no MIRA CRM é orientada a eventos. Regras não ficam acopladas ao WhatsApp nem ao frontend.

Fluxo:

`mudança de domínio → domain_event → job durável → scoring → regras → ações → auditoria/retry`

## Eventos iniciais

- `message.received`
- `message.sent`
- `deal.created`
- `deal.stage_changed`
- `deal.won`
- `deal.lost`
- `transaction.completed`
- `transaction.refunded`
- `transaction.cancelled`
- `proposal.created`
- `proposal.sent`
- `proposal.viewed`
- `proposal.accepted`
- `review.pending`
- `review.sent`
- `review.responded`

Eventos possuem dedupe key e são gerados na mesma transação da mudança de negócio quando possível.

## Condições

Uma regra usa JSON:

```json
{
  "all": [
    { "path": "payload.valueCents", "op": "gte", "value": 100000 },
    { "path": "eventType", "op": "eq", "value": "deal.created" }
  ],
  "any": [
    { "path": "payload.source", "op": "eq", "value": "google" },
    { "path": "payload.source", "op": "eq", "value": "whatsapp" }
  ]
}
```

Operadores: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists`, `in`.

## Ações suportadas

### task.create
Cria tarefa/follow-up idempotente.

### contact.tag
Cria/reutiliza tag e vincula ao contato atomicamente.

### deal.follow_up
Atualiza `next_followup_at`; o trigger do deal sincroniza a tarefa automática.

### conversation.set_department
Move a conversa de fila e aciona o roteador.

### message.queue
Escreve na outbox. O worker envia depois; regras de consentimento são aplicadas antes de enfileirar.

### notification.create
Cria notificação para um usuário do tenant.

## Templates em parâmetros

Strings de ações aceitam interpolação:

```text
Novo lead: {{event.payload.title}}
Contato: {{event.contactId}}
```

## Cooldown

Cooldown é por contato; quando o evento não possui contato, usa a entidade agregada. Um lead nunca bloqueia a automação de outro lead.

## Entrega e retry

`job_queue` usa claim com `FOR UPDATE SKIP LOCKED`, lock por worker, exponential backoff e dead-letter lógico após `max_attempts`.

O worker nunca confia no frontend para concluir jobs.

## Outbound

Mensagens saem por `outbound_messages`.

Antes do envio:
- valida tenant/contato/conversa;
- aplica preferência do canal;
- bloqueia sales/marketing em opt-out ou transactional-only;
- marca `sending` antes do provider;
- se houver crash após envio e antes da confirmação, o sistema marca como entrega incerta e não reenvia cegamente.

Isso prioriza evitar mensagem duplicada.

## Webhooks

Webhooks:
- exigem HTTPS;
- bloqueiam destinos locais/IPs privados óbvios;
- possuem retry;
- podem usar HMAC SHA-256;
- `secret_ref` é nome de variável de ambiente, nunca o segredo em texto no banco.

## Worker

Endpoint interno:

`/api/internal/jobs/tick`

Autenticação:
- `Authorization: Bearer <CRM_WORKER_SECRET>`, ou
- `x-crm-worker-secret`.

Ele processa automações, outbox e webhooks.
