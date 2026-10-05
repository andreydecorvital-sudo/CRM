# AI Gateway

## Objetivo

Nenhum SaaS nosso deve depender diretamente de um provider de IA.

```text
CRM / outro SaaS
       ↓
AI Gateway Client
       ↓
LiteLLM
       ↓
provider/model escolhido na infraestrutura
```

## Por que

Isso permite:
- trocar modelo sem deploy de produto;
- fallback;
- virtual keys por aplicação;
- budget/rate limit;
- tracking central;
- provider local no futuro.

## Regra

No runtime do CRM **não** guardar:
- `GEMINI_API_KEY`;
- `OPENAI_API_KEY`;
- `ANTHROPIC_API_KEY`.

Essas chaves vivem no gateway.

O CRM recebe apenas uma virtual key:
- `AI_GATEWAY_API_KEY`.

## Aliases

O produto chama alias semântico.

Exemplo inicial:
- `crm-default`
- `crm-fast`

Não chamar `gemini-...` ou `gpt-...` dentro do domínio.

## Cliente

`src/lib/server/platform/ai/gateway.ts`

O cliente:
- normaliza mensagens;
- limita payload;
- aplica timeout;
- envia metadados não sensíveis em headers;
- lê usage;
- gera trace;
- envia analytics sem conteúdo.

## Observabilidade

Langfuse:
- modelo;
- feature;
- latência;
- tokens;
- status.

PostHog:
- `ai request completed`;
- `ai request failed`.

Prompts e respostas não entram no PostHog.

No Langfuse, conteúdo só entra se:
`LANGFUSE_CAPTURE_CONTENT=true`.

## Infra

Exemplo:
- `infra/litellm/config.example.yaml`

Para budgets e virtual keys, o LiteLLM precisa de banco próprio.
Não usar tabelas do domínio CRM como storage interno do gateway.
