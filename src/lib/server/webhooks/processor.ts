import { createHmac } from "node:crypto"
import { isIP } from "node:net"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { recordUsage } from "@/lib/server/billing/entitlements"

type DeliveryRow = {
  id: string
  tenant_id: string
  subscription_id: string
  event_id: string
  status: "pending" | "sending" | "succeeded" | "failed" | "dead" | "cancelled"
  attempts: number
}

type SubscriptionRow = {
  id: string
  tenant_id: string
  name: string
  url: string
  event_types: string[]
  secret_ref: string | null
  headers: Record<string, unknown>
  active: boolean
}

type EventRow = {
  id: string
  tenant_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string | null
  contact_id: string | null
  payload: Record<string, unknown>
  occurred_at: string
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0
}

function safeWebhookUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:") throw new Error("Webhook exige HTTPS.")
  const host = url.hostname.toLowerCase()
  if (
    host === "localhost"
    || host.endsWith(".local")
    || host === "metadata.google.internal"
    || host === "169.254.169.254"
    || (isIP(host) === 4 && isPrivateIpv4(host))
    || (isIP(host) === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")))
  ) {
    throw new Error("Destino de webhook privado/local bloqueado.")
  }
  return url
}

function secretFromRef(ref: string | null) {
  if (!ref) return null
  if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(ref)) throw new Error("secret_ref inválido.")
  const secret = process.env[ref]
  if (!secret) throw new Error(`Secret de webhook não configurado: ${ref}`)
  return secret
}

function customHeaders(input: Record<string, unknown>) {
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(input || {})) {
    const normalized = key.trim().toLowerCase()
    if (!normalized || ["host","content-length","x-crm-signature","x-crm-delivery","x-crm-event"].includes(normalized)) continue
    if (typeof value === "string" && value.length <= 1000) output[key] = value
  }
  return output
}

export async function processWebhookDelivery(deliveryId: string) {
  const deliveries = await supabaseRest<DeliveryRow[]>(
    "GET",
    `/webhook_deliveries?id=eq.${encodeURIComponent(deliveryId)}&select=*&limit=1`,
  )
  const delivery = Array.isArray(deliveries) ? deliveries[0] : null
  if (!delivery) throw new Error("Entrega de webhook não encontrada.")
  if (["succeeded","cancelled","dead"].includes(delivery.status)) return { skipped: true, status: delivery.status }

  const [subscriptions, events] = await Promise.all([
    supabaseRest<SubscriptionRow[]>(
      "GET",
      `/webhook_subscriptions?id=eq.${encodeURIComponent(delivery.subscription_id)}&tenant_id=eq.${encodeURIComponent(delivery.tenant_id)}&select=*&limit=1`,
    ),
    supabaseRest<EventRow[]>(
      "GET",
      `/domain_events?id=eq.${encodeURIComponent(delivery.event_id)}&tenant_id=eq.${encodeURIComponent(delivery.tenant_id)}&select=*&limit=1`,
    ),
  ])

  const subscription = Array.isArray(subscriptions) ? subscriptions[0] : null
  const event = Array.isArray(events) ? events[0] : null
  if (!subscription || !event) throw new Error("Webhook sem subscription/event válido.")

  if (!subscription.active) {
    await supabaseRest("PATCH", `/webhook_deliveries?id=eq.${encodeURIComponent(delivery.id)}`, {
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    return { skipped: true, status: "cancelled" }
  }

  const url = safeWebhookUrl(subscription.url)
  const body = JSON.stringify({
    id: event.id,
    type: event.event_type,
    tenantId: event.tenant_id,
    occurredAt: event.occurred_at,
    aggregate: {
      type: event.aggregate_type,
      id: event.aggregate_id,
    },
    contactId: event.contact_id,
    data: event.payload,
  })

  const secret = secretFromRef(subscription.secret_ref)
  const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : null
  const attempt = delivery.attempts + 1
  const startedAt = new Date().toISOString()

  await supabaseRest("PATCH", `/webhook_deliveries?id=eq.${encodeURIComponent(delivery.id)}`, {
    status: "sending",
    attempts: attempt,
    updated_at: startedAt,
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MIRA-CRM-Webhooks/1.0",
        "X-CRM-Delivery": delivery.id,
        "X-CRM-Event": event.event_type,
        ...(signature ? { "X-CRM-Signature": `sha256=${signature}` } : {}),
        ...customHeaders(subscription.headers),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })

    const responseText = (await response.text().catch(() => "")).slice(0, 1000)
    if (!response.ok) {
      throw new Error(`Webhook HTTP ${response.status}: ${responseText || response.statusText}`)
    }

    const deliveredAt = new Date().toISOString()
    await supabaseRest("PATCH", `/webhook_deliveries?id=eq.${encodeURIComponent(delivery.id)}`, {
      status: "succeeded",
      last_status_code: response.status,
      last_error: null,
      response_excerpt: responseText || null,
      delivered_at: deliveredAt,
      updated_at: deliveredAt,
    })

    await recordUsage({
      tenantId: delivery.tenant_id,
      metric: "webhooks.delivered",
      dedupeKey: `usage:webhook:${delivery.id}`,
      metadata: { eventId: delivery.event_id, statusCode: response.status },
    }).catch(() => null)

    return { delivered: true, statusCode: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const nextAttempt = new Date(Date.now() + Math.min(3600, 15 * 2 ** Math.max(attempt - 1, 0)) * 1000).toISOString()

    await supabaseRest("PATCH", `/webhook_deliveries?id=eq.${encodeURIComponent(delivery.id)}`, {
      status: "failed",
      last_error: message.slice(0, 4000),
      next_attempt_at: nextAttempt,
      updated_at: new Date().toISOString(),
    }).catch(() => null)

    throw error
  }
}
