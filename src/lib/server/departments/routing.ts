import { supabaseRest } from "@/lib/server/supabase/rest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value: string, label: string) {
  const normalized = String(value || "").trim()
  if (!UUID.test(normalized)) throw new Error(`${label} inválido.`)
  return normalized
}

export async function routeConversation(conversationIdRaw: string) {
  const conversationId = uuid(conversationIdRaw, "Conversa")
  return supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_route_conversation", {
    p_conversation_id: conversationId,
  })
}
