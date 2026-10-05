import { createHash } from "node:crypto"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { policyForDomainEvent } from "./policy"
import type {
  EventRouterDispatch,
  RouterCapability,
  RouterDomainEvent,
} from "./contracts"

function fingerprint(eventId: string, capability: RouterCapability, policyKey: string) {
  return createHash("sha256")
    .update(`${eventId}|${capability}|${policyKey}`)
    .digest("hex")
    .slice(0,40)
}

function summary(event: RouterDomainEvent, capability: RouterCapability) {
  const custom = typeof event.payload?.summary === "string"
    ? event.payload.summary.trim().slice(0,2000)
    : ""
  return custom || `${event.event_type} → ${capability}`
}

async function loadEvent(eventId: string) {
  const rows = await supabaseRest<RouterDomainEvent[]>(
    "GET",
    `/domain_events?id=eq.${encodeURIComponent(eventId)}&select=id,tenant_id,event_type,aggregate_type,aggregate_id,contact_id,payload,occurred_at,created_at&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function loadExisting(eventId: string, capability: RouterCapability) {
  const rows = await supabaseRest<EventRouterDispatch[]>(
    "GET",
    `/event_router_dispatches?event_id=eq.${encodeURIComponent(eventId)}&capability=eq.${encodeURIComponent(capability)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function routeDomainEvent(eventId: string) {
  const event = await loadEvent(eventId)
  if (!event) throw new Error("Domain Event não encontrado.")

  const route = policyForDomainEvent(event)
  const dispatches: EventRouterDispatch[] = []

  for (const capability of route.capabilities) {
    const existing = await loadExisting(event.id,capability)
    if (existing) {
      dispatches.push(existing)
      continue
    }

    const rows = await supabaseRest<EventRouterDispatch[]>("POST","/event_router_dispatches",[{
      tenant_id: event.tenant_id,
      event_id: event.id,
      capability,
      severity: route.severity,
      wake_mode: route.wakeMode,
      policy_key: route.key,
      fingerprint: fingerprint(event.id,capability,route.key),
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      contact_id: event.contact_id,
      summary: summary(event,capability),
      payload: {
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        eventPayload: event.payload,
      },
      status: "routed",
    }])

    const created = Array.isArray(rows) ? rows[0] : null
    if (created) dispatches.push(created)
  }

  return {
    eventId: event.id,
    eventType: event.event_type,
    policy: route,
    dispatches,
  }
}

export async function listRouterDispatches(input: {
  tenantId: string
  capability?: RouterCapability
  status?: EventRouterDispatch["status"]
  limit?: number
}) {
  const filters = [
    `tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
    input.capability ? `capability=eq.${encodeURIComponent(input.capability)}` : "",
    input.status ? `status=eq.${input.status}` : "",
  ].filter(Boolean).join("&")

  return supabaseRest<EventRouterDispatch[]>(
    "GET",
    `/event_router_dispatches?${filters}&select=*&order=routed_at.desc&limit=${Math.min(Math.max(Math.trunc(input.limit ?? 50),1),200)}`,
  )
}
