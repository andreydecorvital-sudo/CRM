# WhatsApp provider architecture

## Por tenant

`whatsapp_connections` é a fonte de configuração por empresa.

Para WAHA, `config` pode conter:

```json
{
  "baseUrl": "https://waha.example.com",
  "session": "tenant-acme"
}
```

`secret_ref` guarda somente o NOME da variável de ambiente que contém a API key.

Exemplo:

```
secret_ref = CRM_WAHA_ACME_API_KEY
```

O valor da chave não vai para o banco.

## Fallback global

O fallback global `WAHA_BASE_URL / WAHA_API_KEY / WAHA_SESSION` fica desabilitado por padrão.

Só é habilitado com:

```
WAHA_ALLOW_GLOBAL_FALLBACK=true
```

Isso é apenas para piloto/ambiente controlado. SaaS multiempresa deve ter conexão explícita por tenant.

## Provider factory

Todo envio passa por `createWhatsappProviderForTenant(tenantId)`.

Isso impede que o domínio CRM dependa diretamente de WAHA e permite adicionar Meta/BSP sem alterar contatos, conversas, outbox ou automações.

## Próximo passo

- provisioning de sessão WAHA por tenant
- QR/status via backend
- health check
- reconnect policy
- Meta Cloud API/Embedded Signup como provider oficial


## Webhook inbound

O webhook WAHA usa o header:

```
x-crm-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>
```

Depois da ingestão idempotente, o backend pode avançar o cadastro guiado e processar comandos de preferência do próprio contato.


## Lifecycle de sessão

O backend administra a sessão WAHA por tenant em `src/lib/server/whatsapp/waha-admin.ts`.

Estados WAHA relevantes:

- `STOPPED` → disconnected
- `STARTING` → pairing
- `SCAN_QR_CODE` → pairing
- `PASSKEY_REQUIRED` → pairing/manual
- `PASSKEY_CONFIRMATION_REQUIRED` → pairing/manual
- `WORKING` → connected
- `FAILED` → error

O status bruto fica em `provider_status`; o status normalizado continua em `whatsapp_connections.status`.

Histórico de mudanças:
- `whatsapp_session_events`

O QR é consultado sob demanda e **não é persistido**.

## Endpoints internos

Protegidos por `CRM_INTERNAL_SECRET`.

### Status

```
GET /api/internal/whatsapp/:tenantId/session
GET /api/internal/whatsapp/:tenantId/session?refresh=1
```

### Controle

```
POST /api/internal/whatsapp/:tenantId/session
{"action":"provision"}

POST /api/internal/whatsapp/:tenantId/session
{"action":"start"}

POST /api/internal/whatsapp/:tenantId/session
{"action":"restart"}

POST /api/internal/whatsapp/:tenantId/session
{"action":"stop"}

POST /api/internal/whatsapp/:tenantId/session
{"action":"logout"}
```

### QR

```
GET /api/internal/whatsapp/:tenantId/qr
```

Retorna base64 apenas enquanto a sessão estiver no fluxo de pareamento.

## Provisioning

Ao provisionar:

1. lê `whatsapp_connections`;
2. verifica se a sessão já existe no WAHA;
3. cria se necessário;
4. injeta metadata `crm.tenant_id`;
5. configura webhook de `message` e `session.status`;
6. inicia a sessão;
7. sincroniza estado no CRM.

O webhook recebe `session.status` e atualiza o banco automaticamente.
