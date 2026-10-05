# Privacidade e direitos do titular

O CRM trata privacidade como workflow operacional, não como um botão de exclusão irreversível.

## Preferências de canal

`contact_channel_preferences` registra por contato e canal:

- unknown
- opted_in
- opted_out
- transactional_only

O motor de outbound consulta essa preferência antes do provider. Mensagens de sales/marketing são suprimidas para opt-out e transactional-only.

## Solicitações

`privacy_requests` suporta:

- access
- export
- correction
- deletion

Status:

`requested → reviewing → processing → ready/completed`

Também existem `rejected` e `cancelled`.

## Inventário

`crm_contact_privacy_inventory` retorna o tamanho do footprint do contato:

- mensagens
- conversas
- deals
- transações
- propostas
- avaliações
- tarefas
- presença de histórico financeiro

Isso permite revisar retenção legal/operacional antes de excluir dados.

## Exportação

`crm_export_contact_data` monta um snapshot JSON com:

- contato
- empresas vinculadas
- notas
- tags
- preferências
- atribuição
- conversas/mensagens
- deals
- tarefas
- propostas
- compras/transações
- avaliações

A função é server-only e restrita ao service role.

## Exclusão

A exclusão definitiva ainda NÃO é automatizada propositalmente.

Motivo: algumas empresas podem precisar reter documentos financeiros/fiscais ou evidências operacionais. O workflow primeiro inventaria o footprint, exige decisão humana/política e só depois executará anonimização/exclusão conforme a regra do tenant.

Isso evita destruir dados que precisem de retenção.
