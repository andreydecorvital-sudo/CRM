import { createTask } from "@/lib/server/tasks/service"
import { supabaseRest } from "@/lib/server/supabase/rest"
import type {
  ActionAdapter,
  AuthorizedIntent,
} from "../contracts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function str(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0,max)
}

function uuid(value: unknown) {
  const normalized = str(value,60)
  return UUID.test(normalized) ? normalized : null
}

function payloadUuid(intent: AuthorizedIntent, key: string) {
  return uuid(intent.payload?.[key])
}

async function requireTenantEntity(input: {
  table: "contacts" | "deals" | "conversations"
  tenantId: string
  id: string
}) {
  const rows = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/${input.table}?id=eq.${encodeURIComponent(input.id)}&tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=id&limit=1`,
  )
  if (!Array.isArray(rows) || !rows[0]) {
    throw new Error(`${input.table} fora do tenant ou inexistente.`)
  }
  return rows[0]
}

const taskCreateAdapter: ActionAdapter = {
  key: "internal.task.create.v1",
  actionType: "task.create",
  semantics: "idempotent",

  async rehydrate(intent) {
    const contactId = payloadUuid(intent,"contactId")
      || (intent.target_type === "contact" ? intent.target_id : null)
    const dealId = payloadUuid(intent,"dealId")
      || (intent.target_type === "deal" ? intent.target_id : null)
    const conversationId = payloadUuid(intent,"conversationId")
      || (intent.target_type === "conversation" ? intent.target_id : null)
    const assignedTo = payloadUuid(intent,"assignedTo")

    if (contactId) await requireTenantEntity({ table:"contacts",tenantId:intent.tenant_id,id:contactId })
    if (dealId) await requireTenantEntity({ table:"deals",tenantId:intent.tenant_id,id:dealId })
    if (conversationId) await requireTenantEntity({ table:"conversations",tenantId:intent.tenant_id,id:conversationId })

    if (assignedTo) {
      const members = await supabaseRest<Array<{ user_id: string }>>(
        "GET",
        `/tenant_members?tenant_id=eq.${encodeURIComponent(intent.tenant_id)}&user_id=eq.${encodeURIComponent(assignedTo)}&select=user_id&limit=1`,
      )
      if (!Array.isArray(members) || !members[0]) throw new Error("Responsável fora do tenant.")
    }

    const dueAtRaw = str(intent.payload?.dueAt,120)
    const dueInMinutes = Number(intent.payload?.dueInMinutes ?? 60)
    const dueAt = dueAtRaw
      ? new Date(dueAtRaw)
      : new Date(Date.now() + Math.max(1,Number.isFinite(dueInMinutes) ? dueInMinutes : 60) * 60_000)

    if (Number.isNaN(dueAt.getTime())) throw new Error("Prazo da tarefa inválido.")

    return {
      contactId,
      dealId,
      conversationId,
      assignedTo,
      dueAt: dueAt.toISOString(),
    }
  },

  async execute(intent,facts) {
    const automationKey = `router:${intent.action_key}`
    const existing = await supabaseRest<Array<{ id: string; status: string; due_at: string }>>(
      "GET",
      `/tasks?tenant_id=eq.${encodeURIComponent(intent.tenant_id)}&automation_key=eq.${encodeURIComponent(automationKey)}&select=id,status,due_at&limit=1`,
    )
    if (Array.isArray(existing) && existing[0]) {
      return { task: existing[0], reused: true }
    }

    const title = str(intent.payload?.title,180) || "Próxima ação"
    const description = str(intent.payload?.description,4000) || null
    const kind = ["follow_up","call","whatsapp","email","meeting","internal"].includes(str(intent.payload?.kind))
      ? str(intent.payload?.kind) as "follow_up" | "call" | "whatsapp" | "email" | "meeting" | "internal"
      : "follow_up"
    const priority = ["low","normal","high","urgent"].includes(str(intent.payload?.priority))
      ? str(intent.payload?.priority) as "low" | "normal" | "high" | "urgent"
      : "normal"

    const rows = await createTask({
      tenantId: intent.tenant_id,
      contactId: facts.contactId as string | null,
      dealId: facts.dealId as string | null,
      conversationId: facts.conversationId as string | null,
      assignedTo: facts.assignedTo as string | null,
      title,
      description,
      kind,
      priority,
      dueAt: String(facts.dueAt),
      autoCreated: true,
      automationKey,
      metadata: {
        source: "crm-router",
        actionKey: intent.action_key,
        authorizedIntentId: intent.id,
      },
    })

    return {
      task: Array.isArray(rows) ? rows[0] ?? null : null,
      reused: false,
    }
  },

  async verify(intent) {
    const automationKey = `router:${intent.action_key}`
    const rows = await supabaseRest<Array<{ id: string; status: string; due_at: string }>>(
      "GET",
      `/tasks?tenant_id=eq.${encodeURIComponent(intent.tenant_id)}&automation_key=eq.${encodeURIComponent(automationKey)}&select=id,status,due_at&limit=1`,
    )
    const task = Array.isArray(rows) ? rows[0] : null
    return {
      verified: Boolean(task),
      details: { task: task ?? null, automationKey },
    }
  },
}

const contactTagAdapter: ActionAdapter = {
  key: "internal.contact.tag.v1",
  actionType: "contact.tag",
  semantics: "idempotent",

  async rehydrate(intent) {
    const contactId = payloadUuid(intent,"contactId")
      || (intent.target_type === "contact" ? intent.target_id : null)
    const tag = str(intent.payload?.tag,120)
    if (!contactId || !tag) throw new Error("contact.tag exige contato e tag.")

    await requireTenantEntity({ table:"contacts",tenantId:intent.tenant_id,id:contactId })
    return {
      contactId,
      tag,
      color: str(intent.payload?.color,32) || null,
    }
  },

  async execute(intent,facts) {
    return supabaseRest<Record<string, unknown>>("POST","/rpc/crm_tag_contact",{
      p_tenant_id: intent.tenant_id,
      p_contact_id: facts.contactId,
      p_tag_name: facts.tag,
      p_color: facts.color,
    })
  },

  async verify(_intent,facts,result) {
    const contactId = String(facts.contactId)
    const tagId = uuid(result.tagId)
    if (!tagId) return { verified:false,details:{ reason:"tag-id-missing" } }

    const rows = await supabaseRest<Array<{ contact_id: string; tag_id: string }>>(
      "GET",
      `/contact_tags?contact_id=eq.${encodeURIComponent(contactId)}&tag_id=eq.${encodeURIComponent(tagId)}&select=contact_id,tag_id&limit=1`,
    )
    const linked = Boolean(Array.isArray(rows) && rows[0])
    return {
      verified: linked,
      details: { contactId,tagId,linked },
    }
  },
}

const dealFollowUpAdapter: ActionAdapter = {
  key: "internal.deal.follow-up.v1",
  actionType: "deal.follow_up",
  semantics: "idempotent",

  async rehydrate(intent) {
    const dealId = payloadUuid(intent,"dealId")
      || (intent.target_type === "deal" ? intent.target_id : null)
    if (!dealId) throw new Error("deal.follow_up exige dealId.")

    const rows = await supabaseRest<Array<{
      id: string
      tenant_id: string
      won_at: string | null
      lost_at: string | null
      next_followup_at: string | null
    }>>(
      "GET",
      `/deals?id=eq.${encodeURIComponent(dealId)}&tenant_id=eq.${encodeURIComponent(intent.tenant_id)}&select=id,tenant_id,won_at,lost_at,next_followup_at&limit=1`,
    )
    const deal = Array.isArray(rows) ? rows[0] : null
    if (!deal) throw new Error("Deal fora do tenant ou inexistente.")
    if (deal.won_at || deal.lost_at) throw new Error("Deal já está encerrado.")

    const dueRaw = str(intent.payload?.dueAt,120)
    const minutes = Number(intent.payload?.dueInMinutes ?? 1440)
    const dueAt = dueRaw
      ? new Date(dueRaw)
      : new Date(Date.now() + Math.max(1,Number.isFinite(minutes) ? minutes : 1440) * 60_000)

    if (Number.isNaN(dueAt.getTime())) throw new Error("Follow-up inválido.")
    return { dealId,previousDueAt: deal.next_followup_at,dueAt:dueAt.toISOString() }
  },

  async execute(intent,facts) {
    const dueAt = String(facts.dueAt)
    await supabaseRest(
      "PATCH",
      `/deals?id=eq.${encodeURIComponent(String(facts.dealId))}&tenant_id=eq.${encodeURIComponent(intent.tenant_id)}`,
      { next_followup_at: dueAt,updated_at:new Date().toISOString() },
    )
    return { dealId:facts.dealId,dueAt }
  },

  async verify(intent,facts,result) {
    const rows = await supabaseRest<Array<{ id: string; next_followup_at: string | null }>>(
      "GET",
      `/deals?id=eq.${encodeURIComponent(String(facts.dealId))}&tenant_id=eq.${encodeURIComponent(intent.tenant_id)}&select=id,next_followup_at&limit=1`,
    )
    const deal = Array.isArray(rows) ? rows[0] : null
    const expected = String(result.dueAt || "")
    const actual = deal?.next_followup_at || ""
    const verified = Boolean(deal && expected && Date.parse(actual) === Date.parse(expected))
    return {
      verified,
      details: { dealId:facts.dealId,expected,actual },
    }
  },
}

export const internalActionAdapters: ActionAdapter[] = [
  taskCreateAdapter,
  contactTagAdapter,
  dealFollowUpAdapter,
]
