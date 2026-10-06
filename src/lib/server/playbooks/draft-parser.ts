import type { PlaybookDefinition } from "./types"
import { validatePlaybook } from "./validator"

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

export function parsePlaybookDraftFromModelText(raw: string) {
  return forceDraft(extractJson(raw))
}
