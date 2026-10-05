import { assertInternalRequest } from "@/lib/server/internal-auth"
import { decideActionProposal } from "@/lib/server/router/authorization"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    assertInternalRequest(request)
    const { proposalId } = await params
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return Response.json({ error:"invalid_payload" },{ status:400 })

    const decision = String(body.decision || "")
    const source = String(body.source || "")
    if (!["authorize","reject"].includes(decision)) {
      return Response.json({ error:"invalid_decision" },{ status:400 })
    }
    if (!["policy","human"].includes(source)) {
      return Response.json({ error:"invalid_source" },{ status:400 })
    }

    const result = await decideActionProposal({
      tenantId: String(body.tenantId || ""),
      proposalId,
      decision: decision as "authorize" | "reject",
      source: source as "policy" | "human",
      actorUserId: typeof body.actorUserId === "string" ? body.actorUserId : null,
      reason: typeof body.reason === "string" ? body.reason : null,
    })

    return Response.json({
      ok:true,
      decision,
      result,
      executionStarted:false,
      note:"Authorization and execution are separate lifecycle stages.",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
    return Response.json({ error:"decision_error",message },{ status:400 })
  }
}
