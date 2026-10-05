import { PostHog } from "posthog-node"

type SafeProperty = string | number | boolean | null

const SENSITIVE_KEY = /(email|phone|telefone|message|mensagem|body|text|prompt|response|token|secret|password|senha|authorization|cookie)/i

function safeDistinctId(value: string) {
  const id = String(value || "").trim().slice(0,200)
  if (!id) throw new Error("PostHog distinctId obrigatório.")
  if (id.includes("@") || /^\+?\d{8,}$/.test(id)) {
    throw new Error("PostHog distinctId não pode ser e-mail ou telefone.")
  }
  return id
}

function sanitizeProperties(properties: Record<string, unknown> = {}) {
  const safe: Record<string,SafeProperty> = {}

  for (const [rawKey,value] of Object.entries(properties)) {
    const key = rawKey.trim().slice(0,120)
    if (!key || SENSITIVE_KEY.test(key)) continue

    if (
      value === null
      || typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
    ) {
      safe[key] = typeof value === "string" ? value.slice(0,500) : value
    }
  }

  return safe
}

export async function captureProductEvent(input: {
  tenantId: string
  distinctId: string
  event: string
  properties?: Record<string, unknown>
}) {
  const token = String(process.env.POSTHOG_PROJECT_TOKEN || "").trim()
  if (!token) return { sent:false,reason:"posthog-disabled" as const }

  const host = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com")
    .trim()
    .replace(/\/+$/,"")

  const event = String(input.event || "").trim().slice(0,200)
  if (!event) throw new Error("Nome do evento PostHog obrigatório.")

  const client = new PostHog(token,{
    host,
    flushAt:1,
    flushInterval:0,
  })

  try {
    client.capture({
      distinctId:safeDistinctId(input.distinctId),
      event,
      properties:{
        ...sanitizeProperties(input.properties),
        tenant_id:String(input.tenantId || "").slice(0,80),
        service:String(process.env.OTEL_SERVICE_NAME || "crm-platform").slice(0,120),
        environment:String(process.env.VERCEL_ENV || process.env.NODE_ENV || "development").slice(0,80),
      },
    })
    await client.shutdown()
    return { sent:true as const }
  } catch (error) {
    await client.shutdown().catch(() => undefined)
    throw error
  }
}
