# Backend capabilities

## Customer 360
- timeline unificada;
- notas internas e fixadas;
- campos customizados tipados;
- preferências por canal;
- first/last touch;
- compras, LTV e recorrência;
- avaliações;
- propostas;
- tarefas;
- score comercial.

## Lead scoring
Regras por evento/campo geram score events idempotentes. O score agregado define `cold / warm / hot` conforme thresholds configuráveis por tenant.

## MIRA Knowledge
A base de conhecimento suporta FAQ, política, produto, processo e scripts. A busca atual usa full-text search em português no Postgres, sem dependência de embeddings ou custo de tokens.

## Automação
O motor é desacoplado do canal:
- eventos de domínio;
- condições JSON;
- ações permitidas;
- cooldown por contato/entidade;
- runs auditáveis;
- fila durável;
- retries;
- dead jobs.

## Integrações
- webhook outbound com HMAC opcional;
- API keys armazenadas apenas como SHA-256;
- scopes por API key;
- secret material fora do banco;
- provider WhatsApp desacoplado.

## Privacidade
Preferência é registrada por contato e canal. Mensagens de marketing/venda são suprimidas quando o contato está opt-out ou transactional-only. Mensagens transacionais e de suporte permanecem separadas conceitualmente.

## Segurança
- RLS em toda tabela pública;
- views com security invoker;
- SECURITY DEFINER com search_path vazio;
- RPCs privilegiados revogados de anon/authenticated;
- CI valida padrões de migrations;
- service role nunca é exposta ao browser.

## Próximo backend
- accounts/empresas B2B;
- importador assíncrono CSV;
- horários comerciais/feriados;
- catálogo de produtos/serviços para propostas;
- cobrança/entitlements por plano;
- WhatsApp session por tenant;
- API pública versionada.
