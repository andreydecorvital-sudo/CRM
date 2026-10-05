import { supabaseRest } from "@/lib/server/supabase/rest"

export type PrivacyRequestType = "access" | "export" | "correction" | "deletion"

export async function createPrivacyRequest(input: {
  tenantId: string
  contactId: string
  type: PrivacyRequestType
  requestedByUserId?: string | null
  reason?: string | null
  dueAt?: string | null
  metadata?: Record<string, unknown>
}) {
  const rows = await supabaseRest<Array<{ id: string }>>("POST", "/privacy_requests", [{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    request_type: input.type,
    status: "requested",
    requested_by_user_id: input.requestedByUserId || null,
    reason: String(input.reason || "").trim().slice(0,4000) || null,
    due_at: input.dueAt || null,
    metadata: input.metadata ?? {},
  }])

  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error("Não foi possível criar solicitação de privacidade.")
  return row
}

export async function privacyInventory(tenantId: string, contactId: string) {
  return supabaseRest<Record<string, unknown> | null>("POST", "/rpc/crm_contact_privacy_inventory", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
  })
}

export async function exportContactData(tenantId: string, contactId: string) {
  const data = await supabaseRest<Record<string, unknown> | null>("POST", "/rpc/crm_export_contact_data", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
  })
  if (!data) throw new Error("Contato não encontrado para exportação.")
  return data
}
