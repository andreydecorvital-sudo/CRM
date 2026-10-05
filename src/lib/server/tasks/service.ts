import { followUpAutomationKey, type TaskKind, type TaskPriority } from "@/lib/domain/tasks"
import { supabaseRest } from "@/lib/server/supabase/rest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeUuid(value: string | null | undefined, label: string) {
  if (!value) return null
  const normalized = String(value).trim()
  if (!UUID.test(normalized)) throw new Error(`${label} inválido.`)
  return normalized
}

export async function createTask(input: {
  tenantId: string
  title: string
  dueAt: string
  priority?: TaskPriority
  kind?: TaskKind
  contactId?: string | null
  dealId?: string | null
  conversationId?: string | null
  assignedTo?: string | null
  description?: string | null
  automationKey?: string | null
  autoCreated?: boolean
  metadata?: Record<string, unknown>
}) {
  const tenantId = safeUuid(input.tenantId, "Tenant")
  if (!tenantId) throw new Error("Tenant obrigatório.")
  const title = String(input.title || "").trim().slice(0, 180)
  if (!title) throw new Error("Título obrigatório.")
  const dueAt = new Date(input.dueAt)
  if (Number.isNaN(dueAt.getTime())) throw new Error("Prazo inválido.")

  return supabaseRest<Record<string, unknown>[]>("POST", "/tasks", [{
    tenant_id: tenantId,
    contact_id: safeUuid(input.contactId, "Contato"),
    deal_id: safeUuid(input.dealId, "Negociação"),
    conversation_id: safeUuid(input.conversationId, "Conversa"),
    assigned_to: safeUuid(input.assignedTo, "Responsável"),
    title,
    description: String(input.description || "").trim().slice(0, 4000) || null,
    kind: input.kind ?? "follow_up",
    status: "open",
    priority: input.priority ?? "normal",
    due_at: dueAt.toISOString(),
    auto_created: input.autoCreated === true,
    automation_key: input.automationKey ? String(input.automationKey).slice(0, 240) : null,
    metadata: input.metadata ?? {},
  }])
}

export async function ensureDealFollowUp(input: {
  tenantId: string
  dealId: string
  contactId?: string | null
  assignedTo?: string | null
  dueAt: string
  title?: string
}) {
  const dealId = safeUuid(input.dealId, "Negociação")
  if (!dealId) throw new Error("Negociação obrigatória.")
  return createTask({
    tenantId: input.tenantId,
    dealId,
    contactId: input.contactId,
    assignedTo: input.assignedTo,
    dueAt: input.dueAt,
    title: input.title || "Follow-up comercial",
    kind: "follow_up",
    autoCreated: true,
    automationKey: followUpAutomationKey(dealId),
    metadata: { source: "deal-followup" },
  })
}
