import { supabaseRest } from "@/lib/server/supabase/rest"
import { calculateDealHealth, dealHealthFingerprint } from "./deal-health"
import { loadOpenDealHealthInputs } from "./data"
import { recommendNextAction } from "./next-action"
import { captureProductEvent } from "@/lib/server/platform/analytics/posthog"
import {
  persistDealHealthSnapshot,
  persistNextAction,
  persistRevenueRecoveryCase,
} from "./revenue-recovery"

async function emitEvent(input: {
  tenantId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  contactId: string
  payload: Record<string, unknown>
  dedupeKey: string
}) {
  return supabaseRest<string>("POST","/rpc/crm_emit_event",{
    p_tenant_id:input.tenantId,
    p_event_type:input.eventType,
    p_aggregate_type:input.aggregateType,
    p_aggregate_id:input.aggregateId,
    p_contact_id:input.contactId,
    p_payload:input.payload,
    p_dedupe_key:input.dedupeKey,
  })
}

export async function scanCommercialIntelligence(input: {
  tenantId: string
  dealId?: string | null
  contactId?: string | null
  limit?: number
  now?: string
}) {
  const now = input.now || new Date().toISOString()
  const deals = await loadOpenDealHealthInputs({
    tenantId:input.tenantId,
    dealId:input.dealId || null,
    contactId:input.contactId || null,
    limit:input.limit ?? 250,
    now,
  })

  let snapshotsCreated = 0
  let recommendationsCreated = 0
  let recoveryCasesCreated = 0
  let exposedValueCents = 0
  let criticalDeals = 0
  let atRiskDeals = 0

  const results: Array<Record<string, unknown>> = []

  for (const deal of deals) {
    const health = calculateDealHealth(deal)
    const fingerprint = dealHealthFingerprint({ dealId:deal.dealId,result:health })
    const snapshot = await persistDealHealthSnapshot({ deal,health,fingerprint })
    if (snapshot.created) snapshotsCreated += 1

    const recommendation = recommendNextAction(deal,health)
    const nextAction = await persistNextAction({
      deal,
      health,
      healthSnapshotId:snapshot.id,
      recommendation,
    })
    if (nextAction?.created) {
      recommendationsCreated += 1
    }

    const recovery = await persistRevenueRecoveryCase({
      deal,
      health,
      healthSnapshotId:snapshot.id,
      nextActionId:nextAction && "id" in nextAction ? String(nextAction.id) : null,
      nextActionStatus:nextAction && "status" in nextAction ? String(nextAction.status) : null,
      fingerprint,
    })

    if (recovery?.created) recoveryCasesCreated += 1
    exposedValueCents += health.exposedValueCents
    if (health.band === "critical") criticalDeals += 1
    if (health.band === "at_risk") atRiskDeals += 1

    if (snapshot.created) {
      await emitEvent({
        tenantId:deal.tenantId,
        eventType:"deal.health.updated",
        aggregateType:"deal",
        aggregateId:deal.dealId,
        contactId:deal.contactId,
        payload:{
          score:health.score,
          band:health.band,
          pipelineValueCents:health.pipelineValueCents,
          exposedValueCents:health.exposedValueCents,
          reasons:health.reasons.map(reason => ({
            code:reason.code,
            points:reason.points,
          })),
          algorithmVersion:"deal-health-v1",
        },
        dedupeKey:`deal-health:${deal.dealId}:${fingerprint}`,
      }).catch(() => null)
    }

    if (nextAction?.created && "action_key" in nextAction) {
      await emitEvent({
        tenantId:deal.tenantId,
        eventType:"next_action.proposed",
        aggregateType:"deal",
        aggregateId:deal.dealId,
        contactId:deal.contactId,
        payload:{
          nextActionId:"id" in nextAction ? nextAction.id : null,
          actionKey:nextAction.action_key,
          healthScore:health.score,
          healthBand:health.band,
        },
        dedupeKey:`next-action:${nextAction.action_key}`,
      }).catch(() => null)
    }

    if (recovery && health.exposedValueCents > 0) {
      await emitEvent({
        tenantId:deal.tenantId,
        eventType:"revenue.recovery.detected",
        aggregateType:"deal",
        aggregateId:deal.dealId,
        contactId:deal.contactId,
        payload:{
          recoveryCaseId:recovery.id,
          reason:recovery.reason,
          severity:health.band,
          exposedValueCents:health.exposedValueCents,
          healthScore:health.score,
        },
        dedupeKey:`recovery:${recovery.id}:${fingerprint}`,
      }).catch(() => null)
    }

    results.push({
      dealId:deal.dealId,
      title:deal.title,
      score:health.score,
      band:health.band,
      valueCents:deal.valueCents,
      exposedValueCents:health.exposedValueCents,
      nextAction:recommendation ? {
        type:recommendation.actionType,
        title:recommendation.title,
        priority:recommendation.priority,
        confidence:recommendation.confidence,
      } : null,
      recoveryCaseId:recovery?.id || null,
    })
  }

  await captureProductEvent({
    tenantId:input.tenantId,
    distinctId:`tenant:${input.tenantId}`,
    event:"commercial intelligence scanned",
    properties:{
      scanned_deals:deals.length,
      critical_deals:criticalDeals,
      at_risk_deals:atRiskDeals,
      exposed_value_cents:exposedValueCents,
      recommendations_created:recommendationsCreated,
      recovery_cases_created:recoveryCasesCreated,
    },
  }).catch(() => null)

  return {
    scannedDeals:deals.length,
    snapshotsCreated,
    recommendationsCreated,
    recoveryCasesCreated,
    criticalDeals,
    atRiskDeals,
    exposedValueCents,
    calculatedAt:now,
    results,
  }
}
