# Cadastro de cliente pelo WhatsApp

## Objetivo

O CRM pode cadastrar o cliente dentro da própria conversa, sem formulário separado.

Fluxo base:

`primeira mensagem → cadastro → nome/e-mail/cidade → escolha de oportunidades → conclusão`

A feature nasce desligada por tenant e é configurada em `customer_registration_settings`.

## Modos de início

- `new_contact`: inicia somente no primeiro contato novo.
- `keyword`: inicia quando o cliente usa uma palavra configurada, como “cadastro”.
- `manual`: só começa quando o backend/atendente chama o serviço explicitamente.

## Campos iniciais

O tenant escolhe se quer coletar:

- nome;
- e-mail;
- cidade;
- preferência para receber oportunidades.

E-mail pode ser obrigatório ou opcional.

Se o cliente responder `PULAR` em campo opcional, o fluxo avança sem entrar em loop.

## Sessões

`contact_registration_sessions` mantém:

- contato;
- conversa;
- etapa atual;
- tentativas;
- dados coletados;
- status;
- início/fim.

Existe somente uma sessão ativa por contato/tenant.

## Oportunidades

Na etapa final o cliente pode responder SIM ou NÃO.

SIM:
- cria/atualiza `contact_opportunity_preferences`;
- grava fonte e texto de consentimento;
- habilita apenas os canais escolhidos/configurados.

NÃO:
- mantém suporte/transacional funcionando;
- bloqueia apenas o propósito `opportunity`.

O cliente pode mudar depois pelo próprio WhatsApp:

- `ATIVAR OPORTUNIDADES`
- `PARAR OPORTUNIDADES`

Também existe endpoint público por token para um futuro centro de preferências:

`GET/POST /api/public/preferences/[token]`

## Segurança operacional

Perguntas de cadastro entram no outbox como `support`, portanto não dependem de consentimento promocional.

O consentimento de oportunidades é separado de marketing genérico. Isso evita tratar “quero oportunidades” como autorização irrestrita para qualquer campanha.
