import { aiChatCompletion } from "@/lib/server/platform/ai/gateway"
import type { PlaybookDefinition } from "./types"
import { validatePlaybook } from "./validator"

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

function extractJson(raw: string) {
  const trimmed = String(raw || "").trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || trimmed
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("IA não retornou JSON de playbook.")
  return JSON.parse(candidate.slice(start,end + 1)) as unknown
}

function forceDraft(value: unknown): PlaybookDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Draft de playbook inválido.")
  }

  const raw = value as Record<string,unknown>
  const definition = {
    key:String(raw.key || "ai-draft")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g,"-")
      .replace(/^-+|-+$/g,"")
      .slice(0,120) || "ai-draft",
    name:String(raw.name || "Playbook sugerido").trim().slice(0,180),
    description:String(raw.description || "Draft gerado a partir de linguagem natural.").trim().slice(0,2000),
    version:1,
    triggerEvent:String(raw.triggerEvent || "").trim(),
    conditions:raw.conditions && typeof raw.conditions === "object"
      ? raw.conditions
      : { all:[] },
    actions:Array.isArray(raw.actions) ? raw.actions.slice(0,20) : [],
    mode:"draft",
    priority:Number.isInteger(Number(raw.priority))
      ? Math.min(Math.max(Math.trunc(Number(raw.priority)),1),1000)
      : 100,
    stopOnMatch:raw.stopOnMatch === true,
    cooldownSeconds:Number.isFinite(Number(raw.cooldownSeconds))
      ? Math.min(Math.max(Math.trunc(Number(raw.cooldownSeconds)),0),2_592_000)
      : 0,
    tags:Array.isArray(raw.tags)
      ? raw.tags.map(item => String(item).trim().slice(0,60)).filter(Boolean).slice(0,20)
      : ["ai-draft"],
  } as PlaybookDefinition

  const validation = validatePlaybook(definition)
  if (!validation.valid) {
    throw new Error("Draft sugerido pela IA falhou na validação: " + validation.errors.join(" "))
  }

  return definition
}

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

export function parsePlaybookDraftFromModelText(raw: string) {
  return forceDraft(extractJson(raw))
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
