import { assertInternalRequest } from "@/lib/server/internal-auth"
import { createActionProposal } from "@/lib/server/router/proposals"
import { supabaseRest } from "@/lib/server/supabase/rest"
import type { ActionProposal, ActionRisk } from "@/lib/server/router/contracts"

const RISKS = new Set<ActionRisk>(["low","medium","high","critical"])
const SOURCES = new Set(["router","ai","human","system"])

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    const url = new URL(request.url)
    const tenantId = String(url.searchParams.get("tenantId") || "").trim()
    const status = String(url.searchParams.get("status") || "").trim()
    const limitRaw = Number(url.searchParams.get("limit") || 50)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw),1),200) : 50

    if (!tenantId) return Response.json({ error:"tenant_required" },{ status:400 })

    const filters = [
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      status ? `status=eq.${encodeURIComponent(status)}` : "",
    ].filter(Boolean).join("&")

    const rows = await supabaseRest<ActionProposal[]>(
      "GET",
      `/action_proposals?${filters}&select=*&order=created_at.desc&limit=${limit}`,
    )

    return Response.json({ data:Array.isArray(rows) ? rows : [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
    return Response.json({ error:"proposal_list_error",message },{ status:400 })
  }
}

export async function POST(request: Request) {
  try {
    assertInternalRequest(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return Response.json({ error:"invalid_payload" },{ status:400 })

    const risk = String(body.riskLevel || "medium") as ActionRisk
    if (!RISKS.has(risk)) return Response.json({ error:"invalid_risk" },{ status:400 })

    const source = String(body.source || "router")
    if (!SOURCES.has(source)) return Response.json({ error:"invalid_source" },{ status:400 })

    const proposal = await createActionProposal({
      tenantId: String(body.tenantId || ""),
      dispatchId: typeof body.dispatchId === "string" ? body.dispatchId : null,
      actionType: String(body.actionType || ""),
      targetType: String(body.targetType || ""),
      targetId: typeof body.targetId === "string" ? body.targetId : null,
      recommendation: String(body.recommendation || ""),
      payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? body.payload as Record<string, unknown>
        : {},
      evidence: Array.isArray(body.evidence) ? body.evidence : [],
      missingData: Array.isArray(body.missingData) ? body.missingData.map(String) : [],
      riskLevel: risk,
      confidence: Number(body.confidence ?? 0),
      source: source as "router" | "ai" | "human" | "system",
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
      createdBy: typeof body.createdBy === "string" ? body.createdBy : null,
    })

    return Response.json({ ok:true,proposal },{ status:201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
    return Response.json({ error:"proposal_error",message },{ status:400 })
  }
}
