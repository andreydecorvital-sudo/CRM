export type DealHealthBand = "healthy" | "attention" | "at_risk" | "critical"
export type HealthReasonCode =
  | "owner_missing"
  | "followup_missing"
  | "followup_overdue"
  | "task_overdue"
  | "customer_waiting"
  | "conversation_stale"
  | "sla_breached"
  | "proposal_unviewed"
  | "proposal_stale_after_view"
  | "stage_stalled"
  | "deal_old"
  | "recent_customer_reply"
  | "proposal_recently_viewed"
  | "followup_scheduled"
  | "stage_velocity_good"

export type HealthReason = {
  code: HealthReasonCode
  points: number
  severity: "positive" | "info" | "warning" | "critical"
  message: string
  evidence?: Record<string, unknown>
}

export type DealHealthInput = {
  dealId: string
  tenantId: string
  contactId: string
  title: string
  valueCents: number
  ownerUserId: string | null
  nextFollowupAt: string | null
  createdAt: string
  updatedAt: string
  stageEnteredAt: string | null
  stageMedianDurationSeconds: number | null
  stagePassages: number
  conversation: {
    id: string
    status: string
    lastMessageAt: string | null
    lastInboundAt: string | null
    lastOutboundAt: string | null
    slaFirstResponseDueAt: string | null
    slaResolutionDueAt: string | null
    firstResponseAt: string | null
  } | null
  proposal: {
    id: string
    status: string
    totalCents: number
    sentAt: string | null
    viewedAt: string | null
    updatedAt: string
  } | null
  openTasks: Array<{
    id: string
    dueAt: string
    priority: string
    kind: string
  }>
  now: string
}

export type DealHealthResult = {
  score: number
  band: DealHealthBand
  pipelineValueCents: number
  exposedValueCents: number
  reasons: HealthReason[]
  signals: {
    dealAgeDays: number
    stageAgeDays: number | null
    stageVelocityRatio: number | null
    lastActivityAgeDays: number | null
    lastInboundAgeDays: number | null
    lastOutboundAgeDays: number | null
    followupOverdueDays: number | null
    overdueTasks: number
    customerWaiting: boolean
    slaBreached: boolean
    proposalAgeDays: number | null
    proposalViewedAgeDays: number | null
  }
}

export type NextActionRecommendation = {
  actionType: "task.create" | "deal.follow_up"
  title: string
  reason: string
  confidence: number
  riskLevel: "low" | "medium"
  priority: "normal" | "high" | "urgent"
  dueInMinutes: number
  payload: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
}

export type RevenueRecoveryReason =
  | "owner_missing"
  | "customer_waiting"
  | "followup_overdue"
  | "proposal_stalled"
  | "stage_stalled"
  | "conversation_stale"
  | "multiple_risk_signals"
