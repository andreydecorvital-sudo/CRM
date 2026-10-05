import { supabaseRest } from "@/lib/server/supabase/rest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CustomerLifecycleRow = {
  tenant_id: string
  contact_id: string
  display_name: string
  phone_e164: string | null
  purchase_count: number
  lifetime_value_cents: number
  average_order_value_cents: number
  first_purchase_at: string | null
  last_purchase_at: string | null
  customer_tier: "lead" | "first_time" | "repeat" | "vip"
  activity_status: "active" | "at_risk" | "inactive"
}

function uuid(value: string, label: string) {
  const normalized = String(value || "").trim()
  if (!UUID.test(normalized)) throw new Error(`${label} inválido.`)
  return normalized
}

export async function loadCustomerLifecycle(tenantId: string): Promise<CustomerLifecycleRow[]> {
  const tenant = uuid(tenantId, "Tenant")
  const data = await supabaseRest<CustomerLifecycleRow[]>(
    "GET",
    `/customer_lifecycle?tenant_id=eq.${encodeURIComponent(tenant)}&select=*&order=lifetime_value_cents.desc,last_purchase_at.desc.nullslast&limit=500`,
  )
  return Array.isArray(data) ? data : []
}

export async function registerCustomerTransaction(input: {
  tenantId: string
  contactId: string
  externalId: string
  source: string
  amountCents: number
  status?: "completed" | "refunded" | "cancelled"
  occurredAt?: string
  metadata?: Record<string, unknown>
}) {
  const tenantId = uuid(input.tenantId, "Tenant")
  const contactId = uuid(input.contactId, "Contato")
  const externalId = String(input.externalId || "").trim()
  const source = String(input.source || "").trim()
  if (!externalId) throw new Error("externalId obrigatório.")
  if (!source) throw new Error("source obrigatório.")
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new Error("amountCents inválido.")

  return supabaseRest<Record<string, unknown>[]>("POST", "/customer_transactions", [{
    tenant_id: tenantId,
    contact_id: contactId,
    external_id: externalId,
    source,
    amount_cents: input.amountCents,
    status: input.status ?? "completed",
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    metadata: input.metadata ?? {},
  }])
}
