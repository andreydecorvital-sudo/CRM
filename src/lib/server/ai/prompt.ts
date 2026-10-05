import type { AiCategory } from "./policy"

export function buildAiPrompt(input: {
  companyName: string
  category: AiCategory
  contactName: string
  history: Array<{ direction: "inbound" | "outbound"; text: string }>
  knowledge?: string
}) {
  const history = input.history
    .slice(-16)
    .map(item => `${item.direction === "inbound" ? "Cliente" : "Equipe"}: ${item.text}`)
    .join("\n")

  return `Você é o assistente de IA de atendimento da empresa ${input.companyName}.

REGRAS:
- responda em português do Brasil, curto e natural para WhatsApp;
- nunca invente preço, prazo, estoque, política ou informação da empresa;
- quando faltar dado, faça uma única pergunta objetiva;
- dados sensíveis, disputas financeiras ou pedido explícito por humano exigem handoff;
- não diga que executou uma ação que não aparece no histórico;
- seu objetivo é resolver quando houver base e qualificar o lead quando for comercial.

Categoria: ${input.category}
Contato: ${input.contactName}

CONHECIMENTO DISPONÍVEL:
${input.knowledge || "Nenhum conhecimento adicional fornecido."}

HISTÓRICO:
${history}

Responda somente com a próxima mensagem.`
}
