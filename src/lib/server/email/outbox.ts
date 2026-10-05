import { supabaseRest } from "@/lib/server/supabase/rest"

export async function queueEmail(input: {
  tenantId: string
  contactId: string
  subject: string
  text: string
  html?: string | null
  purpose?: "transactional" | "support" | "sales" | "marketing" | "opportunity"
  scheduledAt?: string | null
  dedupeKey?: string | null
  metadata?: Record<string, unknown>
}) {
  const subject = String(input.subject || "").trim().slice(0, 500)
  const text = String(input.text || "").trim().slice(0, 12000)
  if (!subject) throw new Error("Assunto do e-mail obrigatório.")
  if (!text) throw new Error("Corpo do e-mail obrigatório.")

  const rows = await supabaseRest<Array<{ id: string; status: string }>>("POST", "/outbound_messages", [{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    channel: "email",
    purpose: input.purpose ?? "transactional",
    subject,
    body: text,
    html_body: String(input.html || "").trim().slice(0, 100000) || null,
    status: "pending",
    scheduled_at: input.scheduledAt || new Date().toISOString(),
    dedupe_key: input.dedupeKey || null,
    metadata: input.metadata ?? {},
  }])

  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error("Não foi possível enfileirar o e-mail.")
  return row
}
