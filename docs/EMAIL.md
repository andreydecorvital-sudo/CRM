# E-mail

## Arquitetura

E-mail usa o mesmo `outbound_messages` do WhatsApp.

O domínio não chama provider diretamente:

`regra/serviço → outbox → worker → provider de e-mail`

O primeiro adapter implementado é Resend, mas o contrato é provider-neutral.

## Por tenant

`email_connections` contém:

- provider;
- status;
- remetente;
- nome do remetente;
- reply-to;
- `secret_ref`;
- config.

A API key não é salva no banco. `secret_ref` aponta para o nome de uma variável de ambiente.

## Fallback global

Desabilitado por padrão.

Para piloto controlado:

```
EMAIL_ALLOW_GLOBAL_FALLBACK=true
RESEND_API_KEY=
EMAIL_FROM_EMAIL=
EMAIL_FROM_NAME=
EMAIL_REPLY_TO=
```

## Tipos de envio

O outbox suporta:

- transactional;
- support;
- sales;
- marketing;
- opportunity.

E-mail exige assunto. HTML é opcional; texto puro continua obrigatório.

## Consentimento

Antes do provider, o worker faz nova checagem de consentimento.

Isso cobre o caso em que uma mensagem entrou na fila e o cliente revogou a permissão antes do envio.

Regras:

- transactional/support: permitidos;
- sales: bloqueados em opt-out/transactional-only;
- marketing: exige opt-in do canal;
- opportunity: exige preferência de oportunidades ativa e o canal selecionado.

## Resend

O adapter usa `POST https://api.resend.com/emails` com Bearer token e funciona em runtime server-side/Vercel.
