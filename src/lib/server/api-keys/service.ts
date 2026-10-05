import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { supabaseRest } from "@/lib/server/supabase/rest"

type ApiKeyRow = {
  id: string
  tenant_id: string
  name: string
  prefix: string
  secret_hash: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function createApiKey(input: {
  tenantId: string
  name: string
  scopes: string[]
  createdBy?: string | null
  expiresAt?: string | null
}) {
  const prefix = `crm_live_${randomBytes(6).toString("hex")}`
  const secret = randomBytes(32).toString("base64url")
  const apiKey = `${prefix}.${secret}`

  const created = await supabaseRest<Array<{ id: string }>>("POST", "/api_keys", [{
    tenant_id: input.tenantId,
    name: String(input.name || "").trim().slice(0, 160),
    prefix,
    secret_hash: sha256(apiKey),
    scopes: [...new Set((input.scopes || []).map(scope => String(scope).trim()).filter(Boolean))],
    created_by: input.createdBy || null,
    expires_at: input.expiresAt || null,
  }])

  const row = Array.isArray(created) ? created[0] : null
  if (!row) throw new Error("Não foi possível criar a API key.")
  return { id: row.id, prefix, apiKey }
}

export async function verifyApiKey(apiKey: string, requiredScope?: string) {
  const raw = String(apiKey || "").trim()
  const separator = raw.indexOf(".")
  if (separator < 1) return null
  const prefix = raw.slice(0, separator)

  const rows = await supabaseRest<ApiKeyRow[]>(
    "GET",
    `/api_keys?prefix=eq.${encodeURIComponent(prefix)}&select=*&limit=1`,
  )
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row || row.revoked_at) return null
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null
  if (!sameHash(row.secret_hash, sha256(raw))) return null
  if (requiredScope && !row.scopes.includes(requiredScope) && !row.scopes.includes("*")) return null

  await supabaseRest("PATCH", `/api_keys?id=eq.${encodeURIComponent(row.id)}`, {
    last_used_at: new Date().toISOString(),
  }).catch(() => null)

  return { id: row.id, tenantId: row.tenant_id, name: row.name, scopes: row.scopes }
}
