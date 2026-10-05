import { assertInternalRequest } from "@/lib/server/internal-auth"
import { getWahaQr } from "@/lib/server/whatsapp/waha-admin"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    assertInternalRequest(request)
    const { tenantId } = await params
    const result = await getWahaQr(tenantId)

    return Response.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") {
      return Response.json({ error: "unauthorized" }, { status: 401 })
    }
    return Response.json({ error: "whatsapp_qr_error", message }, { status: 400 })
  }
}
