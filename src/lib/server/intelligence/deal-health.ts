import { createHash } from "node:crypto"
import type {
  DealHealthBand,
  DealHealthInput,
  DealHealthResult,
  HealthReason,
} from "./types"

const DAY_MS = 86_400_000

function ms(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function daysBetween(nowMs: number, value: string | null | undefined) {
  const timestamp = ms(value)
  if (timestamp === null) return null
  return Math.max(0,(nowMs - timestamp) / DAY_MS)
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function clamp(value: number,min: number,max: number) {
  return Math.min(Math.max(value,min),max)
}

function bandFor(score: number): DealHealthBand {
  if (score >= 75) return "healthy"
  if (score >= 55) return "attention"
  if (score >= 35) return "at_risk"
  return "critical"
}

function add(reasons: HealthReason[], reason: HealthReason) {
  reasons.push(reason)
  return reason.points
}

export function calculateDealHealth(input: DealHealthInput): DealHealthResult {
  const nowMs = ms(input.now) ?? Date.now()
  const reasons: HealthReason[] = []
  let score = 70

  const dealAgeDays = daysBetween(nowMs,input.createdAt) ?? 0
  const stageAgeDays = daysBetween(nowMs,input.stageEnteredAt)
  const lastActivityAt = input.conversation?.lastMessageAt || input.updatedAt
  const lastActivityAgeDays = daysBetween(nowMs,lastActivityAt)
  const lastInboundAgeDays = daysBetween(nowMs,input.conversation?.lastInboundAt)
  const lastOutboundAgeDays = daysBetween(nowMs,input.conversation?.lastOutboundAt)

  const followupAtMs = ms(input.nextFollowupAt)
  const followupOverdueDays = followupAtMs !== null && followupAtMs < nowMs
    ? (nowMs - followupAtMs) / DAY_MS
    : null

  const overdueTasks = input.openTasks.filter(task => {
    const due = ms(task.dueAt)
    return due !== null && due < nowMs
  }).length

  const inboundMs = ms(input.conversation?.lastInboundAt)
  const outboundMs = ms(input.conversation?.lastOutboundAt)
  const customerWaiting = Boolean(
    inboundMs !== null
    && (outboundMs === null || inboundMs > outboundMs)
    && (nowMs - inboundMs) > 30 * 60_000,
  )

  const slaFirstMs = ms(input.conversation?.slaFirstResponseDueAt)
  const slaResolutionMs = ms(input.conversation?.slaResolutionDueAt)
  const slaBreached = Boolean(
    input.conversation
    && input.conversation.status !== "resolved"
    && (
      (slaFirstMs !== null && !input.conversation.firstResponseAt && slaFirstMs < nowMs)
      || (slaResolutionMs !== null && slaResolutionMs < nowMs)
    ),
  )

  const proposalAgeDays = daysBetween(
    nowMs,
    input.proposal?.sentAt || input.proposal?.updatedAt,
  )
  const proposalViewedAgeDays = daysBetween(nowMs,input.proposal?.viewedAt)

  const stageMedianSeconds = input.stageMedianDurationSeconds
  const stageVelocityRatio = stageAgeDays !== null
    && stageMedianSeconds
    && stageMedianSeconds > 0
    && input.stagePassages >= 5
      ? (stageAgeDays * 86_400) / stageMedianSeconds
      : null

  if (!input.ownerUserId) {
    score += add(reasons,{
      code:"owner_missing",
      points:-20,
      severity:"critical",
      message:"Negociação sem responsável definido.",
    })
  }

  if (!input.nextFollowupAt) {
    score += add(reasons,{
      code:"followup_missing",
      points:-12,
      severity:"warning",
      message:"Negociação ativa sem próximo follow-up.",
    })
  } else if (followupOverdueDays !== null) {
    const points = followupOverdueDays >= 3 ? -25 : -18
    score += add(reasons,{
      code:"followup_overdue",
      points,
      severity:followupOverdueDays >= 3 ? "critical" : "warning",
      message:`Follow-up atrasado há ${round1(followupOverdueDays)} dia(s).`,
      evidence:{ followupOverdueDays:round1(followupOverdueDays) },
    })
  } else if (followupAtMs !== null && followupAtMs - nowMs <= 72 * 60 * 60_000) {
    score += add(reasons,{
      code:"followup_scheduled",
      points:6,
      severity:"positive",
      message:"Próximo follow-up já está programado.",
    })
  }

  if (overdueTasks > 0) {
    const points = -Math.min(15,overdueTasks * 5)
    score += add(reasons,{
      code:"task_overdue",
      points,
      severity:overdueTasks >= 3 ? "critical" : "warning",
      message:`${overdueTasks} tarefa(s) vencida(s) nesta negociação.`,
      evidence:{ overdueTasks },
    })
  }

  if (customerWaiting) {
    score += add(reasons,{
      code:"customer_waiting",
      points:-15,
      severity:"critical",
      message:"Cliente respondeu e ainda aguarda retorno da equipe.",
    })
  }

  if (slaBreached) {
    score += add(reasons,{
      code:"sla_breached",
      points:-15,
      severity:"critical",
      message:"Conversa relacionada ultrapassou o SLA.",
    })
  }

  if (lastInboundAgeDays !== null && lastInboundAgeDays <= 2) {
    score += add(reasons,{
      code:"recent_customer_reply",
      points:6,
      severity:"positive",
      message:"Cliente interagiu recentemente.",
      evidence:{ lastInboundAgeDays:round1(lastInboundAgeDays) },
    })
  }

  if (lastActivityAgeDays !== null) {
    if (lastActivityAgeDays >= 14) {
      score += add(reasons,{
        code:"conversation_stale",
        points:-18,
        severity:"critical",
        message:`Negociação sem atividade há ${Math.floor(lastActivityAgeDays)} dias.`,
        evidence:{ lastActivityAgeDays:round1(lastActivityAgeDays) },
      })
    } else if (lastActivityAgeDays >= 7) {
      score += add(reasons,{
        code:"conversation_stale",
        points:-10,
        severity:"warning",
        message:`Negociação sem atividade há ${Math.floor(lastActivityAgeDays)} dias.`,
        evidence:{ lastActivityAgeDays:round1(lastActivityAgeDays) },
      })
    }
  }

  if (input.proposal?.status === "sent" && proposalAgeDays !== null) {
    if (proposalAgeDays >= 7) {
      score += add(reasons,{
        code:"proposal_unviewed",
        points:-18,
        severity:"critical",
        message:"Proposta enviada há pelo menos 7 dias e ainda não visualizada.",
        evidence:{ proposalAgeDays:round1(proposalAgeDays) },
      })
    } else if (proposalAgeDays >= 3) {
      score += add(reasons,{
        code:"proposal_unviewed",
        points:-12,
        severity:"warning",
        message:"Proposta enviada há pelo menos 3 dias e ainda não visualizada.",
        evidence:{ proposalAgeDays:round1(proposalAgeDays) },
      })
    }
  }

  if (input.proposal?.status === "viewed" && proposalViewedAgeDays !== null) {
    if (proposalViewedAgeDays <= 2) {
      score += add(reasons,{
        code:"proposal_recently_viewed",
        points:8,
        severity:"positive",
        message:"Proposta foi visualizada recentemente.",
      })
    } else if (proposalViewedAgeDays >= 3 && (lastOutboundAgeDays ?? 99) >= 2) {
      score += add(reasons,{
        code:"proposal_stale_after_view",
        points:-12,
        severity:"warning",
        message:"Proposta visualizada sem retomada comercial recente.",
        evidence:{ proposalViewedAgeDays:round1(proposalViewedAgeDays) },
      })
    }
  }

  if (stageVelocityRatio !== null) {
    if (stageVelocityRatio >= 2.5) {
      score += add(reasons,{
        code:"stage_stalled",
        points:-20,
        severity:"critical",
        message:"Tempo no estágio está muito acima da mediana histórica.",
        evidence:{ stageVelocityRatio:round1(stageVelocityRatio) },
      })
    } else if (stageVelocityRatio >= 1.5) {
      score += add(reasons,{
        code:"stage_stalled",
        points:-12,
        severity:"warning",
        message:"Tempo no estágio está acima da mediana histórica.",
        evidence:{ stageVelocityRatio:round1(stageVelocityRatio) },
      })
    } else if (stageVelocityRatio <= 0.75) {
      score += add(reasons,{
        code:"stage_velocity_good",
        points:4,
        severity:"positive",
        message:"Negociação está avançando dentro de uma velocidade saudável.",
        evidence:{ stageVelocityRatio:round1(stageVelocityRatio) },
      })
    }
  } else if (stageAgeDays !== null) {
    if (stageAgeDays >= 30) {
      score += add(reasons,{
        code:"stage_stalled",
        points:-18,
        severity:"critical",
        message:"Negociação está há pelo menos 30 dias no mesmo estágio.",
        evidence:{ stageAgeDays:round1(stageAgeDays) },
      })
    } else if (stageAgeDays >= 14) {
      score += add(reasons,{
        code:"stage_stalled",
        points:-10,
        severity:"warning",
        message:"Negociação está há pelo menos 14 dias no mesmo estágio.",
        evidence:{ stageAgeDays:round1(stageAgeDays) },
      })
    }
  }

  if (dealAgeDays >= 60) {
    score += add(reasons,{
      code:"deal_old",
      points:-8,
      severity:"warning",
      message:"Negociação aberta há mais de 60 dias.",
      evidence:{ dealAgeDays:round1(dealAgeDays) },
    })
  }

  score = Math.round(clamp(score,0,100))
  const band = bandFor(score)
  const pipelineValueCents = Math.max(0,Math.trunc(input.valueCents || 0))
  const exposedValueCents = band === "at_risk" || band === "critical"
    ? pipelineValueCents
    : 0

  return {
    score,
    band,
    pipelineValueCents,
    exposedValueCents,
    reasons,
    signals:{
      dealAgeDays:round1(dealAgeDays),
      stageAgeDays:stageAgeDays === null ? null : round1(stageAgeDays),
      stageVelocityRatio:stageVelocityRatio === null ? null : round1(stageVelocityRatio),
      lastActivityAgeDays:lastActivityAgeDays === null ? null : round1(lastActivityAgeDays),
      lastInboundAgeDays:lastInboundAgeDays === null ? null : round1(lastInboundAgeDays),
      lastOutboundAgeDays:lastOutboundAgeDays === null ? null : round1(lastOutboundAgeDays),
      followupOverdueDays:followupOverdueDays === null ? null : round1(followupOverdueDays),
      overdueTasks,
      customerWaiting,
      slaBreached,
      proposalAgeDays:proposalAgeDays === null ? null : round1(proposalAgeDays),
      proposalViewedAgeDays:proposalViewedAgeDays === null ? null : round1(proposalViewedAgeDays),
    },
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  return `{${Object.entries(value as Record<string,unknown>)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`
}

export function dealHealthFingerprint(input: {
  dealId: string
  result: DealHealthResult
}) {
  return createHash("sha256")
    .update(stable({
      dealId:input.dealId,
      score:input.result.score,
      band:input.result.band,
      reasons:input.result.reasons.map(reason => ({
        code:reason.code,
        points:reason.points,
        evidence:reason.evidence ?? null,
      })),
      signals:input.result.signals,
    }))
    .digest("hex")
}
