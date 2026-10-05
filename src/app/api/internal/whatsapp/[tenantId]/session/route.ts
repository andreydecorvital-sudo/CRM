import { assertInternalRequest } from "@/lib/server/internal-auth"
import {
  controlWahaSession,
  getStoredWahaConnection,
  provisionWahaSession,
  syncWahaSession,
} from "@/lib/server/whatsapp/waha-admin"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 })
  return Response.json({ error: "whatsapp_session_error", message }, { status: 400 })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    assertInternalRequest(request)
    const { tenantId } = await params
    const refresh = new URL(request.url).searchParams.get("refresh") === "1"

    const live = refresh ? await syncWahaSession(tenantId) : null
    const connection = await getStoredWahaConnection(tenantId)

    return Response.json({
      connection,
      live: live ? {
        name: live.name || null,
        status: live.status || null,
        me: live.me || null,
      } : null,
    }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    assertInternalRequest(request)
    const { tenantId } = await params
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = String(body?.action || "").trim()

    let result: unknown
    if (action === "provision") result = await provisionWahaSession(tenantId)
    else if (action === "sync") result = await syncWahaSession(tenantId)
    else if (["start","restart","stop","logout"].includes(action)) {
      result = await controlWahaSession(
        tenantId,
        action as "start" | "restart" | "stop" | "logout",
      )
    } else {
      return Response.json({ error: "invalid_action" }, { status: 400 })
    }

    const connection = await getStoredWahaConnection(tenantId)
    const live = result && typeof result === "object"
      ? result as Record<string, unknown>
      : null

    return Response.json({
      ok: true,
      action,
      connection,
      live: live ? {
        name: typeof live.name === "string" ? live.name : null,
        status: typeof live.status === "string" ? live.status : null,
        me: live.me && typeof live.me === "object" ? live.me : null,
      } : null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
