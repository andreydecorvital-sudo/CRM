import { supabaseRest } from "@/lib/server/supabase/rest"
import type { WhatsappInbound } from "./types"

export type WhatsappIngestResult = {
  duplicate: boolean
  contactCreated: boolean
  contactId: string
  conversationId: string
  messageId?: string
}

export async function ingestWhatsappInbound(input: WhatsappInbound) {
  if (!input.tenantId) throw new Error("tenantId obrigatório")
  if (!input.externalContactId || !input.externalMessageId || !input.text.trim()) throw new Error("Mensagem inválida")

  return supabaseRest<WhatsappIngestResult>("POST", "/rpc/crm_ingest_whatsapp_inbound", {
    p_tenant_id: input.tenantId,
    p_external_contact_id: input.externalContactId,
    p_external_message_id: input.externalMessageId,
    p_display_name: input.displayName ?? null,
    p_phone_e164: input.phoneE164 ?? null,
    p_text: input.text.trim(),
    p_received_at: input.receivedAt,
    p_metadata: input.metadata ?? {},
  })
}
