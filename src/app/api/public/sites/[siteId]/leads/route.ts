import { createHmac } from "node:crypto"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { isAllowedWebsiteOrigin, isUuid, normalizeWebsiteOrigin, parseWebsiteLead } from "@/lib/server/website/validation"

export const runtime = "nodejs"

type Source = { id: string; tenant_id: string; name: string; privacy_policy_url: string | null; allowed_origins: string[]; status: string }
type Params = { params: Promise<{ siteId: string }> }

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  }
}

async function verifiedSource(request: Request, siteId: string) {
  const rawOrigin = request.headers.get("origin")
  const origin = rawOrigin ? normalizeWebsiteOrigin(rawOrigin) : null
  if (!isUuid(siteId) || !origin) return null

  const rows = await supabaseRest<Source[]>(
    "GET",
    `/website_sources?id=eq.${encodeURIComponent(siteId)}&status=eq.active&select=id,tenant_id,name,privacy_policy_url,allowed_origins,status&limit=1`,
  )
  const source = Array.isArray(rows) ? rows[0] : null
  if (!source || !isAllowedWebsiteOrigin(origin,source.allowed_origins)) return null
  return { source,origin }
}

export async function OPTIONS(request: Request, { params }: Params) {
  try {
    const { siteId } = await params
    const site = await verifiedSource(request,siteId)
    if (!site) return new Response(null,{ status:403 })
    return new Response(null,{ status:204,headers:cors(site.origin) })
  } catch {
    return new Response(null,{ status:503 })
  }
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { siteId } = await params
    const site = await verifiedSource(request,siteId)
    if (!site || !site.source.privacy_policy_url) return Response.json({ error:"origin_or_site_denied" },{ status:403 })
    return Response.json({
      name:site.source.name,
      privacyPolicyUrl:site.source.privacy_policy_url,
    },{ headers:cors(site.origin) })
  } catch {
    return Response.json({ error:"temporarily_unavailable" },{ status:503 })
  }
}

export async function POST(request: Request, { params }: Params) {
  let headers: Record<string,string> = { "Cache-Control":"no-store" }
  try {
    const { siteId } = await params
    const site = await verifiedSource(request,siteId)
    if (!site) return Response.json({ error:"origin_or_site_denied" },{ status:403,headers })
    headers = cors(site.origin)

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return Response.json({ error:"json_required" },{ status:415,headers })
    }
    const length = Number(request.headers.get("content-length") || 0)
    if (length > 8192) return Response.json({ error:"payload_too_large" },{ status:413,headers })
    const text = await request.text()
    if (text.length > 8192) return Response.json({ error:"payload_too_large" },{ status:413,headers })

    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && (parsed as Record<string,unknown>).companyWebsite) {
      // Hidden bot trap: do not reveal whether a submission was accepted.
      return Response.json({ accepted:true },{ status:202,headers })
    }
    const lead = parseWebsiteLead(parsed,site.origin)
    const secret = process.env.CRM_SITE_LEAD_HMAC_SECRET
    if (!secret || secret.length < 32) {
      return Response.json({ error:"site_leads_not_configured" },{ status:503,headers })
    }

    // Public site IDs are NOT secrets. Do not use origin alone as anti-abuse.
    // The IP is never stored raw; unknown IPs intentionally share a strict bucket.
    const ip = (request.headers.get("x-vercel-forwarded-for")
      || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim()
    const hashed = (value: string) => createHmac("sha256",secret).update(value).digest("hex")
    const fingerprint = hashed(`rate:${siteId}:${ip}`)
    const identity = (lead.email ? `email:${lead.email}` : `phone:${lead.phoneE164}`)
    const externalId = `website:${siteId}:${hashed(`contact:${siteId}:${identity}`)}`

    await supabaseRest("POST","/rpc/crm_ingest_website_lead",{
      p_site_id:siteId,
      p_request_id:lead.requestId,
      p_request_fingerprint:fingerprint,
      p_external_contact_id:externalId,
      p_display_name:lead.displayName,
      p_email:lead.email,
      p_phone_e164:lead.phoneE164,
      p_message:lead.message,
      p_page_url:lead.pageUrl,
      p_utm:lead.utm,
      p_privacy_consent:lead.privacyConsent,
    })
    return Response.json({ accepted:true,requestId:lead.requestId },{ status:202,headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "website_lead_rate_limited" || message.includes("website_lead_rate_limited")) {
      return Response.json({ error:"rate_limited" },{ status:429,headers:{...headers,"Retry-After":"600"} })
    }
    if (/^invalid_|_required$|^contact_method_required$/.test(message)) {
      return Response.json({ error:message },{ status:400,headers })
    }
    if (error instanceof SyntaxError) return Response.json({ error:"invalid_json" },{ status:400,headers })
    // Do not expose database errors or customer identifiers to unauthenticated callers.
    return Response.json({ error:"temporarily_unavailable" },{ status:503,headers })
  }
}
