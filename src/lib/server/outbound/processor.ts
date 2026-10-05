import { WahaProvider } from "@/lib/server/whatsapp/providers/waha"
import { supabaseRest } from "@/lib/server/supabase/rest"

type OutboundRow = {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string | null
  channel: "whatsapp" | "email" | "sms"
  purpose: "transactional" | "support" | "sales" | "marketing"
  body: string
  status: "pending" | "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "cancelled" | "suppressed"
  scheduled_at: string
  provider: string | null
  external_id: string | null
  metadata: Record<string, unknown>
}

type ContactRow = {
  external_contact_id: string
  phone_e164: string | null
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "string" ? value.trim() : ""
}

function whatsappTarget(contact: ContactRow, metadata: Record<string, unknown>) {
  const override = metadataString(metadata, "to")
  if (override) return override
  if (contact.external_contact_id.includes("@")) return contact.external_contact_id

  const digits = String(contact.phone_e164 || contact.external_contact_id).replace(/\D/g, "")
  if (!digits) throw new Error("Contato sem destino WhatsApp válido.")
  return `${digits}@c.us`
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

  if (message.channel !== "whatsapp") {
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "failed",
      failed_at: new Date().toISOString(),
      metadata: { ...message.metadata, permanentFailure: true, failureReason: "provider-not-configured" },
      updated_at: new Date().toISOString(),
    })
    return { skipped: true, status: "failed", reason: `${message.channel}-provider-not-configured` }
  }

  const contacts = await supabaseRest<ContactRow[]>(
    "GET",
    `/contacts?id=eq.${encodeURIComponent(message.contact_id)}&tenant_id=eq.${encodeURIComponent(message.tenant_id)}&select=external_contact_id,phone_e164&limit=1`,
  )
  const contact = Array.isArray(contacts) ? contacts[0] : null
  if (!contact) throw new Error("Contato da mensagem não encontrado.")

  const now = new Date().toISOString()
  await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
    status: "sending",
    provider: "waha",
    updated_at: now,
  })

  try {
    const provider = new WahaProvider()
    const sent = await provider.sendText({
      tenantId: message.tenant_id,
      to: whatsappTarget(contact, message.metadata),
      text: message.body,
    })

    const sentAt = new Date().toISOString()
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "sent",
      provider: "waha",
      external_id: sent.providerMessageId,
      sent_at: sentAt,
      failed_at: null,
      updated_at: sentAt,
    })

    if (message.conversation_id) {
      const actorRaw = metadataString(message.metadata, "actor")
      const actor = ["mira","human","system"].includes(actorRaw) ? actorRaw : "system"

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
            provider: "waha",
            providerMessageId: sent.providerMessageId,
            purpose: message.purpose,
          },
        }])
      }

      await supabaseRest("PATCH", `/conversations?id=eq.${encodeURIComponent(message.conversation_id)}&tenant_id=eq.${encodeURIComponent(message.tenant_id)}`, {
        status: "waiting_contact",
        last_message_at: sentAt,
        last_outbound_at: sentAt,
        updated_at: sentAt,
      })
    }

    return { sent: true, provider: "waha", providerMessageId: sent.providerMessageId }
  } catch (error) {
    const failedAt = new Date().toISOString()
    const reason = error instanceof Error ? error.message : String(error)
    await supabaseRest("PATCH", `/outbound_messages?id=eq.${encodeURIComponent(message.id)}`, {
      status: "failed",
      failed_at: failedAt,
      metadata: { ...message.metadata, lastFailure: reason.slice(0, 1000) },
      updated_at: failedAt,
    }).catch(() => null)
    throw error
  }
}
