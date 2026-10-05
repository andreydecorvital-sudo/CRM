import { supabaseRest } from "@/lib/server/supabase/rest"

type Subscription = {
  tenant_id: string
  plan_key: string
  status: "trial" | "active" | "past_due" | "paused" | "cancelled"
  features: Record<string, unknown>
  limits: Record<string, unknown>
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
}

type UsageCounter = {
  metric: string
  quantity: number
  period_start: string
  period_end: string
}

export async function loadSubscription(tenantId: string) {
  const rows = await supabaseRest<Subscription[]>(
    "GET",
    `/tenant_subscriptions?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function assertFeature(tenantId: string, feature: string) {
  const subscription = await loadSubscription(tenantId)
  if (!subscription) throw new Error("Tenant sem plano configurado.")
  if (!["trial","active"].includes(subscription.status)) throw new Error(`Plano indisponível: ${subscription.status}`)

  const enabled = subscription.features?.[feature]
  if (enabled !== true) throw new Error(`Recurso não habilitado no plano: ${feature}`)
  return subscription
}

export async function currentUsage(tenantId: string, metric: string) {
  const today = new Date()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)

  const rows = await supabaseRest<UsageCounter[]>(
    "GET",
    `/usage_counters?tenant_id=eq.${encodeURIComponent(tenantId)}&metric=eq.${encodeURIComponent(metric)}&period_start=eq.${start}&select=metric,quantity,period_start,period_end&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function assertWithinLimit(tenantId: string, metric: string, increment = 1) {
  const subscription = await loadSubscription(tenantId)
  if (!subscription) throw new Error("Tenant sem plano configurado.")
  if (!["trial","active"].includes(subscription.status)) throw new Error(`Plano indisponível: ${subscription.status}`)

  const raw = subscription.limits?.[metric]
  if (raw === undefined || raw === null || raw === "unlimited") return { allowed: true, limit: null, used: 0 }

  const limit = Number(raw)
  if (!Number.isFinite(limit) || limit < 0) throw new Error(`Limite inválido para ${metric}.`)
  const usage = await currentUsage(tenantId, metric)
  const used = Number(usage?.quantity || 0)

  if (used + Math.max(0, increment) > limit) {
    throw new Error(`Limite do plano atingido para ${metric}: ${used}/${limit}.`)
  }
  return { allowed: true, limit, used }
}

export async function recordUsage(input: {
  tenantId: string
  metric: string
  quantity?: number
  dedupeKey: string
  metadata?: Record<string, unknown>
}) {
  return supabaseRest<boolean>("POST", "/rpc/crm_record_usage", {
    p_tenant_id: input.tenantId,
    p_metric: input.metric,
    p_quantity: Math.max(1, Math.trunc(input.quantity ?? 1)),
    p_dedupe_key: input.dedupeKey,
    p_metadata: input.metadata ?? {},
  })
}
