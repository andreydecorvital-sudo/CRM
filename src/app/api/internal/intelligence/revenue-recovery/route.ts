import { assertInternalRequest } from "@/lib/server/internal-auth"
import { scanCommercialIntelligence } from "@/lib/server/intelligence/scanner"
import { commercialIntelligenceSummary } from "@/lib/server/intelligence/summary"
import { supabaseRest } from "@/lib/server/supabase/rest"

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
  return Response.json({ error:"commercial_intelligence_error",message },{ status:400 })
}

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    const url = new URL(request.url)
    const tenantId = String(url.searchParams.get("tenantId") || "").trim()
    const limit = Number(url.searchParams.get("limit") || 50)
    if (!tenantId) return Response.json({ error:"tenant_required" },{ status:400 })

    const result = await commercialIntelligenceSummary({ tenantId,limit })
    return Response.json(result,{ headers:{ "Cache-Control":"no-store" } })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  try {
    assertInternalRequest(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return Response.json({ error:"invalid_payload" },{ status:400 })

    const tenantId = String(body.tenantId || "").trim()
    if (!tenantId) return Response.json({ error:"tenant_required" },{ status:400 })

    const mode = String(body.mode || "enqueue")
    const dealId = typeof body.dealId === "string" ? body.dealId : null
    const contactId = typeof body.contactId === "string" ? body.contactId : null
    const limit = Math.min(Math.max(Math.trunc(Number(body.limit || 250)),1),1000)

    if (mode === "run") {
      const result = await scanCommercialIntelligence({ tenantId,dealId,contactId,limit })
      return Response.json({ ok:true,mode,result })
    }

    if (mode !== "enqueue") {
      return Response.json({ error:"invalid_mode" },{ status:400 })
    }

    const jobId = await supabaseRest<string>("POST","/rpc/crm_enqueue_job",{
      p_tenant_id:tenantId,
      p_kind:"commercial_intelligence",
      p_payload:{ tenantId,dealId,contactId,limit },
      p_dedupe_key:`commercial-intelligence:manual:${crypto.randomUUID()}`,
      p_priority:110,
      p_max_attempts:5,
    })

    return Response.json({ ok:true,mode:"enqueue",jobId },{ status:202 })
  } catch (error) {
    return fail(error)
  }
}
