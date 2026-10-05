# Importação assíncrona de contatos

## Objetivo

Importação de contatos não roda inteira dentro de uma request. O CRM faz:

`CSV → staging → rows → jobs em chunks → upsert idempotente → estatísticas`

Isso evita timeout e permite processar arquivos grandes de forma resiliente.

## Limites iniciais

- até 8 MB de CSV
- até 20.000 linhas por importação
- staging em blocos de 250 linhas
- processamento em jobs de 200 linhas

Os limites podem virar entitlements por plano depois.

## Mapeamento

Campos suportados no primeiro contrato:

- `externalId`
- `displayName`
- `phoneE164`
- `email`
- `city`

É obrigatório mapear pelo menos `externalId`, telefone ou e-mail. Quando `externalId` não existe, telefone ou e-mail vira o identificador externo canônico da importação.

## Idempotência

Cada contato usa `tenant_id + external_contact_id` como chave lógica.

Cada job usa dedupe key:

`contact-import:<importId>:<firstRow>-<lastRow>`

Se o worker cair depois do upsert e antes de finalizar a linha, o retry repete o upsert sem duplicar o contato.

## Estados

Importação:

`staging → queued → processing → completed`

Também existem `failed` e `cancelled`.

Linha:

`pending → processing → succeeded/failed`

## Falhas

Falha em uma linha não interrompe o arquivo inteiro. O erro fica em `contact_import_rows.error` e as estatísticas mostram sucesso/falha por importação.

Falha estrutural do staging marca a importação como `failed`.

## Worker

Jobs `contact_import` são processados pelo mesmo worker durável do CRM.

O worker valida `importId`, `firstRow` e `lastRow` antes de executar.
