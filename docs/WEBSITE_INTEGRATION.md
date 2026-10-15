# Integração de sites de clientes — SaaS CRM

## Escopo implementado no PR

A captura é a **primeira fatia vertical**, ainda não uma plataforma SaaS pronta para venda.

- Widget HTML/JS independente de framework: `GET /api/public/widget.js?site=<uuid>`
- Intake: `OPTIONS/POST /api/public/sites/:siteId/leads`
- Provisionamento administrativo de fontes: `GET/POST /api/internal/website-sources`
- `website_sources` relaciona **tenant**, domínios permitidos, política de privacidade e estado.
- `crm_ingest_website_lead` é uma RPC restrita à `service_role`: upsert do contato + evento + recibo na mesma transação.
- O evento `website.lead_submitted` entra no motor de automações **existente**, não cria outro.
- Rate limit por fingerprint HMAC e teto por site, em janelas de dez minutos; retries pela mesma `requestId` não geram eventos duplicados.
- Nome/e-mail/telefone e URL de origem validados. Consentimento solicitado é **somente para retorno sobre a solicitação**, não habilita marketing.
- Páginas `/automations` e `/integrations` mostram templates reais e instalação; nenhuma regra é ativada por essas telas.

## Preparação obrigatória

1. Provisionar o Supabase **exclusivo** do CRM e aplicar migrations em ordem, terminando em `202610150001_website_leads.sql`.
2. Manter `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas nas variáveis protegidas do servidor.
3. Definir `CRM_INTERNAL_SECRET` (backend administrativo), `CRM_SITE_LEAD_HMAC_SECRET` (aleatório com pelo menos 32 caracteres) e o secret do worker existente.
4. Garantir worker `/api/internal/jobs/tick` operacional para tratar eventos. Sem worker, o contato e evento são persistidos, mas automações não são processadas.
5. Antes de habilitar envio de WhatsApp/e-mail, validar a conexão por tenant, preferências de consentimento e templates do provedor.

**Não aplicar migrations no Supabase da Argoplace, Origin ou outro produto.**

## Provisionamento administrativo (piloto controlado)

O endpoint usa o secret global interno. **Nunca o chame do browser nem ofereça esse secret aos clientes.** Substituir por login e permissões específicas por empresa no onboarding do SaaS.

Criação, inicialmente *pausada*:

```bash
curl -X POST "https://SEU_CRM/api/internal/website-sources" \
  -H "Authorization: Bearer SEU_CRM_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "operation":"create",
    "tenantId":"TENANT_UUID",
    "name":"Site institucional",
    "allowedOrigins":["https://cliente.com.br","https://www.cliente.com.br"],
    "privacyPolicyUrl":"https://cliente.com.br/privacidade"
  }'
```

A resposta contém `source.id` e um `embedCode` sem segredo. Validar os domínios e a política de privacidade e então ativar:

```bash
curl -X POST "https://SEU_CRM/api/internal/website-sources" \
  -H "Authorization: Bearer SEU_CRM_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"operation":"set_status","tenantId":"TENANT_UUID","siteId":"SITE_UUID","status":"active"}'
```

Instalar antes de `</body>` no site autorizado:

```html
<script async src="https://SEU_CRM/api/public/widget.js?site=SITE_UUID"></script>
```

A tela `/integrations` gera esse código ao informar o `SITE_UUID`. Depois, testar no domínio autorizado com solicitação real de teste, conferir contato, `domain_events`, `website_lead_receipts`, processamento e deduplicação.

## Modelo de request

```json
{
  "requestId":"b560f4f8-76b9-4edb-b38e-ab6f8a9bba9a",
  "displayName":"Maria",
  "email":"maria@example.com",
  "phone":"+5511999999999",
  "message":"Quero um orçamento",
  "pageUrl":"https://cliente.com.br/contato",
  "utm":{"utm_source":"google","utm_campaign":"outubro"},
  "privacyConsent":true
}
```

O `siteId` do caminho determina o tenant após validação no banco. **O caller nunca informa tenantId no endpoint público.**

## Segurança e limites

- Domínios devem ser origens exatas com HTTPS (HTTP apenas para localhost). Não aceitar sufixos vagos.
- `Origin` não é autenticação forte: clientes HTTP conseguem falsificá-lo. A superfície precisa também de WAF/bot protection/CAPTCHA, telemetria e quotas de assinatura antes de uso aberto em escala.
- O fingerprint de IP é HMAC, não o endereço puro, e depende de `CRM_SITE_LEAD_HMAC_SECRET`. Proxy headers não são segurança confiável por si só.
- Limite atual: 10 novas tentativas por fingerprint e 250 por site a cada 10 minutos. Há risco de bloqueio por abuso; é um primeiro guardrail, não proteção definitiva.
- A tabela `website_lead_limits` precisa de job de limpeza (mais de 48h). Definir política de retenção, direitos LGPD e privacidade do cliente.
- Nenhum formulário concede autorização promocional; opt-in comercial e preferências por canal são etapas separadas.
- `website_lead_submitted` não dispara mensagem automática sem regra aprovada e conexão real de outbound.

## Próximas fases do produto

1. Login Supabase Auth, sessões seguras e onboarding multiempresa (criar tenant, convidar equipe, escolher plano).
2. Gestão self-service de sites e canais autenticada e autorizada por tenant.
3. Automation Builder: draft → validate → simulate → review → approve → active, persistência versionada, logs e desativação.
4. Inbox omnichannel e WhatsApp oficial: provider Meta Cloud API, onboarding Embedded Signup conforme requisitos de app review/Advanced Access; manter WAHA só como adapter opcional piloto.
5. Billing, quotas, planos, suporte, antiabuso/CAPTCHA, privacidade e métricas reais antes de venda pública.
6. Templates por segmento (imobiliária, serviço, comércio, clínica), formulários e chat widget completo com handoff humano.

## Testes de aceite

- Origem não autorizada: 403; site pausado: 403.
- Navegador sem secrets: sem exposição da service role.
- Campos inválidos/sem consentimento: 400.
- Mesma `requestId` repetida: mesmo recibo e evento.
- Site A não pode criar lead no tenant B.
- Retry parcial do worker não dispara mensagem duplicada.
- Sem banco/worker: erro claro, sem falso sucesso de automação.
- Bloqueio de marketing quando preferência não permite.
