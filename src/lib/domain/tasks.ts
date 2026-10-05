export type TaskPriority = "low" | "normal" | "high" | "urgent"
export type TaskKind = "follow_up" | "call" | "whatsapp" | "email" | "meeting" | "internal"

export function taskUrgency(input: { dueAt: string; priority: TaskPriority }, now = new Date()) {
  const dueAt = new Date(input.dueAt)
  if (Number.isNaN(dueAt.getTime())) return "normal" as const
  if (dueAt.getTime() < now.getTime()) return "overdue" as const
  if (input.priority === "urgent") return "urgent" as const
  if (dueAt.getTime() - now.getTime() <= 3_600_000) return "soon" as const
  return "normal" as const
}

export function followUpAutomationKey(dealId: string) {
  return `deal-followup:${dealId}`
}
