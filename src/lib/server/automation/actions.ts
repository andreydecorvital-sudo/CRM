import { createTask } from "@/lib/server/tasks/service"
import { routeConversation } from "@/lib/server/departments/routing"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { renderValue } from "./render"
import type { AutomationAction, AutomationRule, DomainEvent } from "./types"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ActionContext = {
  event: DomainEvent
  rule: AutomationRule
  actionIndex: number
}

function str(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max)
}

function uuid(value: unknown) {
  const normalized = str(value, 60)
  return UUID.test(normalized) ? normalized : null
}

function automationDedupe(context: ActionContext, suffix: string) {
  return `automation:${context.event.id}:${context.rule.id}:${context.actionIndex}:${suffix}`
}

export async function executeAutomationAction(action: AutomationAction, context: ActionContext) {
  const rendered = renderValue(action.params, {
    event: {
      id: context.event.id,
      eventType: context.event.event_type,
      aggregateType: context.event.aggregate_type,
      aggregateId: context.event.aggregate_id,
      contactId: context.event.contact_id,
      payload: context.event.payload,
      occurredAt: context.event.occurred_at,
    },
    rule: {
      id: context.rule.id,
      name: context.rule.name,
    },
  }) as Record<string, unknown>

  switch (action.type) {
    case "task.create": {
      const dueInMinutes = Number(rendered.dueInMinutes ?? 0)
      const dueAtRaw = str(rendered.dueAt)
      const dueAt = dueAtRaw
        ? new Date(dueAtRaw)
        : new Date(Date.now() + Math.max(1, Number.isFinite(dueInMinutes) ? dueInMinutes : 60) * 60_000)

      const result = await createTask({
        tenantId: context.event.tenant_id,
        contactId: uuid(rendered.contactId) || context.event.contact_id,
        dealId: uuid(rendered.dealId) || (context.event.aggregate_type === "deal" ? context.event.aggregate_id : null),
        conversationId: uuid(rendered.conversationId),
        assignedTo: uuid(rendered.assignedTo),
        title: str(rendered.title, 180) || `Ação automática · ${context.rule.name}`,
        description: str(rendered.description, 4000) || null,
        kind: ["follow_up","call","whatsapp","email","meeting","internal"].includes(str(rendered.kind))
          ? str(rendered.kind) as "follow_up" | "call" | "whatsapp" | "email" | "meeting" | "internal"
          : "follow_up",
        priority: ["low","normal","high","urgent"].includes(str(rendered.priority))
          ? str(rendered.priority) as "low" | "normal" | "high" | "urgent"
          : "normal",
        dueAt: dueAt.toISOString(),
        autoCreated: true,
        automationKey: automationDedupe(context, "task"),
        metadata: { automationRuleId: context.rule.id, eventId: context.event.id },
      })
      return { type: action.type, result }
    }

    case "contact.tag": {
      const contactId = uuid(rendered.contactId) || context.event.contact_id
      const tagName = str(rendered.tag, 120)
      if (!contactId || !tagName) throw new Error("contact.tag exige contato e tag.")

      const result = await supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_tag_contact", {
        p_tenant_id: context.event.tenant_id,
        p_contact_id: contactId,
        p_tag_name: tagName,
        p_color: str(rendered.color, 32) || null,
      })
      return { type: action.type, result }
    }

    case "deal.follow_up": {
      const dealId = uuid(rendered.dealId) || (context.event.aggregate_type === "deal" ? context.event.aggregate_id : null)
      if (!dealId) throw new Error("deal.follow_up exige dealId.")
      const minutes = Math.max(1, Number(rendered.dueInMinutes || 1440))
      const dueAt = str(rendered.dueAt)
        ? new Date(str(rendered.dueAt)).toISOString()
        : new Date(Date.now() + minutes * 60_000).toISOString()

      await supabaseRest("PATCH", `/deals?id=eq.${encodeURIComponent(dealId)}&tenant_id=eq.${encodeURIComponent(context.event.tenant_id)}`, {
        next_followup_at: dueAt,
        updated_at: new Date().toISOString(),
      })
      return { type: action.type, dealId, dueAt }
    }

    case "conversation.set_department": {
      const conversationId = uuid(rendered.conversationId)
        || (context.event.aggregate_type === "conversation" ? context.event.aggregate_id : null)
        || uuid(context.event.payload.conversationId)
      const departmentId = uuid(rendered.departmentId)
      if (!conversationId || !departmentId) throw new Error("conversation.set_department exige conversationId e departmentId.")

      await supabaseRest("PATCH", `/conversations?id=eq.${encodeURIComponent(conversationId)}&tenant_id=eq.${encodeURIComponent(context.event.tenant_id)}`, {
        department_id: departmentId,
        assigned_to: null,
        updated_at: new Date().toISOString(),
      })
      const routed = await routeConversation(conversationId)
      return { type: action.type, conversationId, departmentId, routed }
    }

    case "message.queue": {
      const contactId = uuid(rendered.contactId) || context.event.contact_id
      const body = str(rendered.body, 12000)
      const channel = str(rendered.channel) || "whatsapp"
      const purpose = str(rendered.purpose) || "support"
      if (!contactId || !body) throw new Error("message.queue exige contato e corpo.")
      if (!["whatsapp","email","sms"].includes(channel)) throw new Error("Canal de mensagem inválido.")
      if (!["transactional","support","sales","marketing"].includes(purpose)) throw new Error("Finalidade de mensagem inválida.")

      const result = await supabaseRest<Record<string, unknown>[]>("POST", "/outbound_messages", [{
        tenant_id: context.event.tenant_id,
        contact_id: contactId,
        conversation_id: uuid(rendered.conversationId),
        channel,
        purpose,
        body,
        status: "pending",
        scheduled_at: str(rendered.scheduledAt) || new Date().toISOString(),
        dedupe_key: automationDedupe(context, "message"),
        metadata: {
          actor: "ai",
          automationRuleId: context.rule.id,
          eventId: context.event.id,
        },
      }])
      return { type: action.type, result: Array.isArray(result) ? result[0] ?? null : null }
    }

    case "notification.create": {
      const userId = uuid(rendered.userId)
      const title = str(rendered.title, 180)
      if (!userId || !title) throw new Error("notification.create exige userId e title.")

      const result = await supabaseRest<Record<string, unknown>[]>("POST", "/user_notifications", [{
        tenant_id: context.event.tenant_id,
        user_id: userId,
        type: str(rendered.notificationType, 80) || "automation",
        title,
        body: str(rendered.body, 4000) || null,
        entity_type: context.event.aggregate_type,
        entity_id: context.event.aggregate_id,
        metadata: { automationRuleId: context.rule.id, eventId: context.event.id },
      }])
      return { type: action.type, result: Array.isArray(result) ? result[0] ?? null : null }
    }

    default:
      throw new Error(`Ação de automação não suportada: ${(action as { type?: string }).type || "unknown"}`)
  }
}
