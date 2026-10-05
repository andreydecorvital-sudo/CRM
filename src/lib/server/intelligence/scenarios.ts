import type { DealHealthInput } from "./types"
import { simulateDeal } from "./simulator"

const NOW = "2026-10-05T18:00:00.000Z"

function base(overrides: Partial<DealHealthInput> = {}): DealHealthInput {
  return {
    dealId:"11111111-1111-4111-8111-111111111111",
    tenantId:"22222222-2222-4222-8222-222222222222",
    contactId:"33333333-3333-4333-8333-333333333333",
    title:"Oportunidade simulada",
    valueCents:1_000_000,
    ownerUserId:"44444444-4444-4444-8444-444444444444",
    nextFollowupAt:"2026-10-06T18:00:00.000Z",
    createdAt:"2026-09-28T18:00:00.000Z",
    updatedAt:"2026-10-05T17:00:00.000Z",
    stageEnteredAt:"2026-10-04T18:00:00.000Z",
    stageMedianDurationSeconds:432_000,
    stagePassages:20,
    conversation:{
      id:"55555555-5555-4555-8555-555555555555",
      status:"open",
      lastMessageAt:"2026-10-05T17:00:00.000Z",
      lastInboundAt:"2026-10-05T06:00:00.000Z",
      lastOutboundAt:"2026-10-05T17:00:00.000Z",
      slaFirstResponseDueAt:null,
      slaResolutionDueAt:null,
      firstResponseAt:"2026-10-05T17:00:00.000Z",
    },
    proposal:{
      id:"66666666-6666-4666-8666-666666666666",
      status:"viewed",
      totalCents:1_000_000,
      sentAt:"2026-10-04T12:00:00.000Z",
      viewedAt:"2026-10-05T06:00:00.000Z",
      updatedAt:"2026-10-05T06:00:00.000Z",
    },
    openTasks:[],
    now:NOW,
    ...overrides,
  }
}

export const intelligenceGoldenScenarios = [
  {
    key:"healthy_momentum",
    description:"Deal com owner, follow-up, atividade recente, proposta vista e velocidade saudável.",
    input:base(),
    expected:{
      band:"healthy",
      recoveryEligible:false,
      nextAction:null,
    },
  },
  {
    key:"customer_waiting_sla",
    description:"Cliente aguarda resposta e SLA de resolução já venceu.",
    input:base({
      dealId:"11111111-1111-4111-8111-111111111112",
      title:"Cliente aguardando retorno",
      valueCents:2_500_000,
      stageEnteredAt:"2026-09-25T18:00:00.000Z",
      stageMedianDurationSeconds:432_000,
      conversation:{
        id:"55555555-5555-4555-8555-555555555556",
        status:"open",
        lastMessageAt:"2026-10-05T16:00:00.000Z",
        lastInboundAt:"2026-10-05T16:00:00.000Z",
        lastOutboundAt:"2026-10-04T18:00:00.000Z",
        slaFirstResponseDueAt:null,
        slaResolutionDueAt:"2026-10-05T17:00:00.000Z",
        firstResponseAt:"2026-10-04T18:00:00.000Z",
      },
      proposal:null,
    }),
    expected:{
      band:"at_risk",
      recoveryEligible:true,
      nextAction:"Responder cliente agora",
    },
  },
  {
    key:"proposal_stalled",
    description:"Proposta antiga sem visualização, sem próximo follow-up e estágio lento.",
    input:base({
      dealId:"11111111-1111-4111-8111-111111111113",
      title:"Proposta parada",
      valueCents:4_800_000,
      nextFollowupAt:null,
      updatedAt:"2026-10-04T18:00:00.000Z",
      stageEnteredAt:"2026-09-25T18:00:00.000Z",
      stageMedianDurationSeconds:432_000,
      proposal:{
        id:"66666666-6666-4666-8666-666666666667",
        status:"sent",
        totalCents:4_800_000,
        sentAt:"2026-09-27T18:00:00.000Z",
        viewedAt:null,
        updatedAt:"2026-09-27T18:00:00.000Z",
      },
      conversation:null,
    }),
    expected:{
      band:"critical",
      recoveryEligible:true,
      nextAction:"Confirmar recebimento da proposta",
    },
  },
  {
    key:"owner_missing",
    description:"Deal sem responsável, sem follow-up e sem atividade comercial recente.",
    input:base({
      dealId:"11111111-1111-4111-8111-111111111114",
      title:"Oportunidade esquecida",
      valueCents:7_200_000,
      ownerUserId:null,
      nextFollowupAt:null,
      createdAt:"2026-07-01T18:00:00.000Z",
      updatedAt:"2026-09-15T18:00:00.000Z",
      stageEnteredAt:"2026-09-01T18:00:00.000Z",
      stageMedianDurationSeconds:null,
      stagePassages:0,
      proposal:null,
      conversation:null,
    }),
    expected:{
      band:"critical",
      recoveryEligible:true,
      nextAction:"Definir responsável e retomar negociação",
    },
  },
] as const

export function runGoldenScenarios() {
  return intelligenceGoldenScenarios.map(scenario => {
    const result = simulateDeal(scenario.input)
    return {
      key:scenario.key,
      description:scenario.description,
      expected:scenario.expected,
      actual:{
        score:result.health.score,
        band:result.health.band,
        recoveryEligible:result.recovery.eligible,
        nextAction:result.nextAction?.title ?? null,
      },
      passed:
        result.health.band === scenario.expected.band
        && result.recovery.eligible === scenario.expected.recoveryEligible
        && (result.nextAction?.title ?? null) === scenario.expected.nextAction,
      result,
    }
  })
}
