import { supabaseRest } from "@/lib/server/supabase/rest"

export async function configureWahaConnection(input: {
  tenantId: string
  baseUrl?: string | null
  session: string
  secretRef?: string | null
  phoneE164?: string | null
  providerAccountId?: string | null
  status?: "disconnected" | "pairing" | "connected" | "error"
}) {
  const session = String(input.session || "").trim().slice(0, 160)
  if (!session) throw new Error("Sessão WAHA obrigatória.")

  const existing = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/whatsapp_connections?tenant_id=eq.${encodeURIComponent(input.tenantId)}&provider=eq.waha&select=id&limit=1`,
  )

  const body = {
    provider: "waha",
    status: input.status ?? "disconnected",
    provider_account_id: String(input.providerAccountId || "").trim().slice(0, 240) || null,
    phone_e164: String(input.phoneE164 || "").trim().slice(0, 32) || null,
    secret_ref: String(input.secretRef || "").trim().slice(0, 120) || null,
    config: {
      baseUrl: String(input.baseUrl || "").trim().replace(/\/+$/, "") || null,
      session,
    },
    updated_at: new Date().toISOString(),
  }

  if (Array.isArray(existing) && existing[0]?.id) {
    await supabaseRest("PATCH", `/whatsapp_connections?id=eq.${encodeURIComponent(existing[0].id)}`, body)
    return { id: existing[0].id, updated: true }
  }

  const created = await supabaseRest<Array<{ id: string }>>("POST", "/whatsapp_connections", [{
    tenant_id: input.tenantId,
    ...body,
  }])
  return { id: Array.isArray(created) ? created[0]?.id ?? null : null, updated: false }
}
