import { timingSafeEqual } from "node:crypto"
import { ingestWhatsappInbound } from "@/lib/server/whatsapp/ingest"
import { handleWhatsappRegistrationInbound } from "@/lib/server/registration/service"

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a,b)
}

function secretOk(request: Request) {
  const expected = String(process.env.WHATSAPP_WEBHOOK_SECRET || "")
  const received = request.headers.get("x-crm-webhook-secret") || ""
  return Boolean(expected && received && secureEqual(expected,received))
}

function stringAt(value: unknown, ...paths: string[][]): string {
  for (const path of paths) {
    let current: unknown = value
    for (const key of path) {
      current = current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined
    }
    if (typeof current === "string" && current.trim()) return current.trim()
  }
  return ""
}

function phoneFromJid(value: string) {
  const local = value.replace(/@.*$/,"")
  const digits = local.replace(/\D/g,"")
  return digits ? `+${digits}` : null
}

export async function POST(request: Request) {
  if (!secretOk(request)) return Response.json({ error: "unauthorized" }, { status: 401 })

  const tenantId = new URL(request.url).searchParams.get("tenant") || ""
  if (!tenantId) return Response.json({ error: "tenant missing" }, { status: 400 })

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "invalid payload" }, { status: 400 })
  }

  const event = payload as Record<string, unknown>
  const externalMessageId = stringAt(event,["payload","id"],["id"])
  const from = stringAt(event,["payload","from"],["from"])
  const text = stringAt(event,["payload","body"],["body"],["text"])
  const displayName = stringAt(
    event,
    ["payload","_data","notifyName"],
    ["payload","pushName"],
    ["pushName"],
  ) || null

  if (!externalMessageId || !from || !text) return Response.json({ ignored: true })

  const result = await ingestWhatsappInbound({
    tenantId,
    externalContactId: from,
    externalMessageId,
    phoneE164: phoneFromJid(from),
    displayName,
    text,
    receivedAt: new Date().toISOString(),
    metadata: { provider: "waha", event: event.event || null },
  })

  if (result.duplicate) {
    return Response.json({ ok: true, duplicate: true, result })
  }

  const registration = await handleWhatsappRegistrationInbound({
    tenantId,
    contactId: result.contactId,
    conversationId: result.conversationId,
    text,
    contactCreated: result.contactCreated,
  }).catch(error => ({
    handled: false,
    error: error instanceof Error ? error.message : String(error),
  }))

  return Response.json({ ok: true, result, registration })
}
