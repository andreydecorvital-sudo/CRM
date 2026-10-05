import { reviewEligibility } from "@/lib/domain/review-automation"
import { supabaseRest } from "@/lib/server/supabase/rest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TransactionRow = {
  id: string
  contact_id: string
  status: "completed" | "refunded" | "cancelled"
  occurred_at: string
}

type SettingsRow = {
  review_enabled: boolean
  review_auto_send_enabled: boolean
  review_delay_hours: number
  review_min_days_between_requests: number
  review_public_url: string | null
}

type RequestRow = {
  created_at: string
}

function safeUuid(value: string, label: string) {
  const normalized = String(value || "").trim()
  if (!UUID.test(normalized)) throw new Error(`${label} inválido.`)
  return normalized
}

export async function scheduleReviewForTransaction(tenantIdRaw: string, transactionIdRaw: string) {
  const tenantId = safeUuid(tenantIdRaw, "Tenant")
  const transactionId = safeUuid(transactionIdRaw, "Transação")

  const [transactions, settings] = await Promise.all([
    supabaseRest<TransactionRow[]>(
      "GET",
      `/customer_transactions?id=eq.${encodeURIComponent(transactionId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,contact_id,status,occurred_at&limit=1`,
    ),
    supabaseRest<SettingsRow[]>(
      "GET",
      `/customer_settings?tenant_id=eq.${encodeURIComponent(tenantId)}&select=review_enabled,review_auto_send_enabled,review_delay_hours,review_min_days_between_requests,review_public_url&limit=1`,
    ),
  ])

  const transaction = Array.isArray(transactions) ? transactions[0] : null
  if (!transaction) throw new Error("Transação não encontrada.")

  const config = Array.isArray(settings) ? settings[0] : null
  const policy = {
    enabled: config?.review_enabled ?? false,
    autoSendEnabled: config?.review_auto_send_enabled ?? false,
    delayHours: config?.review_delay_hours ?? 24,
    minDaysBetweenRequests: config?.review_min_days_between_requests ?? 60,
  }

  const last = await supabaseRest<RequestRow[]>(
    "GET",
    `/review_requests?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(transaction.contact_id)}&select=created_at&order=created_at.desc&limit=1`,
  )

  const eligibility = reviewEligibility({
    transactionStatus: transaction.status,
    transactionOccurredAt: transaction.occurred_at,
    lastRequestAt: Array.isArray(last) && last[0] ? last[0].created_at : null,
  }, policy)

  if (!eligibility.eligible || !eligibility.scheduledFor) return { created: false, eligibility }

  const created = await supabaseRest<Record<string, unknown>[]>("POST", "/review_requests", [{
    tenant_id: tenantId,
    contact_id: transaction.contact_id,
    transaction_id: transaction.id,
    channel: "whatsapp",
    status: "pending",
    scheduled_for: eligibility.scheduledFor,
    public_review_url: config?.review_public_url ?? null,
    metadata: { source: "customer-transaction" },
  }])

  return { created: true, eligibility, request: Array.isArray(created) ? created[0] ?? null : null }
}
