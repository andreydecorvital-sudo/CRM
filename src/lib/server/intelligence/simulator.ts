import { calculateDealHealth, dealHealthFingerprint } from "./deal-health"
import { recommendNextAction } from "./next-action"
import { assessRevenueRecovery } from "./recovery-assessment"
import type { DealHealthInput } from "./types"
import { policyForDomainEvent } from "../router/policy"
import type { RouterDomainEvent } from "../router/contracts"

export type DealSimulationResult = {
  health: ReturnType<typeof calculateDealHealth>
  fingerprint: string
  recovery: ReturnType<typeof assessRevenueRecovery>
  nextAction: ReturnType<typeof recommendNextAction>
}

export function simulateDeal(input: DealHealthInput): DealSimulationResult {
  const health = calculateDealHealth(input)
  return {
    health,
    fingerprint:dealHealthFingerprint({ dealId:input.dealId,result:health }),
    recovery:assessRevenueRecovery(input,health),
    nextAction:recommendNextAction(input,health),
  }
}

function fakeEvent(eventType: string,index: number): RouterDomainEvent {
  return {
    id:`simulation-event-${index + 1}`,
    tenant_id:"simulation",
    event_type:eventType,
    aggregate_type:"simulation",
    aggregate_id:null,
    contact_id:null,
    payload:{ simulation:true },
    occurred_at:"2026-10-05T18:00:00.000Z",
    created_at:"2026-10-05T18:00:00.000Z",
  }
}

export function simulateRouter(eventTypes: string[]) {
  return eventTypes
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .slice(0,100)
    .map((eventType,index) => ({
      eventType,
      policy:policyForDomainEvent(fakeEvent(eventType,index)),
    }))
}
