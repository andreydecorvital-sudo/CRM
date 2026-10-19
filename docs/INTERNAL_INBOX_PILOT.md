# CRM — ativação da Inbox interna com Supabase Auth e RLS

## Correção da tela "Atendimento interno ainda não configurado" (19/10/2026)

O piloto anterior exigia `SUPABASE_SERVICE_ROLE_KEY`, `CRM_OPERATOR_TENANT_ID` e `CRM_OPERATOR_SESSION_SECRET` até para abrir a tela de login. Esses requisitos bloqueavam o uso, apesar de a Vercel já ter URL e chave pública do Supabase.

**Novo modelo do PR #7:** a Inbox usa a conta pessoal do operador no Supabase Auth, consulta `tenant_members` por JWT e faz operações normais com o mesmo JWT, respeitando RLS. O sistema descobre as empresas das quais o usuário participa e oferece troca de empresa, sem chave `service_role` para leitura nem segredo próprio para login.

O projeto Vercel `crm` já possui `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, conforme verificação de existência das variáveis em 19/10. URLs pública e de servidor, se ambas configuradas, precisam apontar ao **mesmo** projeto.

## Ambiente

### Necessário para login e leitura/atendimento
- `SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto de **CRM**, e não de outros produtos.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (já existente) ou `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY`.
- Supabase Auth habilitado, pelo menos uma conta real e vínculo em `tenant_members` de uma empresa com status `active` ou `trial`.

**Não são mais exigidos** para a Inbox: `SUPABASE_SERVICE_ROLE_KEY`, `CRM_OPERATOR_TENANT_ID`, `CRM_OPERATOR_SESSION_SECRET`.

### Envio WhatsApp (separado e DESABILITADO por padrão)
- `CRM_OPERATOR_SEND_ENABLED=true` **e** `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente do servidor, após aprovação/homologação, para inserir na outbox, cuja política RLS para operadores autenticados permite apenas SELECT.
- O worker, consentimento, sessão WhatsApp conectada e janela de atendimento precisam ser confirmados antes de tentar.
- Nunca definir `CRM_OPERATOR_SEND_ENABLED=true` só para eliminar o aviso de configuração. Uma mensagem `pending` não garante entrega ao cliente.

## Cadastro inicial no Supabase certo
1. Abrir o projeto de Supabase que corresponde ao domínio salvo no CRM: `ydyzjpcmavqffdazteib`. O conector Supabase atual do agente **não tem acesso** a esse projeto; somente outro projeto aparece. Não executar SQL no projeto não correspondente.
2. Confirmar que as migrations esperadas e as tabelas `tenants`, `tenant_members`, `contacts`, `conversations`, `messages` existem no projeto correto.
3. Em **Authentication → Users**, criar ou convidar a pessoa que vai operar o CRM; concluir a confirmação de e-mail/senha pelo fluxo do Supabase.
4. Em **Table Editor** ou SQL Editor, confirmar/criar o tenant da empresa e cadastrar `tenant_members(tenant_id,user_id,role)` com usuário real e função adequada. Não compartilhar UUID de usuário nem senhas fora do ambiente administrativo.
5. Abrir `/inbox` na prévia, entrar com a conta criada e confirmar que aparecem apenas dados da empresa. Se não há conversas, o estado vazio é esperado, não erro de layout.

## Comportamento e limites

- Cookie HttpOnly/Secure (produção), SameSite Strict, usa **access token emitido pelo Supabase Auth**; nenhuma chave privada fica no navegador.
- Token não é refreshado neste piloto; quando expira (normalmente ~1h, dependendo do projeto), o operador faz login novamente.
- Toda requisição valida o usuário em `/auth/v1/user`, valida `tenant_members` e status do tenant. RLS limita dados no PostgREST.
- O cookie de empresa não é autorização: é apenas seleção; o servidor verifica novamente se o usuário ainda é membro e se a empresa está ativa.
- Login, listagem, histórico, assumir, marcar lida, resolver e reabrir, sujeitos às permissões do operador.
- O frontend oferece estados vazios e de erro honestos; não mostra contatos inventados.
- Login sem autenticação secundária (MFA) e rate-limit adicional é suficiente apenas para um piloto interno restrito; antes de vender o SaaS, revisar políticas de sessão, convite, tenant switching, RBAC, auditabilidade e MFA.

## Validação exigida
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run check:migrations`
- `npm run build`
- Teste com operador membro e operador não membro, troca de empresa e isolamento de dados reais.
- Teste de atendimento humano antes de envio; nenhum WhatsApp ou ação de produção sem aprovação.
