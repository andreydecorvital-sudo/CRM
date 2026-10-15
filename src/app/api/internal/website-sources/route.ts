import { assertInternalRequest } from "@/lib/server/internal-auth"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { isUuid, normalizeWebsiteOrigin } from "@/lib/server/website/validation"

type Source = {
  id:string; tenant_id:string; name:string; allowed_origins:string[];
  status:"active"|"paused"; privacy_policy_url:string|null; created_at:string
}

function text(value: unknown,limit: number) {
  return typeof value === "string" ? value.trim().slice(0,limit) : ""
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
  if (message.startsWith("invalid_")) return Response.json({ error:message },{ status:400 })
  return Response.json({ error:"operation_failed" },{ status:503 })
}

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    const tenantId = new URL(request.url).searchParams.get("tenantId") || ""
    if (!isUuid(tenantId)) throw new Error("invalid_tenant")
    const sources = await supabaseRest<Source[]>("GET",
      `/website_sources?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,tenant_id,name,allowed_origins,status,privacy_policy_url,created_at&order=created_at.desc&limit=100`,
    )
    return Response.json({ sources },{ headers:{"Cache-Control":"no-store"} })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    assertInternalRequest(request)
    const input = await request.json() as Record<string,unknown>
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_json")
    const tenantId = text(input.tenantId,50)
    if (!isUuid(tenantId)) throw new Error("invalid_tenant")
    const operation = text(input.operation,30)

    if (operation === "create") {
      const name = text(input.name,120)
      if (name.length < 2) throw new Error("invalid_name")
      if (!Array.isArray(input.allowedOrigins) || input.allowedOrigins.length < 1 || input.allowedOrigins.length > 20) {
        throw new Error("invalid_allowed_origins")
      }
      const origins = input.allowedOrigins.map(value => typeof value === "string"
        ? normalizeWebsiteOrigin(value) : null)
      if (origins.some(value => !value)) throw new Error("invalid_allowed_origins")
      const uniqueOrigins = [...new Set(origins)] as string[]
      const policy = text(input.privacyPolicyUrl,1000)
      try {
        if (!policy || new URL(policy).protocol !== "https:") throw new Error()
      } catch { throw new Error("invalid_privacy_policy") }

      const rows = await supabaseRest<Source[]>("POST","/website_sources",[{
        tenant_id:tenantId,name,allowed_origins:uniqueOrigins,
        privacy_policy_url:policy,status:"paused",
      }])
      const source = Array.isArray(rows) ? rows[0] : null
      if (!source) throw new Error("creation_failed")
      return Response.json({
        source,
        embedCode:`<script async src="${new URL(request.url).origin}/api/public/widget.js?site=${source.id}"></script>`,
        nextStep:"Validate the domain and consent text, then explicitly activate this source.",
      },{ status:201 })
    }

    if (operation === "set_status") {
      const siteId = text(input.siteId,50)
      const status = text(input.status,20)
      if (!isUuid(siteId) || !["active","paused"].includes(status)) throw new Error("invalid_status")
      const existing = await supabaseRest<Source[]>("GET",
        `/website_sources?id=eq.${encodeURIComponent(siteId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,tenant_id,name,allowed_origins,status,privacy_policy_url,created_at&limit=1`,
      )
      if (!Array.isArray(existing) || !existing.length) return Response.json({ error:"not_found" },{ status:404 })
      await supabaseRest("PATCH",
        `/website_sources?id=eq.${encodeURIComponent(siteId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { status,updated_at:new Date().toISOString() })
      return Response.json({ id:siteId,status })
    }
    throw new Error("invalid_operation")
  } catch (error) { return errorResponse(error) }
}
