import { supabaseRest } from "@/lib/server/supabase/rest"
import type { ActionProposal } from "./contracts"
import { getActionProposal } from "./proposals"

const AUTO_ALLOWLIST = new Set([
  "task.create",
  "contact.tag",
  "deal.follow_up",
])

export function evaluatePolicyAuthorization(proposal: ActionProposal) {
  const reasons: string[] = []
  if (proposal.status !== "awaiting_approval" && proposal.status !== "proposed") {
    reasons.push(`status:${proposal.status}`)
  }
  if (!proposal.proposal_only) reasons.push("proposal-only-cleared-outside-authorization")
  if (proposal.risk_level !== "low") reasons.push(`risk:${proposal.risk_level}`)
  if (proposal.confidence < 0.9) reasons.push("confidence-below-0.90")
  if (proposal.missing_data.length) reasons.push("missing-data")
  if (!AUTO_ALLOWLIST.has(proposal.action_type)) reasons.push("action-not-auto-allowlisted")

  return {
    allowed: reasons.length === 0,
    reasons,
  }
}

export async function decideActionProposal(input: {
  tenantId: string
  proposalId: string
  decision: "authorize" | "reject"
  source: "policy" | "human"
  actorUserId?: string | null
  reason?: string | null
}) {
  if (input.source === "policy" && input.decision === "authorize") {
    const proposal = await getActionProposal(input.tenantId,input.proposalId)
    if (!proposal) throw new Error("Action Proposal não encontrada.")
    const policy = evaluatePolicyAuthorization(proposal)
    if (!policy.allowed) {
      throw new Error(`Autorização por política bloqueada: ${policy.reasons.join(", ")}`)
    }
  }

  return supabaseRest<Record<string, unknown>>("POST","/rpc/crm_decide_action_proposal",{
    p_tenant_id: input.tenantId,
    p_proposal_id: input.proposalId,
    p_decision: input.decision,
    p_source: input.source,
    p_actor_user_id: input.actorUserId || null,
    p_reason: input.reason || null,
  })
}
