import { createHash } from "node:crypto"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { buildActionKey, createActionProposal } from "@/lib/server/router/proposals"
import type {
  DealHealthInput,
  DealHealthResult,
  NextActionRecommendation,
} from "./types"
import { assessRevenueRecovery } from "./recovery-assessment"

type SnapshotRow = { id: string }
type NextActionRow = {
  id: string
  action_key: string
  action_proposal_id: string | null
  status: string
}
type RecoveryRow = {
  id: string
  status: string
}

export async function persistDealHealthSnapshot(input: {
  deal: DealHealthInput
  health: DealHealthResult
  fingerprint: string
}) {
  const existing = await supabaseRest<SnapshotRow[]>(
    "GET",
    `/deal_health_snapshots?tenant_id=eq.${encodeURIComponent(input.deal.tenantId)}&deal_id=eq.${encodeURIComponent(input.deal.dealId)}&health_fingerprint=eq.${encodeURIComponent(input.fingerprint)}&select=id&limit=1`,
  )
  if (Array.isArray(existing) && existing[0]) {
    return { id:existing[0].id,created:false }
  }

  const rows = await supabaseRest<SnapshotRow[]>("POST","/deal_health_snapshots",[{
    tenant_id:input.deal.tenantId,
    deal_id:input.deal.dealId,
    score:input.health.score,
    band:input.health.band,
    pipeline_value_cents:input.health.pipelineValueCents,
    exposed_value_cents:input.health.exposedValueCents,
    health_fingerprint:input.fingerprint,
    reasons:input.health.reasons,
    signals:input.health.signals,
    algorithm_version:"deal-health-v1",
    calculated_at:input.deal.now,
  }])
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error("Não foi possível persistir Deal Health.")
  return { id:row.id,created:true }
}

async function expireOldRecommendations(input: {
  tenantId: string
  dealId: string
  keepActionKey?: string | null
}) {
  const rows = await supabaseRest<NextActionRow[]>(
    "GET",
    `/next_action_recommendations?tenant_id=eq.${encodeURIComponent(input.tenantId)}&deal_id=eq.${encodeURIComponent(input.dealId)}&status=in.(active,proposed)&select=id,action_key,action_proposal_id,status&limit=50`,
  )

  for (const row of Array.isArray(rows) ? rows : []) {
    if (input.keepActionKey && row.action_key === input.keepActionKey) continue

    await supabaseRest(
      "PATCH",
      `/next_action_recommendations?id=eq.${encodeURIComponent(row.id)}`,
      { status:"stale",resolved_at:new Date().toISOString(),updated_at:new Date().toISOString() },
    )

    if (row.action_proposal_id) {
      await supabaseRest(
        "PATCH",
        `/action_proposals?id=eq.${encodeURIComponent(row.action_proposal_id)}&status=in.(proposed,awaiting_approval)`,
        { status:"expired",updated_at:new Date().toISOString() },
      ).catch(() => null)
    }
  }
}

export async function persistNextAction(input: {
  deal: DealHealthInput
  health: DealHealthResult
  healthSnapshotId: string
  recommendation: NextActionRecommendation | null
}) {
  const authorized = await supabaseRest<NextActionRow[]>(
    "GET",
    `/next_action_recommendations?tenant_id=eq.${encodeURIComponent(input.deal.tenantId)}&deal_id=eq.${encodeURIComponent(input.deal.dealId)}&status=eq.authorized&select=id,action_key,action_proposal_id,status&limit=1`,
  )
  if (Array.isArray(authorized) && authorized[0]) {
    return { ...authorized[0],created:false }
  }

  if (!input.recommendation) {
    await expireOldRecommendations({
      tenantId:input.deal.tenantId,
      dealId:input.deal.dealId,
    })
    return null
  }

  const payload = {
    ...input.recommendation.payload,
    healthScore:input.health.score,
    healthBand:input.health.band,
  }

  const actionKey = buildActionKey({
    tenantId:input.deal.tenantId,
    actionType:input.recommendation.actionType,
    targetType:"deal",
    targetId:input.deal.dealId,
    payload,
  })

  await expireOldRecommendations({
    tenantId:input.deal.tenantId,
    dealId:input.deal.dealId,
    keepActionKey:actionKey,
  })

  const existing = await supabaseRest<NextActionRow[]>(
    "GET",
    `/next_action_recommendations?tenant_id=eq.${encodeURIComponent(input.deal.tenantId)}&action_key=eq.${encodeURIComponent(actionKey)}&select=id,action_key,action_proposal_id,status&limit=1`,
  )
  if (Array.isArray(existing) && existing[0]) {
    return { ...existing[0],created:false }
  }

  const proposal = await createActionProposal({
    tenantId:input.deal.tenantId,
    actionType:input.recommendation.actionType,
    targetType:"deal",
    targetId:input.deal.dealId,
    recommendation:input.recommendation.reason,
    payload,
    evidence:input.recommendation.evidence,
    missingData:[],
    riskLevel:input.recommendation.riskLevel,
    confidence:input.recommendation.confidence,
    source:"system",
  })

  const rows = await supabaseRest<NextActionRow[]>("POST","/next_action_recommendations",[{
    tenant_id:input.deal.tenantId,
    deal_id:input.deal.dealId,
    contact_id:input.deal.contactId,
    health_snapshot_id:input.healthSnapshotId,
    action_key:actionKey,
    action_type:input.recommendation.actionType,
    title:input.recommendation.title,
    reason:input.recommendation.reason,
    due_at:new Date(Date.parse(input.deal.now) + input.recommendation.dueInMinutes * 60_000).toISOString(),
    confidence:input.recommendation.confidence,
    risk_level:input.recommendation.riskLevel,
    priority:input.recommendation.priority,
    payload,
    evidence:input.recommendation.evidence,
    status:"proposed",
    action_proposal_id:proposal.id,
    proposed_at:input.deal.now,
  }])

  const row = Array.isArray(rows) ? rows[0] ?? null : null
  return row ? { ...row,created:true } : null
}

export async function persistRevenueRecoveryCase(input: {
  deal: DealHealthInput
  health: DealHealthResult
  healthSnapshotId: string
  nextActionId?: string | null
  nextActionStatus?: string | null
  fingerprint: string
}) {
  const assessment = assessRevenueRecovery(input.deal,input.health)

  if (!assessment.eligible || !assessment.reason || !assessment.severity) {
    await supabaseRest(
      "PATCH",
      `/revenue_recovery_cases?tenant_id=eq.${encodeURIComponent(input.deal.tenantId)}&deal_id=eq.${encodeURIComponent(input.deal.dealId)}&status=in.(open,proposed,authorized)`,
      { status:"stale",resolved_at:input.deal.now,updated_at:input.deal.now },
    ).catch(() => null)
    return null
  }

  const reason = assessment.reason
  const recoveryKey = createHash("sha256")
    .update(`deal:${input.deal.dealId}:${reason}`)
    .digest("hex")

  await supabaseRest(
    "PATCH",
    `/revenue_recovery_cases?tenant_id=eq.${encodeURIComponent(input.deal.tenantId)}&deal_id=eq.${encodeURIComponent(input.deal.dealId)}&recovery_key=neq.${encodeURIComponent(recoveryKey)}&status=in.(open,proposed,authorized)`,
    { status:"stale",resolved_at:input.deal.now,updated_at:input.deal.now },
  ).catch(() => null)

  const existing = await supabaseRest<RecoveryRow[]>(
    "GET",
    `/revenue_recovery_cases?tenant_id=eq.${encodeURIComponent(input.deal.tenantId)}&recovery_key=eq.${encodeURIComponent(recoveryKey)}&select=id,status&limit=1`,
  )

  const recoveryStatus = input.nextActionStatus === "authorized"
    ? "authorized"
    : input.nextActionStatus === "executed"
      ? "open"
      : input.nextActionId
        ? "proposed"
        : "open"

  const row = {
    health_snapshot_id:input.healthSnapshotId,
    next_action_id:input.nextActionId || null,
    severity:assessment.severity,
    pipeline_value_cents:assessment.pipelineValueCents,
    exposed_value_cents:assessment.exposedValueCents,
    days_stalled:assessment.daysStalled,
    summary:assessment.summary,
    evidence:input.health.reasons.filter(item => item.points < 0),
    status:recoveryStatus,
    metadata:{
      healthFingerprint:input.fingerprint,
      algorithmVersion:"deal-health-v1",
    },
    updated_at:input.deal.now,
  }

  if (Array.isArray(existing) && existing[0]) {
    await supabaseRest(
      "PATCH",
      `/revenue_recovery_cases?id=eq.${encodeURIComponent(existing[0].id)}`,
      row,
    )
    return { id:existing[0].id,created:false,reason }
  }

  const created = await supabaseRest<Array<{ id: string }>>("POST","/revenue_recovery_cases",[{
    tenant_id:input.deal.tenantId,
    deal_id:input.deal.dealId,
    contact_id:input.deal.contactId,
    recovery_key:recoveryKey,
    reason_code:reason,
    detected_at:input.deal.now,
    ...row,
  }])

  const createdRow = Array.isArray(created) ? created[0] : null
  if (!createdRow) throw new Error("Não foi possível criar caso de Revenue Recovery.")
  return { id:createdRow.id,created:true,reason }
}
