import { supabaseRest } from "@/lib/server/supabase/rest"

export async function configureResendConnection(input: {
  tenantId: string
  fromEmail: string
  fromName?: string | null
  replyTo?: string | null
  secretRef?: string | null
  baseUrl?: string | null
  status?: "disconnected" | "connected" | "error"
}) {
  const fromEmail = String(input.fromEmail || "").trim().toLowerCase()
  if (!fromEmail.includes("@")) throw new Error("Remetente de e-mail inválido.")

  const existing = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/email_connections?tenant_id=eq.${encodeURIComponent(input.tenantId)}&provider=eq.resend&select=id&limit=1`,
  )

  const body = {
    provider: "resend",
    status: input.status ?? "disconnected",
    from_email: fromEmail,
    from_name: String(input.fromName || "").trim().slice(0, 160) || null,
    reply_to: String(input.replyTo || "").trim().toLowerCase().slice(0, 320) || null,
    secret_ref: String(input.secretRef || "").trim().slice(0, 120) || null,
    config: {
      baseUrl: String(input.baseUrl || "").trim().replace(/\/+$/, "") || null,
    },
    updated_at: new Date().toISOString(),
  }

  if (Array.isArray(existing) && existing[0]?.id) {
    await supabaseRest("PATCH", `/email_connections?id=eq.${encodeURIComponent(existing[0].id)}`, body)
    return { id: existing[0].id, updated: true }
  }

  const created = await supabaseRest<Array<{ id: string }>>("POST", "/email_connections", [{
    tenant_id: input.tenantId,
    ...body,
  }])

  return { id: Array.isArray(created) ? created[0]?.id ?? null : null, updated: false }
}
