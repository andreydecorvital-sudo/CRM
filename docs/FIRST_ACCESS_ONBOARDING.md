# Primeiro acesso ao CRM — cadastro sem administrador pré-criado

O CRM é um SaaS: o primeiro usuário não deve receber uma tela que exige credenciais inexistentes.

## Fluxo na prévia

1. Acessar `/inbox` ou `/settings/whatsapp`.
2. Escolher **Criar minha conta**, informar e-mail válido e criar uma senha com 12+ caracteres. O CRM usa `POST /api/operator/onboarding` e o cadastro do Supabase Auth. Não há senha compartilhada.
3. Se o Supabase exigir confirmação, confirmar o e-mail recebido e voltar ao CRM. Caso o redirecionamento do e-mail esteja fora do domínio, configurar no Supabase Auth > URL Configuration o Site URL e os Redirect URLs do CRM. O e-mail pode apontar para a página externa padrão do projeto; confirmar e voltar ao CRM para entrar.
4. Escolher **Já tenho conta**, fazer login; o CRM reconhece um usuário válido ainda sem empresa e apresenta **Configure sua empresa**.
5. Digitar nome da empresa: chamada a `public.crm_create_first_workspace(p_name)` autenticada pelo JWT do usuário; o banco cria tenant `trial` com slug aleatório e adiciona o próprio usuário como `owner`, em uma única transação com lock por usuário.
6. O CRM confirma `tenant_members` após o RPC e direciona para Inbox. O WhatsApp continua opcional, com conexão separada.

## Pré-requisito NÃO aplicado pela ferramenta nesta sessão

A migration `supabase/migrations/202610190002_first_workspace_onboarding.sql` precisa estar no banco Supabase **ydyzjpcmavqffdazteib** antes de a etapa 5 funcionar. A conexão Supabase atual do ChatGPT **não possui permissão sobre esse projeto**; não aplicar no outro banco disponível.

Confirmar também todas as migrations base do CRM, e que os provedores de e-mail/senha e envio de confirmação estão funcionando.

## Segurança

- RPC restrito a `authenticated`, `REVOKE ... FROM anon`, `SECURITY DEFINER SET search_path=''`.
- O banco verifica `auth.uid()` e `auth.users.email_confirmed_at` antes de inserir tenant.
- Lock serializa pedidos do mesmo usuário, de modo que o mesmo usuário não cria múltiplos workspaces na corrida.
- O navegador não recebe `service_role` ou acesso a outras empresas; consultas da Inbox continuam com JWT + RLS.
- O serviço de cadastro de usuários fica sujeito aos controles antiabuso e limites do Supabase Auth; antes de abrir o SaaS publicamente, revisar captchas, SMTP, domínios autorizados, quotas e planos comerciais.
- Criação de workspace não ativa WhatsApp, não envia mensagens e não muda produção.

## Validar antes de promover

1. Build/CI no SHA da implementação.
2. Teste de cadastro com e-mail novo e confirmado.
3. Primeiro login sem tenant redireciona à criação da empresa.
4. Criação da empresa gera exatamente 1 owner e não permite leitura cruzada.
5. Repetir criação da mesma conta não gera outro tenant.
6. Operador já pertencente a uma empresa continua fazendo login normal.

Não afirmar "primeiro acesso operacional concluído" sem teste com Supabase do CRM real.
