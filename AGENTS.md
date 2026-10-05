# CRM — guia rápido para humanos e agentes

Antes de alterar o projeto, leia:

1. `docs/SYSTEM_MAP.md`
2. `docs/ROUTER.md`
3. `docs/TECH_RADAR.md`
4. `docs/PLATFORM_STACK.md`
5. `docs/ARCHITECTURE.md`
6. o documento específico do domínio afetado.

## Regras obrigatórias

- Este CRM é um produto independente. Não adicionar dependência de Argoplace, MIRA ou VitalHub.
- Multi-tenant é obrigatório desde banco até serviço.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` ao browser.
- Toda tabela pública precisa de RLS e grants explícitos.
- Toda função `SECURITY DEFINER` precisa de `search_path = ''` e revogação explícita.
- Efeitos externos resilientes devem passar por outbox/job.
- Não chamar WAHA/Resend diretamente de regra comercial.
- Retry não pode duplicar contato, mensagem, job, automação ou cobrança de uso.
- Consentimento deve ser verificado imediatamente antes de envio promocional.
- QR do WhatsApp é temporário e nunca deve ser persistido.
- Evento sistêmico ou recomendação de IA que proponha write deve passar pelo Governed Action Plane.
- Action Proposal não é autorização; autorização não é execução.
- Adapter é o único owner de uma mutação governada.
- Write governado precisa de post-read verification; `unknown` impede replay cego.
- Não criar um segundo Router/Action OS paralelo.
- Produto não chama Gemini/OpenAI/Claude diretamente; usar `platform/ai/gateway.ts`.
- Chaves reais dos providers de IA não ficam no runtime do produto.
- Analytics não recebe prompt, mensagem, e-mail, telefone ou secrets.
- Prompt/resposta em observabilidade é opt-in; padrão é metadata-only.
- Tecnologia nova precisa passar pelo `docs/TECH_RADAR.md`.
- Mudança estrutural exige atualização do `docs/SYSTEM_MAP.md`.

## Gates

Todo commit relevante deve passar:

`typecheck → lint → migration security check → next build`

Não declarar uma feature pronta se o CI estiver vermelho.
