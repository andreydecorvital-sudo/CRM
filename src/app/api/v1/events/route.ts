import { authenticatePublicApi, meterPublicApi } from "@/lib/server/public-api/auth"
import { supabaseRest } from "@/lib/server/supabase/rest"

type EventInput = {
  type?: string
  aggregateType?: string
  aggregateId?: string | null
  contactId?: string | null
  payload?: Record<string, unknown>
  dedupeKey?: string | null
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 })
  if (message.includes("Limite do plano")) return Response.json({ error: "quota_exceeded", message }, { status: 429 })
  return Response.json({ error: "bad_request", message }, { status: 400 })
}

export async function POST(request: Request) {
  let context
  try {
    context = await authenticatePublicApi(request, "events:write")
    const body = await request.json().catch(() => null) as EventInput | null
    if (!body) throw new Error("JSON inválido.")

    const eventType = String(body.type || "").trim().slice(0,120)
    const aggregateType = String(body.aggregateType || "").trim().slice(0,80)
    if (!eventType || !aggregateType) throw new Error("type e aggregateType são obrigatórios.")

    const id = await supabaseRest<string>("POST", "/rpc/crm_emit_event", {
      p_tenant_id: context.tenantId,
      p_event_type: eventType,
      p_aggregate_type: aggregateType,
      p_aggregate_id: body.aggregateId || null,
      p_contact_id: body.contactId || null,
      p_payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      p_dedupe_key: String(body.dedupeKey || "").trim().slice(0,240) || null,
    })

    await meterPublicApi(context, "POST /api/v1/events")
    return Response.json({ data: { id }, requestId: context.requestId }, { status: 202 })
  } catch (error) {
    if (context) await meterPublicApi(context, "POST /api/v1/events").catch(() => null)
    return apiError(error)
  }
}
