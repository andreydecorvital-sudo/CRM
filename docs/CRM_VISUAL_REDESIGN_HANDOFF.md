# CRM SaaS — Redesign incremental e handoff para Claude/GrokBot

## Contexto confirmado (19/10/2026)
- CRM em `andreydecorvital-sudo/CRM`, `main`: Next.js SaaS com backend de contatos, conversas, automações e outbox, porém frontend Inbox baseado em exemplos estáticos.
- Origin PR #26: motor de loops verificáveis, sem componentes visuais específicos do CRM.
- Origin PR #27: política de autorização reutilizável em revisão, não design system visual.
- Nenhum PR de design do Claude foi localizado no CRM nem no Origin no momento desta revisão. O briefing do Claude não equivale a componentes finalizados.
- Orquestra é responsável pela coordenação dos agentes; não criar segundo orquestrador no CRM.

## Primeira fatia de produto
- `src/app/app-shell.tsx`: shell premium com navegação agrupada e menu responsivo; sem mudanças no backend.
- `src/app/inbox/inbox-preview.tsx`: Inbox interativa, responsiva, de três áreas: fila, conversa e contexto do lead.
- `src/app/inbox/page.tsx`: disponibiliza a preview no SaaS; as outras rotas continuam no design legado.
- Busca, filtros, troca de conversa e uso de sugestão no rascunho funcionam localmente.
- As quatro conversas são **dados fictícios declarados**. Não há afirmação de atendimento real, IA ativa, qualificação persistida ou KPI verdadeiro.
- Envio está desabilitado. Nenhum sistema externo, WhatsApp, banco, tenant, consentimento, cobrança ou automação foi alterado.

## Handoff Claude (owner visual)
1. Revisar acessibilidade WCAG AA, teclado, tipografia, responsividade e hierarquia, especialmente 360, 768, 1024 e 1440 px.
2. Consolidar tokens do CRM a partir do trabalho de design aprovado, preservando identidade distinta de Origin/Argoplace.
3. Substituir gradualmente valores hardcoded por tokens e primitives, mantendo a Inbox como guia de qualidade.
4. Não simular números de operações como se fossem dados reais.

## Handoff GrokBot (owner engenharia)
1. Analisar contratos de inbox/tenant, mensagens, departamentos, outbox, rate-limits e takeover humano já existentes.
2. Planejar API autenticada da Inbox sem misturar tenants. Não inferir permissões a partir de estado da interface.
3. Integrar recebimento, atribuição, resposta e recibos verificados em PRs independentes, sem saltar as etapas de consentimento e proteção de replay.
4. Não instalar package privado do Origin na CI pública do CRM sem política de acesso revisada.

## Próximos gates
- CI: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Revisão UX por Claude e testes e2e de navegação.
- Integração autenticada posterior, isolada por tenant, antes de habilitar envio e retirar o rótulo de preview.
- Não fazer merge/deploy/migrações sem aprovação humana.

## Limites
Não existe ligação de execução direta com Claude/GrokBot nesta entrega. Os handoffs estão versionados no GitHub, e cada agente só pode atuar com a conexão/ambiente autorizados que efetivamente possuir.
