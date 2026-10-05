import { assertInternalRequest } from "@/lib/server/internal-auth"
import { listRouterDispatches } from "@/lib/server/router/event-router"
import { capabilityOwners } from "@/lib/server/router/capabilities"
import type { RouterCapability } from "@/lib/server/router/contracts"

const CAPABILITIES = new Set(Object.keys(capabilityOwners))

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    const url = new URL(request.url)
    const tenantId = String(url.searchParams.get("tenantId") || "").trim()
    const rawCapability = String(url.searchParams.get("capability") || "").trim()
    const rawStatus = String(url.searchParams.get("status") || "").trim()
    const limit = Number(url.searchParams.get("limit") || 50)

    if (!tenantId) return Response.json({ error:"tenant_required" },{ status:400 })
    if (rawCapability && !CAPABILITIES.has(rawCapability)) {
      return Response.json({ error:"invalid_capability" },{ status:400 })
    }

    const dispatches = await listRouterDispatches({
      tenantId,
      capability: rawCapability ? rawCapability as RouterCapability : undefined,
      status: ["routed","consumed","ignored","failed"].includes(rawStatus)
        ? rawStatus as "routed" | "consumed" | "ignored" | "failed"
        : undefined,
      limit,
    })

    return Response.json({
      data:dispatches,
      owners:rawCapability
        ? [capabilityOwners[rawCapability as RouterCapability]]
        : Object.values(capabilityOwners),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
    return Response.json({ error:"dispatch_list_error",message },{ status:400 })
  }
}
