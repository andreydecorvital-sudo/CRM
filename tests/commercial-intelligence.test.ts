import { describe,expect,it } from "vitest"
import { calculateDealHealth, dealHealthFingerprint } from "../src/lib/server/intelligence/deal-health"
import { assessRevenueRecovery } from "../src/lib/server/intelligence/recovery-assessment"
import { intelligenceGoldenScenarios, runGoldenScenarios } from "../src/lib/server/intelligence/scenarios"
import { simulateDeal } from "../src/lib/server/intelligence/simulator"

describe("Commercial Intelligence golden scenarios",() => {
  it("keeps every golden scenario on contract",() => {
    const results = runGoldenScenarios()
    expect(results).toHaveLength(intelligenceGoldenScenarios.length)
    expect(results.filter(item => !item.passed)).toEqual([])
  })

  it("does not expose healthy pipeline as revenue at risk",() => {
    const scenario = intelligenceGoldenScenarios.find(item => item.key === "healthy_momentum")
    expect(scenario).toBeTruthy()

    const result = simulateDeal(scenario!.input)
    expect(result.health.band).toBe("healthy")
    expect(result.health.exposedValueCents).toBe(0)
    expect(result.recovery.eligible).toBe(false)
    expect(result.recovery.exposedValueCents).toBe(0)
  })

  it("prioritizes an awaiting customer over lower-value follow-up work",() => {
    const scenario = intelligenceGoldenScenarios.find(item => item.key === "customer_waiting_sla")
    const result = simulateDeal(scenario!.input)

    expect(result.health.signals.customerWaiting).toBe(true)
    expect(result.health.signals.slaBreached).toBe(true)
    expect(result.nextAction?.title).toBe("Responder cliente agora")
    expect(result.nextAction?.priority).toBe("urgent")
    expect(result.nextAction?.payload.guard).toEqual({ customerWaiting:true })
  })

  it("makes proposal recovery explicit and guarded",() => {
    const scenario = intelligenceGoldenScenarios.find(item => item.key === "proposal_stalled")
    const result = simulateDeal(scenario!.input)

    expect(result.health.reasons.some(reason => reason.code === "proposal_unviewed")).toBe(true)
    expect(result.recovery.reason).toBe("proposal_stalled")
    expect(result.nextAction?.title).toBe("Confirmar recebimento da proposta")
    expect(result.nextAction?.payload.guard).toEqual({ proposalStatus:"sent" })
  })

  it("keeps fingerprints deterministic for the same facts",() => {
    const scenario = intelligenceGoldenScenarios[0]
    const health = calculateDealHealth(scenario.input)

    const one = dealHealthFingerprint({ dealId:scenario.input.dealId,result:health })
    const two = dealHealthFingerprint({ dealId:scenario.input.dealId,result:health })

    expect(one).toBe(two)
    expect(one).toMatch(/^[a-f0-9]{64}$/)
  })

  it("does not call zero-value risk revenue recovery",() => {
    const scenario = intelligenceGoldenScenarios.find(item => item.key === "owner_missing")!
    const input = { ...scenario.input,valueCents:0 }
    const health = calculateDealHealth(input)
    const recovery = assessRevenueRecovery(input,health)

    expect(health.band).toBe("critical")
    expect(recovery.eligible).toBe(false)
    expect(recovery.exposedValueCents).toBe(0)
  })
})
