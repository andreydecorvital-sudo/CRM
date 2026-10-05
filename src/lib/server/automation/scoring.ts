import { evaluateCondition } from "./conditions"
import type { DomainEvent } from "./types"
import { supabaseRest } from "@/lib/server/supabase/rest"

type ScoreRule = {
  id: string
  tenant_id: string
  name: string
  event_type: string | null
  field_path: string
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists" | "in"
  compare_value: unknown
  points: number
  enabled: boolean
}

export async function scoreEvent(event: DomainEvent) {
  if (!event.contact_id) return { applied: 0 }

  const rules = await supabaseRest<ScoreRule[]>(
    "GET",
    `/lead_score_rules?tenant_id=eq.${encodeURIComponent(event.tenant_id)}&enabled=eq.true&select=id,tenant_id,name,event_type,field_path,operator,compare_value,points,enabled&order=priority.asc`,
  )

  let applied = 0
  const subject = {
    eventType: event.event_type,
    aggregateType: event.aggregate_type,
    aggregateId: event.aggregate_id,
    contactId: event.contact_id,
    payload: event.payload,
  }

  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule.event_type && rule.event_type !== event.event_type) continue

    const matches = evaluateCondition(subject, {
      path: rule.field_path,
      op: rule.operator,
      value: rule.compare_value,
    })
    if (!matches) continue

    const created = await supabaseRest<boolean>("POST", "/rpc/crm_apply_score_event", {
      p_tenant_id: event.tenant_id,
      p_contact_id: event.contact_id,
      p_rule_id: rule.id,
      p_event_key: `score:${event.id}:${rule.id}`,
      p_points: rule.points,
      p_reason: rule.name,
      p_metadata: { eventId: event.id, eventType: event.event_type },
    })

    if (created) applied += 1
  }

  return { applied }
}
