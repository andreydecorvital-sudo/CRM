export type DomainEvent = {
  id: string
  tenant_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string | null
  contact_id: string | null
  payload: Record<string, unknown>
  occurred_at: string
  status: "pending" | "processing" | "processed" | "failed"
  attempts: number
}

export type AutomationCondition = {
  path: string
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists" | "in"
  value?: unknown
}

export type AutomationConditions = {
  all?: AutomationCondition[]
  any?: AutomationCondition[]
}

export type AutomationAction =
  | { type: "task.create"; params: Record<string, unknown> }
  | { type: "contact.tag"; params: Record<string, unknown> }
  | { type: "deal.follow_up"; params: Record<string, unknown> }
  | { type: "conversation.set_department"; params: Record<string, unknown> }
  | { type: "message.queue"; params: Record<string, unknown> }
  | { type: "notification.create"; params: Record<string, unknown> }

export type AutomationRule = {
  id: string
  tenant_id: string
  name: string
  trigger_event: string
  conditions: AutomationConditions
  actions: AutomationAction[]
  enabled: boolean
  priority: number
  stop_on_match: boolean
  cooldown_seconds: number
  last_triggered_at: string | null
}

export type JobRow = {
  id: string
  tenant_id: string
  kind: "automation" | "outbound_message" | "webhook" | "notification" | "maintenance" | "contact_import" | "event_router" | "action_execution"
  status: "queued" | "running" | "succeeded" | "failed" | "dead" | "cancelled"
  attempts: number
  max_attempts: number
  locked_by: string | null
  payload: Record<string, unknown>
}
