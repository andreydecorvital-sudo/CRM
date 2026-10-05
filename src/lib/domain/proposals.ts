export type ProposalDiscount =
  | { type: "none"; value: 0 }
  | { type: "fixed"; value: number }
  | { type: "percentage"; value: number }

export type ProposalItemInput = {
  quantity: number
  unitPriceCents: number
}

export function proposalTotals(items: ProposalItemInput[], discount: ProposalDiscount) {
  const subtotalCents = items.reduce((total, item) => {
    const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0
    const unitPriceCents = Number.isInteger(item.unitPriceCents) && item.unitPriceCents >= 0 ? item.unitPriceCents : 0
    return total + Math.round(quantity * unitPriceCents)
  }, 0)

  const discountCents = discount.type === "fixed"
    ? Math.min(subtotalCents, Math.round(Math.max(0, discount.value) * 100))
    : discount.type === "percentage"
      ? Math.min(subtotalCents, Math.round(subtotalCents * Math.min(100, Math.max(0, discount.value)) / 100))
      : 0

  return {
    subtotalCents,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
  }
}

export function proposalIsExpired(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return false
  const expires = new Date(expiresAt)
  return !Number.isNaN(expires.getTime()) && expires.getTime() < now.getTime()
}
