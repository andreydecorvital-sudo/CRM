import { createHash } from "node:crypto"
import { supabaseRest } from "@/lib/server/supabase/rest"
import type {
  ActionProposal,
  ActionRisk,
} from "./contracts"

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`
}

export function buildActionKey(input: {
  tenantId: string
  dispatchId?: string | null
  actionType: string
  targetType: string
  targetId?: string | null
  payload?: Record<string, unknown>
}) {
  return createHash("sha256")
    .update(stable({
      tenantId: input.tenantId,
      dispatchId: input.dispatchId || null,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId || null,
      payload: input.payload ?? {},
    }))
    .digest("hex")
}

export async function createActionProposal(input: {
  tenantId: string
  dispatchId?: string | null
  actionType: string
  targetType: string
  targetId?: string | null
  recommendation: string
  payload?: Record<string, unknown>
  evidence?: unknown[]
  missingData?: string[]
  riskLevel?: ActionRisk
  confidence?: number
  source?: "router" | "ai" | "human" | "system"
  expiresAt?: string | null
  createdBy?: string | null
}) {
  const actionType = String(input.actionType || "").trim().slice(0,120)
  const targetType = String(input.targetType || "").trim().slice(0,80)
  const recommendation = String(input.recommendation || "").trim().slice(0,4000)
  if (!actionType || !targetType || !recommendation) {
    throw new Error("Action Proposal exige actionType, targetType e recommendation.")
  }

  const confidence = Math.min(Math.max(Number(input.confidence ?? 0),0),1)
  const actionKey = buildActionKey({
    tenantId: input.tenantId,
    dispatchId: input.dispatchId,
    actionType,
    targetType,
    targetId: input.targetId,
    payload: input.payload,
  })

  const existing = await supabaseRest<ActionProposal[]>(
    "GET",
    `/action_proposals?tenant_id=eq.${encodeURIComponent(input.tenantId)}&action_key=eq.${encodeURIComponent(actionKey)}&select=*&limit=1`,
  )
  if (Array.isArray(existing) && existing[0]) return existing[0]

  const rows = await supabaseRest<ActionProposal[]>("POST","/action_proposals",[{
    tenant_id: input.tenantId,
    dispatch_id: input.dispatchId || null,
    action_key: actionKey,
    action_type: actionType,
    target_type: targetType,
    target_id: input.targetId || null,
    recommendation,
    payload: input.payload ?? {},
    evidence: input.evidence ?? [],
    missing_data: [...new Set((input.missingData ?? []).map(value => String(value).trim()).filter(Boolean))],
    risk_level: input.riskLevel ?? "medium",
    confidence,
    source: input.source ?? "router",
    proposal_only: true,
    status: "awaiting_approval",
    expires_at: input.expiresAt || null,
    created_by: input.createdBy || null,
  }])

  const created = Array.isArray(rows) ? rows[0] : null
  if (!created) throw new Error("Não foi possível criar Action Proposal.")
  return created
}

export async function getActionProposal(tenantId: string, proposalId: string) {
  const rows = await supabaseRest<ActionProposal[]>(
    "GET",
    `/action_proposals?id=eq.${encodeURIComponent(proposalId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}
