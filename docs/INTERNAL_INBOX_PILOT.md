# CRM — Piloto interno de atendimento (sem dados fictícios)

## O que esta entrega faz

- `/inbox` passou a ser um ambiente operacional independente do shell demonstrativo.
- Login por e-mail/senha **do Supabase Auth**, autenticação validada no servidor.
- Cookie assinado HMAC SHA-256, `HttpOnly`, `SameSite=Strict`, sessão máxima de 8 horas.
- Usuário só entra se possuir `tenant_members` no tenant **fixado no ambiente** do piloto; papel `viewer` não pode autenticar.
- A cada requisição, a associação ao tenant é revalidada no servidor.
- Consultas de conversas, contatos, departamentos, mensagens e fila de saída explicitamente filtradas por `tenant_id`.
- Ações: assumir (desativa `ai_mode`), liberar, marcar lida, resolver e reabrir.
- Resposta humana vai **somente à fila `outbound_messages` existente**, não diretamente à API do WhatsApp, e apenas quando `CRM_OPERATOR_SEND_ENABLED=true`, o operador assumiu, a conversa está aberta, a sessão WhatsApp está conectada e o último inbound é recente.
- Nenhum mock ou métrica inventada na Inbox.

**Não é um onboarding SaaS público.** Este recorte exige um tenant e operadores pré-cadastrados, antes de permitir novas empresas, cobrança ou autoatendimento.

## Configuração no projeto Vercel CRM

Variáveis **somente no servidor**:

| Variável | Uso |
|---|---|
| `SUPABASE_URL` | URL do Supabase **do CRM**, não do Argoplace |
| `SUPABASE_SERVICE_ROLE_KEY` | REST interno, nunca no cliente |
| `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY` | `/auth/v1/token` para verificar email/senha |
| `CRM_OPERATOR_TENANT_ID` | UUID do tenant de piloto interno |
| `CRM_OPERATOR_SESSION_SECRET` | segredo randômico com **32+ caracteres**, não reutilizar de outros serviços |
| `CRM_OPERATOR_SEND_ENABLED` | `false` por padrão; só ativar depois de validar WhatsApp, domínio e autorização |

As variáveis devem ser inseridas em **Vercel → Projeto crm → Environment Variables**, somente no(s) ambiente(s) escolhidos. Nunca enviar secret ao GitHub, ao navegador ou ao chat. A URL do banco e a chave pública podem existir com outros nomes: use a alternativa aceita pelo código ou adicione alias sem divulgar valores.

### Passos de ativação

1. Confirmar o projeto Supabase correto e suas nove migrations, sem reaplicá-las às cegas.
2. Configurar a service-role **somente no servidor** e validar que todas as tabelas esperadas existem.
3. Criar o primeiro tenant no banco e um usuário no Supabase Auth com email verificado; vincular o UUID desse usuário em `tenant_members` com papel `owner`, `admin`, `manager` ou `agent`.
4. Configurar `CRM_OPERATOR_TENANT_ID` do mesmo tenant e `CRM_OPERATOR_SESSION_SECRET` longo e aleatório.
5. Fazer deploy apenas de **preview** inicialmente; acessar `/inbox` e efetuar login. A Inbox deve listar dados reais do tenant ou exibir estado vazio sem inventar conteúdo.
6. Conferir isolamento multiempresa (usuário fora do tenant → não autentica), takeover, histórico, estados e erros de conexão.
7. Configurar sessão WAHA no tenant, webhook e worker existentes; somente após aprovação específica, habilitar `CRM_OPERATOR_SEND_ENABLED=true` e testar 1 mensagem autorizada.
8. Validar chegada/recibo na origem. Não confundir fila `pending` com entrega `sent`. Em caso de resultado incerto, não reprocessar automaticamente.

### Segurança e limites do piloto

- Não usar senha compartilhada, conta de serviço como operador ou segredo no frontend.
- Sessões HMAC têm expiração de 8h, mas não fornecem revogação instantânea por dispositivo; mudar `CRM_OPERATOR_SESSION_SECRET` revoga todas. Revogação da associação `tenant_members` é verificada a cada chamada.
- O login usa os limites do Supabase Auth; antes de abrir a clientes, adicionar rate limiting/WAF por IP e políticas de sessão mais avançadas.
- Requests mutantes exigem Origin idêntico ao host requisitado. `SameSite=Strict` reduz CSRF.
- `SUPABASE_SERVICE_ROLE_KEY` tem alto privilégio. Toda consulta do piloto filtra tenant; antes de disponibilizar múltiplas empresas, migrar para auth/RLS sob sessão do usuário e revisar escopos.
- Histórico é limitado a 150 mensagens mais recentes, sem paginação anterior nesta fase. Lista mostra até 80 conversas.
- A política de WhatsApp/Meta, 24h, modelos aprovados, opt-in e suporte do provedor precisam ser testados no ambiente real.
- Outros módulos antigos (`/crm`, `/tasks` etc.) ainda podem conter dados fictícios; **esta entrega operacional é `/inbox`**.
- Não existe garantia de funcionamento real antes da configuração do banco, login, worker e WhatsApp e de um teste ponta a ponta.

## Responsabilidade entre agentes
- **Claude:** pode refinar tipografia, responsividade e estados visuais sem alterar contratos de autenticação e envio.
- **GrokBot:** validar infraestrutura, testar Supabase/worker/WAHA em piloto e fechar gaps de entrega, sem outro motor de orquestração.
- **Origin:** consultar componentes reutilizáveis comprovados, não copiar chaves nem instalar pacote privado na CI pública.
- **Orquestra:** coordenação dos agentes em paralelo. Nada da Orquestra é requisito de runtime do CRM.

## Checklist antes de produção
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, CI no SHA exato, teste cross-tenant real, teste de login, teste de envio com operador autorizado e aprovação humana para deploy/ativação.
