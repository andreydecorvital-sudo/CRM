# Oportunidades

## Tese

“Oportunidade” é uma finalidade própria de comunicação. Não é sinônimo de marketing.

O contato decide:

- se quer receber;
- por quais canais;
- frequência;
- tópicos/interesses no futuro.

## Dados

`contact_opportunity_preferences` guarda:

- enabled;
- channels;
- topics;
- frequency;
- max_per_week;
- consent source/text/version;
- captured_at/revoked_at;
- public token.

## Enforcement

Existem duas barreiras:

1. trigger do banco em `outbound_messages`;
2. checagem server-side imediatamente antes do provider.

Uma revogação de última hora bloqueia a mensagem que ainda estiver na fila.

## Limite

`max_per_week` evita excesso de disparos. O serviço `queueOpportunity` consulta o histórico recente antes de criar novas mensagens.

## Multi-canal

Uma oportunidade pode ser enviada por WhatsApp, e-mail ou ambos, desde que:

- o cliente tenha autorizado o canal;
- exista destino válido;
- exista conteúdo válido para o canal.

## Comandos no WhatsApp

- `ATIVAR OPORTUNIDADES`
- `PARAR OPORTUNIDADES`

Esses comandos funcionam fora do cadastro também.
