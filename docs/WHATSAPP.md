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
