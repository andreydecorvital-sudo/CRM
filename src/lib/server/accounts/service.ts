import { supabaseRest } from "@/lib/server/supabase/rest"

export type AccountMetrics = {
  account_id: string
  tenant_id: string
  name: string
  status: "prospect" | "customer" | "inactive"
  contacts_count: number
  open_deals: number
  open_pipeline_cents: number
  lifetime_value_cents: number
  last_purchase_at: string | null
}

export async function createAccount(input: {
  tenantId: string
  name: string
  legalName?: string | null
  documentId?: string | null
  website?: string | null
  industry?: string | null
  sizeLabel?: string | null
  ownerUserId?: string | null
  metadata?: Record<string, unknown>
}) {
  const name = String(input.name || "").trim().slice(0, 240)
  if (!name) throw new Error("Nome da empresa obrigatório.")

  const rows = await supabaseRest<Array<{ id: string }>>("POST", "/accounts", [{
    tenant_id: input.tenantId,
    name,
    legal_name: String(input.legalName || "").trim().slice(0, 240) || null,
    document_id: String(input.documentId || "").trim().slice(0, 80) || null,
    website: String(input.website || "").trim().slice(0, 500) || null,
    industry: String(input.industry || "").trim().slice(0, 120) || null,
    size_label: String(input.sizeLabel || "").trim().slice(0, 80) || null,
    owner_user_id: input.ownerUserId || null,
    metadata: input.metadata ?? {},
  }])

  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error("Não foi possível criar a empresa.")
  return row
}

export async function linkContactToAccount(input: {
  accountId: string
  contactId: string
  role?: string | null
  isPrimary?: boolean
}) {
  const existing = await supabaseRest<Array<{ account_id: string }>>(
    "GET",
    `/account_contacts?account_id=eq.${encodeURIComponent(input.accountId)}&contact_id=eq.${encodeURIComponent(input.contactId)}&select=account_id&limit=1`,
  )
  if (Array.isArray(existing) && existing[0]) {
    await supabaseRest("PATCH", `/account_contacts?account_id=eq.${encodeURIComponent(input.accountId)}&contact_id=eq.${encodeURIComponent(input.contactId)}`, {
      role: String(input.role || "").trim().slice(0, 120) || null,
      is_primary: input.isPrimary === true,
    })
    return { linked: true, updated: true }
  }

  await supabaseRest("POST", "/account_contacts", [{
    account_id: input.accountId,
    contact_id: input.contactId,
    role: String(input.role || "").trim().slice(0, 120) || null,
    is_primary: input.isPrimary === true,
  }])
  return { linked: true, updated: false }
}

export async function loadAccountMetrics(tenantId: string, accountId?: string) {
  const filter = accountId ? `&account_id=eq.${encodeURIComponent(accountId)}` : ""
  const rows = await supabaseRest<AccountMetrics[]>(
    "GET",
    `/account_metrics?tenant_id=eq.${encodeURIComponent(tenantId)}${filter}&select=*&order=lifetime_value_cents.desc`,
  )
  return Array.isArray(rows) ? rows : []
}
