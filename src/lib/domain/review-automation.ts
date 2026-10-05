export type ReviewRequestStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "responded"
  | "expired"
  | "cancelled"
  | "failed"

export type ReviewPolicy = {
  enabled: boolean
  autoSendEnabled: boolean
  delayHours: number
  minDaysBetweenRequests: number
}

export type ReviewEligibilityInput = {
  transactionStatus: "completed" | "refunded" | "cancelled"
  transactionOccurredAt: string
  lastRequestAt: string | null
  now?: Date
}

export type ReviewEligibility = {
  eligible: boolean
  reason: "eligible" | "disabled" | "auto_send_disabled" | "transaction_not_completed" | "cooldown"
  scheduledFor: string | null
}

export function reviewEligibility(
  input: ReviewEligibilityInput,
  policy: ReviewPolicy,
): ReviewEligibility {
  if (!policy.enabled) return { eligible: false, reason: "disabled", scheduledFor: null }
  if (!policy.autoSendEnabled) return { eligible: false, reason: "auto_send_disabled", scheduledFor: null }
  if (input.transactionStatus !== "completed") return { eligible: false, reason: "transaction_not_completed", scheduledFor: null }

  const now = input.now ?? new Date()
  if (input.lastRequestAt) {
    const last = new Date(input.lastRequestAt)
    const cooldownMs = policy.minDaysBetweenRequests * 86_400_000
    if (!Number.isNaN(last.getTime()) && now.getTime() - last.getTime() < cooldownMs) {
      return { eligible: false, reason: "cooldown", scheduledFor: null }
    }
  }

  const occurredAt = new Date(input.transactionOccurredAt)
  const base = Number.isNaN(occurredAt.getTime()) ? now : occurredAt
  const scheduled = new Date(base.getTime() + policy.delayHours * 3_600_000)

  return {
    eligible: true,
    reason: "eligible",
    scheduledFor: new Date(Math.max(now.getTime(), scheduled.getTime())).toISOString(),
  }
}
