# WhatsApp para uso interno do CRM — implantação controlada

## Estado verificado em 19/10/2026

- A Inbox interna existe na branch `feat/internal-inbox-real-pilot-20261019` (PR #7), com login via Supabase Auth/RLS.
- O CRM possui `whatsapp_connections`, webhook WAHA, rotas de administração de sessão e adaptador de envio. Isso é **código preparado**, não prova de operação ativa.
- O projeto Vercel do CRM **não tem**, até a verificação, `WAHA_BASE_URL`, `WAHA_API_KEY`, `WHATSAPP_WEBHOOK_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY`.
- O projeto Supabase do CRM é `ydyzjpcmavqffdazteib`, mas a conexão Supabase disponível ao agente não autoriza esse projeto. Não ler/escrever dados reais de tenant enquanto isso não for regularizado.
- Há um serviço Railway existente `argoplace-waha` no projeto `argoplace-whatsapp`, usando a imagem `devlikeapro/waha:gows`, com volume persistente e deployment saudável. **Não pertence ao CRM e não deve ser reiniciado, sobrescrito, reutilizado para outro número ou reconfigurado sem verificar sessões/licença e autorizações.** A edição WAHA Core costuma limitar a quantidade de sessões.
- A página `/settings/whatsapp` no PR #7 agora mostra diagnóstico real somente para owner/admin/manager autenticado, sem iniciar, parar ou parear sessões.

## Etapas para habilitar com segurança

1. **Isolamento:** confirmar qual conta de WhatsApp/WhatsApp Business será o canal do CRM e que o titular autoriza o pareamento. Não sequestrar a sessão Argoplace. Confirmar se será uma instância WAHA dedicada ou outro provedor aprovado; custos devem ser aprovados antes de provisionar.
2. **Banco correto:** no projeto Supabase do CRM, verificar migrations e cadastro da empresa em `tenants` e `tenant_members`. Cadastrar uma conexão `whatsapp_connections` para a empresa com `provider='waha'`, `status='disconnected'` e `config.session` exclusivo. Usar admin autenticado, nunca UUID de outra empresa.
3. **Servidor:** configurar `WAHA_BASE_URL` e `WAHA_API_KEY` do serviço destinado ao CRM como secrets server-only na Vercel. Nunca incluir segredo com `NEXT_PUBLIC_`.
4. **Webhook:** configurar `WHATSAPP_WEBHOOK_SECRET` aleatório forte em **ambos** os ambientes que verificam/assinam o webhook. Callback esperado: `https://<DOMINIO-CANONICO-CRM>/api/webhooks/whatsapp/waha?tenant=<UUID_AUTORIZADO>`. Usar o domínio correto do CRM e HTTPS; não escolher URL de preview transitória.
5. **Banco para webhook/worker:** a versão atual de `/api/webhooks/whatsapp/waha` e `waha-admin` ainda chama o PostgREST interno com `SUPABASE_SERVICE_ROLE_KEY`. Essa chave é necessária **no servidor** para esses caminhos até migrarmos o webhook/worker para um serviço com credenciais de privilégio mínimo. **Leitura da Inbox não precisa dessa chave**.
6. **Pareamento:** após aprovar o número, iniciar sessão dedicada pelo fluxo existente `/api/internal/whatsapp/[tenantId]/session`, protegido por `CRM_INTERNAL_SECRET`. Só então obter QR pelo endpoint interno de QR; escanear no aplicativo do número autorizado. A integração ainda não oferece QR direto no painel de operadores.
7. **Verificação:** confirmar status remoto `WORKING`, webhook `session.status`, recebimento de **uma mensagem consentida** e persistência em `contacts`, `conversations`, `messages` da empresa correta. Confirmar que nenhuma empresa vizinha vê esses dados.
8. **Resposta:** não ativar `CRM_OPERATOR_SEND_ENABLED=true` até confirmar fila, worker, idempotência, permissões, consentimento e entrega verificada. A interface pode receber mensagens enquanto o outbound permanece inativo.

## O que o novo painel efetivamente faz

`GET /api/operator/whatsapp` devolve apenas indicadores booleanos de presença das variáveis no servidor e informações não secretas da conexão autorizada pelo JWT/RLS. Nunca retorna chaves, senha, config completo, QR ou segredo do webhook. Status salvo `connected` **não prova** `WORKING` remoto.

A página `/settings/whatsapp` disponibiliza botões de preparo e QR, mas só executa operações quando um administrador autenticado clica explicitamente, após os pré-requisitos de isolamento. Não executa stop/restart/logout nem altera o WAHA do Argoplace. A API de operador limita a consulta a `owner`, `admin` e `manager`.

## Pendências para conclusão

- Permissão ao projeto Supabase do CRM e operador/tenant real;
- Credenciais e instância WhatsApp específica do CRM;
- Provisão de sessão, QR pareado com o telefone autorizado;
- Confirmação do webhook e mensagem de teste;
- Revisão da política de uso/termos do provedor para uso comercial.

**Não declarar o canal conectado apenas porque a Vercel compilou a página.**


## Fluxo de conexão preparado no PR #7

1. Administrador autenticado da empresa abre `/settings/whatsapp` e clica em **Registrar canal da empresa**.
   - API: `POST /api/operator/whatsapp` com `action=prepare`.
   - Migration `202610190001_whatsapp_operator_registration.sql` necessária no Supabase CRM correto. Insere apenas `waha`/disconnected, nome `crm_<uuid-sem-tracos>`, proibindo uso de sessões de outro tenant.
2. Somente após definir credenciais de um **WAHA dedicado** com `CRM_WAHA_DEDICATED_INSTANCE=true`, `WAHA_BASE_URL`, `WAHA_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, pode clicar em **Preparar sessão WAHA**.
   - API: `POST /api/operator/whatsapp/pairing`, com confirmação explícita.
   - Nunca altera/para/reinicia uma sessão existente. Se já existir com proprietário não comprovado, bloqueia.
   - Configura webhook no endereço canônico da Vercel do CRM com segredo enviado somente servidor → WAHA.
3. Clica em **Exibir QR**.
   - API: `GET /api/operator/whatsapp/pairing`, somente owner/admin.
   - QR base64 protegido por autenticação e cabeçalho `Cache-Control: no-store`; sessão precisa estar em `SCAN_QR_CODE`.
   - O pareamento só acontece após o titular escanear no aparelho autorizado.
4. Confere `WORKING` e teste autorizado de inbound no CRM, sem ativar envio até verificação independente.

### Restrições reais

- **Nenhuma migration SQL foi aplicada no Supabase em nome do usuário nesta alteração.** A conexão do Supabase que o agente dispõe não acessa `ydyzjpcmavqffdazteib`; o instalador não pode pular essa etapa.
- **Não foi criada nova instância WAHA.** A Railway existente pertence ao Argoplace e permanece intocada. Novo serviço/custo/licença dependem de aprovação.
- Até a credencial e a instância dedicadas existirem, QR e start falham de maneira segura com erro recuperável.
- Esta mudança fica em branch/PR, não faz merge ou deploy de produção.
