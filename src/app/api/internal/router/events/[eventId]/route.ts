import { assertInternalRequest } from "@/lib/server/internal-auth"
import { routeDomainEvent } from "@/lib/server/router/event-router"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    assertInternalRequest(request)
    const { eventId } = await params
    const result = await routeDomainEvent(eventId)
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
    return Response.json({ error:"router_error",message },{ status:400 })
  }
}
