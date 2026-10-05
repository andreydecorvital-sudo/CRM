import {
  getOpportunityPreferenceByToken,
  updateOpportunityPreferenceByToken,
  type OpportunityChannel,
  type OpportunityFrequency,
} from "@/lib/server/opportunities/service"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHANNELS = new Set<OpportunityChannel>(["whatsapp","email"])
const FREQUENCIES = new Set<OpportunityFrequency>(["realtime","daily","weekly","important_only"])

function safeToken(value: string) {
  const token = String(value || "").trim()
  if (!UUID.test(token)) throw new Error("Preferência inválida.")
  return token
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params
    const token = safeToken(rawToken)
    const preference = await getOpportunityPreferenceByToken(token)
    if (!preference) return Response.json({ error: "not_found" }, { status: 404 })

    return Response.json({
      enabled: preference.enabled,
      channels: preference.channels,
      topics: preference.topics,
      frequency: preference.frequency,
      maxPerWeek: preference.max_per_week,
    })
  } catch {
    return Response.json({ error: "invalid_preference" }, { status: 400 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params
    const token = safeToken(rawToken)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.enabled !== "boolean") {
      return Response.json({ error: "invalid_payload" }, { status: 400 })
    }

    const channels = Array.isArray(body.channels)
      ? body.channels
          .map(value => String(value).trim() as OpportunityChannel)
          .filter(channel => CHANNELS.has(channel))
      : []

    const frequency = String(body.frequency || "important_only") as OpportunityFrequency
    if (!FREQUENCIES.has(frequency)) {
      return Response.json({ error: "invalid_frequency" }, { status: 400 })
    }

    if (body.enabled && channels.length === 0) {
      return Response.json({ error: "channel_required" }, { status: 400 })
    }

    const result = await updateOpportunityPreferenceByToken({
      token,
      enabled: body.enabled,
      channels: [...new Set(channels)],
      frequency,
    })

    return Response.json({ ok: true, preference: result })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "invalid_preference" },
      { status: 400 },
    )
  }
}
