# API pública v1

A API usa as mesmas regras multi-tenant do produto, mas nunca recebe `tenant_id` do cliente. O tenant é resolvido pela API key.

## Autenticação

Envie:

```
Authorization: Bearer crm_live_<prefix>.<secret>
```

A chave completa é exibida uma vez. O banco guarda somente prefixo, SHA-256, scopes, expiração e revogação.

O plano do tenant precisa ter a feature `api=true` e respeitar o limite mensal `api.requests` quando configurado.

## Request ID e medição

O cliente pode enviar `X-Request-Id`. Caso não envie, o servidor gera um UUID.

Cada request autenticado é medido de forma idempotente usando:

`api:<apiKeyId>:<requestId>`

## Contatos

### GET /api/v1/contacts

Scope: `contacts:read`

Query:
- `limit` — 1..100
- `externalId`
- `phone`

Exemplo:

```bash
curl 'https://crm.exemplo.com/api/v1/contacts?externalId=customer-123' \
  -H 'Authorization: Bearer crm_live_xxx.yyy'
```

### POST /api/v1/contacts

Scope: `contacts:write`

```json
{
  "externalId": "customer-123",
  "displayName": "Maria Costa",
  "phoneE164": "+5511999999999",
  "email": "maria@example.com",
  "city": "São Paulo",
  "metadata": {
    "erpId": "99182"
  }
}
```

É um upsert idempotente por `tenant_id + external_contact_id`.

## Eventos

### POST /api/v1/events

Scope: `events:write`

Permite que integrações externas alimentem o motor de automação.

```json
{
  "type": "checkout.abandoned",
  "aggregateType": "checkout",
  "aggregateId": "e66d1824-5474-4d32-8e0d-c6f0113b69ab",
  "contactId": "bd89b3f3-0a2d-4b05-b1ec-0909a6aa60b5",
  "dedupeKey": "checkout-abandoned:99182",
  "payload": {
    "cartValueCents": 34990,
    "items": 3
  }
}
```

Resposta: HTTP 202. O evento entra na fila e as automações processam assíncronamente.

## Scopes previstos

- `contacts:read`
- `contacts:write`
- `events:write`
- `deals:read`
- `deals:write`
- `tasks:read`
- `tasks:write`
- `proposals:read`
- `webhooks:manage`
- `*` para chaves administrativas server-to-server

Novas rotas devem exigir scope explícito. Não existe API key sem tenant.
