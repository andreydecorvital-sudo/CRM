import { aiChatCompletion } from "@/lib/server/platform/ai/gateway"
import { buildAiPrompt } from "./prompt"
import type { AiCategory } from "./policy"

export async function generateAiReply(input: {
  tenantId: string
  companyName: string
  category: AiCategory
  contactName: string
  history: Array<{ direction: "inbound" | "outbound"; text: string }>
  knowledge?: string
}) {
  const prompt = buildAiPrompt({
    companyName:input.companyName,
    category:input.category,
    contactName:input.contactName,
    history:input.history,
    knowledge:input.knowledge,
  })

  const result = await aiChatCompletion({
    tenantId:input.tenantId,
    feature:"customer-support-draft",
    messages:[
      {
        role:"user",
        content:prompt,
      },
    ],
    temperature:0.25,
    maxTokens:700,
    traceInput:{
      category:input.category,
      historyMessages:input.history.length,
      knowledgeAttached:Boolean(input.knowledge),
    },
  })

  return {
    text:result.content,
    model:result.model,
    usage:result.usage,
    latencyMs:result.latencyMs,
  }
}
