export type CustomerTier = "lead" | "first_time" | "repeat" | "vip"
export type CustomerActivity = "active" | "at_risk" | "inactive"

export type LifecyclePolicy = {
  repeatMinPurchases: number
  vipMinPurchases: number
  vipMinLifetimeCents: number
  atRiskAfterDays: number
  inactiveAfterDays: number
}

export type CustomerMetrics = {
  purchaseCount: number
  lifetimeValueCents: number
  firstPurchaseAt: string | null
  lastPurchaseAt: string | null
}

export const DEFAULT_LIFECYCLE_POLICY: LifecyclePolicy = {
  repeatMinPurchases: 2,
  vipMinPurchases: 5,
  vipMinLifetimeCents: 500_000,
  atRiskAfterDays: 45,
  inactiveAfterDays: 90,
}

function daysBetween(now: Date, iso: string): number {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000))
}

export function classifyCustomerTier(metrics: CustomerMetrics, policy: LifecyclePolicy = DEFAULT_LIFECYCLE_POLICY): CustomerTier {
  if (metrics.purchaseCount <= 0) return "lead"
  if (metrics.purchaseCount >= policy.vipMinPurchases || metrics.lifetimeValueCents >= policy.vipMinLifetimeCents) return "vip"
  if (metrics.purchaseCount >= policy.repeatMinPurchases) return "repeat"
  return "first_time"
}

export function classifyCustomerActivity(
  metrics: CustomerMetrics,
  policy: LifecyclePolicy = DEFAULT_LIFECYCLE_POLICY,
  now = new Date(),
): CustomerActivity {
  if (!metrics.lastPurchaseAt) return "active"
  const days = daysBetween(now, metrics.lastPurchaseAt)
  if (days >= policy.inactiveAfterDays) return "inactive"
  if (days >= policy.atRiskAfterDays) return "at_risk"
  return "active"
}

export function averageOrderValueCents(metrics: Pick<CustomerMetrics, "purchaseCount" | "lifetimeValueCents">): number {
  if (metrics.purchaseCount <= 0) return 0
  return Math.round(metrics.lifetimeValueCents / metrics.purchaseCount)
}
