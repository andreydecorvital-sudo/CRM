import { supabaseRest } from "@/lib/server/supabase/rest"
import { ResendProvider } from "./providers/resend"
import type { EmailProvider } from "./types"

type EmailConnectionRow = {
  provider: "resend"
  status: "disconnected" | "connected" | "error"
  from_email: string
  from_name: string | null
  reply_to: string | null
  secret_ref: string | null
  config: Record<string, unknown>
}

function configString(config: Record<string, unknown>, key: string) {
  const value = config?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function secretFromRef(ref: string | null) {
  if (!ref) return String(process.env.RESEND_API_KEY || "").trim()
  if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(ref)) throw new Error("secret_ref de e-mail inválido.")
  const value = String(process.env[ref] || "").trim()
  if (!value) throw new Error(`Secret de e-mail não configurado: ${ref}`)
  return value
}

export async function createEmailProviderForTenant(tenantId: string): Promise<EmailProvider> {
  const rows = await supabaseRest<EmailConnectionRow[]>(
    "GET",
    `/email_connections?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.connected&select=provider,status,from_email,from_name,reply_to,secret_ref,config&limit=1`,
  )
  const connection = Array.isArray(rows) ? rows[0] : null

  if (!connection) {
    const allowGlobalFallback = String(process.env.EMAIL_ALLOW_GLOBAL_FALLBACK || "").toLowerCase() === "true"
    if (!allowGlobalFallback) throw new Error("Tenant sem conexão de e-mail ativa.")

    return new ResendProvider({
      apiKey: String(process.env.RESEND_API_KEY || ""),
      fromEmail: String(process.env.EMAIL_FROM_EMAIL || ""),
      fromName: process.env.EMAIL_FROM_NAME || null,
      replyTo: process.env.EMAIL_REPLY_TO || null,
    })
  }

  if (connection.provider !== "resend") {
    throw new Error(`Provider de e-mail ainda não implementado: ${connection.provider}`)
  }

  return new ResendProvider({
    apiKey: secretFromRef(connection.secret_ref),
    fromEmail: connection.from_email,
    fromName: connection.from_name,
    replyTo: connection.reply_to,
    baseUrl: configString(connection.config, "baseUrl") || null,
  })
}
