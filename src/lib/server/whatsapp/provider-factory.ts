import { supabaseRest } from "@/lib/server/supabase/rest"
import { WahaProvider } from "./providers/waha"
import type { WhatsappProvider } from "./types"

type ConnectionRow = {
  provider: "waha" | "meta" | "bsp"
  status: "disconnected" | "pairing" | "connected" | "error"
  secret_ref: string | null
  config: Record<string, unknown>
}

function configString(config: Record<string, unknown>, key: string) {
  const value = config?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function secretFromRef(ref: string | null) {
  if (!ref) return String(process.env.WAHA_API_KEY || "").trim()
  if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(ref)) throw new Error("secret_ref do WhatsApp inválido.")
  const value = String(process.env[ref] || "").trim()
  if (!value) throw new Error(`Secret WhatsApp não configurado: ${ref}`)
  return value
}

export async function createWhatsappProviderForTenant(tenantId: string): Promise<WhatsappProvider> {
  const rows = await supabaseRest<ConnectionRow[]>(
    "GET",
    `/whatsapp_connections?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.connected&select=provider,status,secret_ref,config&limit=1`,
  )
  const connection = Array.isArray(rows) ? rows[0] : null

  if (!connection) {
    const allowGlobalFallback = String(process.env.WAHA_ALLOW_GLOBAL_FALLBACK || "").toLowerCase() === "true"
    if (!allowGlobalFallback) {
      throw new Error("Tenant sem conexão WhatsApp ativa.")
    }
    return new WahaProvider()
  }

  if (connection.provider !== "waha") {
    throw new Error(`Provider WhatsApp ainda não implementado no worker: ${connection.provider}`)
  }

  return new WahaProvider({
    baseUrl: configString(connection.config, "baseUrl") || process.env.WAHA_BASE_URL,
    session: configString(connection.config, "session") || process.env.WAHA_SESSION || "default",
    apiKey: secretFromRef(connection.secret_ref),
  })
}
