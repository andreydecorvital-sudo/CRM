import { aiChatCompletion } from "@/lib/server/platform/ai/gateway"
import { validatePlaybook } from "./validator"
import { parsePlaybookDraftFromModelText } from "./draft-parser"

const SUPPORTED_EVENTS = [
  "message.received",
  "message.sent",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "transaction.completed",
  "transaction.refunded",
  "transaction.cancelled",
  "proposal.created",
  "proposal.sent",
  "proposal.viewed",
  "proposal.accepted",
  "review.pending",
  "review.sent",
  "review.responded",
]

function authoringSystemPrompt() {
  return [
    "Você converte uma regra comercial em JSON estruturado para um CRM.",
    "Responda SOMENTE JSON, sem explicação.",
    "",
    "Eventos permitidos:",
    ...SUPPORTED_EVENTS,
    "",
    "Formato obrigatório:",
    "{",
    '  "key":"slug",',
    '  "name":"nome",',
    '  "description":"descrição",',
    '  "triggerEvent":"evento permitido",',
    '  "conditions":{',
    '    "all":[{"path":"payload.campo","op":"eq|neq|gt|gte|lt|lte|contains|exists|in","value":"..."}],',
    '    "any":[]',
    "  },",
    '  "actions":[{"type":"task.create|contact.tag|deal.follow_up|conversation.set_department|message.queue|notification.create","params":{}}],',
    '  "priority":100,',
    '  "stopOnMatch":false,',
    '  "cooldownSeconds":0,',
    '  "tags":["..."]',
    "}",
    "",
    "Raízes permitidas em condition.path:",
    "eventType, aggregateType, aggregateId, contactId, payload, occurredAt.",
    "",
    "Regras:",
    "- Nunca invente outro event type.",
    "- Nunca gere ações fora da lista.",
    "- Para message.queue inclua channel e purpose.",
    "- Nunca assuma consentimento.",
    "- Nunca inclua segredo, token ou credencial.",
    "- Nunca tente ativar o playbook.",
    "- Se a intenção exigir espera futura, represente como task.create/deal.follow_up com dueInMinutes; não invente scheduler.",
    "- Prefira poucas condições e poucas ações.",
    "- Se faltar um identificador de departamento/usuário, não invente UUID; use tarefa em vez de roteamento direto.",
  ].join("\n")
}

export async function draftPlaybookFromText(input: {
  tenantId: string
  instruction: string
}) {
  const instruction = String(input.instruction || "").trim().slice(0,6000)
  if (!instruction) throw new Error("Descrição do playbook obrigatória.")

  const result = await aiChatCompletion({
    tenantId:input.tenantId,
    feature:"playbook-authoring",
    temperature:0.1,
    maxTokens:1800,
    traceInput:{
      instructionLength:instruction.length,
      supportedEvents:SUPPORTED_EVENTS.length,
    },
    messages:[
      {
        role:"system",
        content:authoringSystemPrompt(),
      },
      {
        role:"user",
        content:instruction,
      },
    ],
  })

  const playbook = parsePlaybookDraftFromModelText(result.content)

  return {
    playbook,
    validation:validatePlaybook(playbook),
    model:result.model,
    usage:result.usage,
    latencyMs:result.latencyMs,
  }
}
