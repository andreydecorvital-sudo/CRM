import { authenticatePublicApi, meterPublicApi } from "@/lib/server/public-api/auth"
import { supabaseRest } from "@/lib/server/supabase/rest"

type ContactInput = {
  externalId?: string
  displayName?: string
  phoneE164?: string
  email?: string
  city?: string
  metadata?: Record<string, unknown>
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 })
  if (message.includes("Limite do plano")) return Response.json({ error: "quota_exceeded", message }, { status: 429 })
  return Response.json({ error: "bad_request", message }, { status: 400 })
}

export async function GET(request: Request) {
  let context
  try {
    context = await authenticatePublicApi(request, "contacts:read")
    const url = new URL(request.url)
    const limitRaw = Number(url.searchParams.get("limit") || 50)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw),1),100) : 50
    const externalId = String(url.searchParams.get("externalId") || "").trim()
    const phone = String(url.searchParams.get("phone") || "").trim()

    const filters = [
      `tenant_id=eq.${encodeURIComponent(context.tenantId)}`,
      externalId ? `external_contact_id=eq.${encodeURIComponent(externalId)}` : "",
      phone ? `phone_e164=eq.${encodeURIComponent(phone)}` : "",
    ].filter(Boolean).join("&")

    const rows = await supabaseRest<Record<string, unknown>[]>(
      "GET",
      `/contacts?${filters}&select=id,external_contact_id,display_name,phone_e164,email,city,temperature,owner_user_id,first_seen_at,last_seen_at,created_at,updated_at&order=created_at.desc&limit=${limit}`,
    )

    await meterPublicApi(context, "GET /api/v1/contacts")
    return Response.json({ data: Array.isArray(rows) ? rows : [], requestId: context.requestId })
  } catch (error) {
    if (context) await meterPublicApi(context, "GET /api/v1/contacts").catch(() => null)
    return apiError(error)
  }
}

export async function POST(request: Request) {
  let context
  try {
    context = await authenticatePublicApi(request, "contacts:write")
    const body = await request.json().catch(() => null) as ContactInput | null
    if (!body) throw new Error("JSON inválido.")

    const externalId = String(body.externalId || "").trim().slice(0,240)
    if (!externalId) throw new Error("externalId obrigatório.")

    const result = await supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_upsert_contact", {
      p_tenant_id: context.tenantId,
      p_external_contact_id: externalId,
      p_display_name: String(body.displayName || "").trim().slice(0,240) || null,
      p_phone_e164: String(body.phoneE164 || "").trim().slice(0,32) || null,
      p_email: String(body.email || "").trim().slice(0,320) || null,
      p_city: String(body.city || "").trim().slice(0,160) || null,
      p_metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    })

    await meterPublicApi(context, "POST /api/v1/contacts")
    return Response.json({ data: result, requestId: context.requestId }, { status: 200 })
  } catch (error) {
    if (context) await meterPublicApi(context, "POST /api/v1/contacts").catch(() => null)
    return apiError(error)
  }
}
