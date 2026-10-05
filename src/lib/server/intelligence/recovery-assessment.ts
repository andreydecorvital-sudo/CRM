import type {
  DealHealthInput,
  DealHealthResult,
  RevenueRecoveryReason,
} from "./types"

export type RevenueRecoveryAssessment = {
  eligible: boolean
  reason: RevenueRecoveryReason | null
  severity: "at_risk" | "critical" | null
  pipelineValueCents: number
  exposedValueCents: number
  daysStalled: number
  summary: string | null
}

function mainReason(health: DealHealthResult): RevenueRecoveryReason {
  const codes = new Set(
    health.reasons
      .filter(reason => reason.points < 0)
      .map(reason => reason.code),
  )

  if (codes.has("owner_missing")) return "owner_missing"
  if (codes.has("customer_waiting") || codes.has("sla_breached")) return "customer_waiting"
  if (codes.has("followup_overdue") || codes.has("task_overdue")) return "followup_overdue"
  if (codes.has("proposal_unviewed") || codes.has("proposal_stale_after_view")) return "proposal_stalled"
  if (codes.has("stage_stalled")) return "stage_stalled"
  if (codes.has("conversation_stale")) return "conversation_stale"
  return "multiple_risk_signals"
}

function stalledDays(health: DealHealthResult) {
  return Math.max(
    0,
    Math.floor(health.signals.followupOverdueDays || 0),
    Math.floor(health.signals.lastActivityAgeDays || 0),
    Math.floor(health.signals.stageAgeDays || 0),
  )
}

function formatBrl(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR",{
    minimumFractionDigits:2,
    maximumFractionDigits:2,
  })}`
}

function summaryFor(
  input: DealHealthInput,
  reason: RevenueRecoveryReason,
) {
  const value = input.valueCents > 0 ? formatBrl(input.valueCents) : "valor não informado"

  const messages: Record<RevenueRecoveryReason,string> = {
    owner_missing:`Deal “${input.title}” (${value}) está sem responsável.`,
    customer_waiting:`Cliente do deal “${input.title}” (${value}) está aguardando retorno.`,
    followup_overdue:`Deal “${input.title}” (${value}) perdeu a cadência de follow-up.`,
    proposal_stalled:`Proposta do deal “${input.title}” (${value}) está parada.`,
    stage_stalled:`Deal “${input.title}” (${value}) está acima do tempo esperado no estágio.`,
    conversation_stale:`Deal “${input.title}” (${value}) está sem atividade comercial recente.`,
    multiple_risk_signals:`Deal “${input.title}” (${value}) possui múltiplos sinais de risco.`,
  }

  return messages[reason]
}

export function assessRevenueRecovery(
  input: DealHealthInput,
  health: DealHealthResult,
): RevenueRecoveryAssessment {
  const pipelineValueCents = Math.max(0,Math.trunc(input.valueCents || 0))
  const eligible = pipelineValueCents > 0
    && (health.band === "at_risk" || health.band === "critical")

  if (!eligible) {
    return {
      eligible:false,
      reason:null,
      severity:null,
      pipelineValueCents,
      exposedValueCents:0,
      daysStalled:0,
      summary:null,
    }
  }

  const reason = mainReason(health)

  return {
    eligible:true,
    reason,
    severity:health.band as "at_risk" | "critical",
    pipelineValueCents,
    exposedValueCents:pipelineValueCents,
    daysStalled:stalledDays(health),
    summary:summaryFor(input,reason),
  }
}
