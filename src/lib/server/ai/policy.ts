export type AiDisposition = "reply" | "handoff" | "skip"
export type AiPriority = "low" | "normal" | "high" | "urgent"
export type AiCategory = "sales" | "support" | "billing" | "question" | "feedback" | "other"

const SENSITIVE = /\b(senha|password|token|api key|chave de api|2fa|certificado|cart[aã]o|cvv)\b/i
const HUMAN_REQUEST = /\b(falar com (?:uma pessoa|humano|atendente|vendedor)|atendente humano|quero um vendedor)\b/i
const MONEY_DISPUTE = /\b(estorno|chargeback|contesta[cç][aã]o|fraude|cobran[cç]a indevida)\b/i
const URGENT = /\b(urgente|agora|parou|fora do ar|n[aã]o funciona|bloquead[oa])\b/i

export function classifyMessage(text: string): { category: AiCategory; priority: AiPriority } {
  const value = text.trim()
  const category: AiCategory = /\b(pre[cç]o|or[cç]amento|comprar|desconto|produto|proposta)\b/i.test(value)
    ? "sales"
    : /\b(pagamento|boleto|pix|fatura|cobran[cç]a)\b/i.test(value)
      ? "billing"
      : /\b(erro|problema|falha|n[aã]o consigo|suporte)\b/i.test(value)
        ? "support"
        : /\b(sugest[aã]o|ideia|feedback|melhorar)\b/i.test(value)
          ? "feedback"
          : value.includes("?") ? "question" : "other"

  const priority: AiPriority = URGENT.test(value) ? "high" : "normal"
  return { category, priority }
}

export function decideAi(input: { text: string; priority?: AiPriority; aiMode?: "off" | "assist" | "auto" }): { disposition: AiDisposition; reason: string } {
  const text = input.text.trim()
  if (!text) return { disposition: "skip", reason: "empty-message" }
  if (input.aiMode === "off") return { disposition: "handoff", reason: "ai-disabled" }
  if (SENSITIVE.test(text)) return { disposition: "handoff", reason: "sensitive-data" }
  if (HUMAN_REQUEST.test(text)) return { disposition: "handoff", reason: "human-requested" }
  if (MONEY_DISPUTE.test(text)) return { disposition: "handoff", reason: "financial-dispute" }
  if (input.priority === "urgent") return { disposition: "handoff", reason: "urgent" }
  return { disposition: "reply", reason: input.aiMode === "auto" ? "auto-safe" : "assist-safe" }
}
