import { createWhatsappProviderForTenant } from "@/lib/server/whatsapp/provider-factory"
import { createEmailProviderForTenant } from "@/lib/server/email/provider-factory"
import { supabaseRest } from "@/lib/server/supabase/rest"
import { recordUsage } from "@/lib/server/billing/entitlements"
import { checkOutboundConsent } from "@/lib/server/consent/service"

type OutboundRow = {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string | null
  channel: "whatsapp" | "email" | "sms"
  purpose: "transactional" | "support" | "sales" | "marketing" | "opportunity"
  subject: string | null
  body: string
  html_body: string | null
  status: "pending" | "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "cancelled" | "suppressed"
  scheduled_at: string
  provider: string | null
  external_id: string | null
  metadata: Record<string, unknown>
}

type ContactRow = {
  external_contact_id: string
  phone_e164: string | null
  email: string | null
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "string" ? value.trim() : ""
}

function whatsappTarget(contact: ContactRow, metadata: Record<string, unknown>) {
  const override = metadataString(metadata, "to")
  if (override) return override
  if (contact.external_contact_id.includes("@")) return contact.external_contact_id

  const source = String(contact.phone_e164 || contact.external_contact_id)
  const digits = source.replace(/@.*$/, "").replace(/\D/g, "")
  if (!digits) throw new Error("Contato sem destino WhatsApp válido.")
  return `${digits}@c.us`
}

async function markPermanentFailure(message: OutboundRow, reason: string) {
  const failedAt = new Date().toISOString()
  await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
    status: "failed",
    failed_at: failedAt,
    metadata: {
      ...message.metadata,
      permanentFailure: true,
      failureReason: reason,
    },
    updated_at: failedAt,
  })
  return { skipped: true, status: "failed", reason }
}

async function mirrorWhatsappMessage(
  message: OutboundRow,
  providerName: string,
  providerMessageId: string,
  sentAt: string,
) {
  if (!message.conversation_id) return

  const actorRaw = metadataString(message.metadata, "actor")
  const actor = ["ai","human","system"].includes(actorRaw) ? actorRaw : "system"

  const existing = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/messages?conversation_id=eq.${encodeURIComponent(message.conversation_id)}&external_id=eq.${encodeURIComponent(`outbox:${message.id}`)}&select=id&limit=1`,
  )

  if (!Array.isArray(existing) || !existing[0]) {
    await supabaseRest("POST", "/messages", [{
      tenant_id: message.tenant_id,
      conversation_id: message.conversation_id,
      external_id: `outbox:${message.id}`,
      direction: "outbound",
      actor,
      message_type: "text",
      text: message.body,
      status: "sent",
      sent_at: sentAt,
      metadata: {
        outboxMessageId: message.id,
        provider: providerName,
        providerMessageId,
        purpose: message.purpose,
      },
    }])
  }

  await supabaseRest(
    "PATCH",
    `/conversations?id=eq.${encodeURIComponent(message.conversation_id)}&tenant_id=eq.${encodeURIComponent(message.tenant_id)}`,
    {
      status: "waiting_contact",
      last_message_at: sentAt,
      last_outbound_at: sentAt,
      updated_at: sentAt,
    },
  )
}

export async function processOutboundMessage(messageId: string) {
  const rows = await supabaseRest<OutboundRow[]>(
    "GET",
    `/outbound_messages?id=eq.${encodeURIComponent(messageId)}&select=*&limit=1`,
  )
  const message = Array.isArray(rows) ? rows[0] : null
  if (!message) throw new Error("Mensagem outbound não encontrada.")

  if (["sent","delivered","read","cancelled","suppressed"].includes(message.status)) {
    return { skipped: true, status: message.status }
  }

  if (message.status === "sending") {
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "failed",
      failed_at: new Date().toISOString(),
      metadata: { ...message.metadata, deliveryUncertain: true },
      updated_at: new Date().toISOString(),
    })
    return { skipped: true, status: "failed", reason: "delivery-uncertain" }
  }

  if (message.metadata.deliveryUncertain === true) {
    return { skipped: true, status: "failed", reason: "delivery-uncertain" }
  }

  if (new Date(message.scheduled_at).getTime() > Date.now()) {
    throw new Error("Mensagem ainda não está no horário de envio.")
  }

  if (message.channel === "sms") {
    return markPermanentFailure(message,"sms-provider-not-configured")
  }

  const consent = await checkOutboundConsent({
    tenantId: message.tenant_id,
    contactId: message.contact_id,
    channel: message.channel,
    purpose: message.purpose,
  })

  if (!consent.allowed) {
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "suppressed",
      suppressed_reason: consent.reason,
      updated_at: new Date().toISOString(),
    })
    return { skipped: true, status: "suppressed", reason: consent.reason }
  }

  const contacts = await supabaseRest<ContactRow[]>(
    "GET",
    `/contacts?id=eq.${encodeURIComponent(message.contact_id)}&tenant_id=eq.${encodeURIComponent(message.tenant_id)}&select=external_contact_id,phone_e164,email&limit=1`,
  )
  const contact = Array.isArray(contacts) ? contacts[0] : null
  if (!contact) throw new Error("Contato da mensagem não encontrado.")

  let providerName = ""
  let providerMessageId = ""

  try {
    if (message.channel === "whatsapp") {
      const provider = await createWhatsappProviderForTenant(message.tenant_id)
      providerName = provider.name

      await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
        status: "sending",
        provider: providerName,
        updated_at: new Date().toISOString(),
      })

      const sent = await provider.sendText({
        tenantId: message.tenant_id,
        to: whatsappTarget(contact,message.metadata),
        text: message.body,
      })
      providerMessageId = sent.providerMessageId
    } else {
      if (!contact.email) return markPermanentFailure(message,"contact-email-missing")
      const subject = String(message.subject || metadataString(message.metadata,"subject")).trim()
      if (!subject) return markPermanentFailure(message,"email-subject-missing")

      const provider = await createEmailProviderForTenant(message.tenant_id)
      providerName = provider.name

      await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
        status: "sending",
        provider: providerName,
        updated_at: new Date().toISOString(),
      })

      const sent = await provider.send({
        tenantId: message.tenant_id,
        to: contact.email,
        subject,
        text: message.body,
        html: message.html_body,
        replyTo: metadataString(message.metadata,"replyTo") || null,
        tags: [
          { name: "purpose", value: message.purpose.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,256) },
          { name: "tenant", value: message.tenant_id.replace(/-/g,"").slice(0,256) },
        ],
      })
      providerMessageId = sent.providerMessageId
    }

    const sentAt = new Date().toISOString()
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "sent",
      provider: providerName,
      external_id: providerMessageId,
      sent_at: sentAt,
      failed_at: null,
      updated_at: sentAt,
    })

    if (message.channel === "whatsapp") {
      await mirrorWhatsappMessage(message,providerName,providerMessageId,sentAt)
    } else {
      await supabaseRest("POST", "/audit_log", [{
        tenant_id: message.tenant_id,
        actor_type: "system",
        actor_id: "email-outbox",
        action: "message.email.sent",
        entity_type: "contact",
        entity_id: message.contact_id,
        metadata: {
          outboxMessageId: message.id,
          provider: providerName,
          providerMessageId,
          purpose: message.purpose,
        },
      }]).catch(() => null)
    }

    await recordUsage({
      tenantId: message.tenant_id,
      metric: `messages.${message.channel}.sent`,
      dedupeKey: `usage:outbound:${message.id}`,
      metadata: { purpose: message.purpose, provider: providerName },
    }).catch(() => null)

    return {
      sent: true,
      channel: message.channel,
      provider: providerName,
      providerMessageId,
    }
  } catch (error) {
    const failedAt = new Date().toISOString()
    const reason = error instanceof Error ? error.message : String(error)
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "failed",
      failed_at: failedAt,
      metadata: { ...message.metadata, lastFailure: reason.slice(0,1000) },
      updated_at: failedAt,
    }).catch(() => null)
    throw error
  }
}
