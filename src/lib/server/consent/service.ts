import { supabaseRest } from "@/lib/server/supabase/rest"

type Channel = "whatsapp" | "email" | "sms" | "phone"
type PreferenceStatus = "unknown" | "opted_in" | "opted_out" | "transactional_only"

export async function setChannelPreference(input: {
  tenantId: string
  contactId: string
  channel: Channel
  status: PreferenceStatus
  source?: string | null
  reason?: string | null
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}) {
  const existing = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/contact_channel_preferences?tenant_id=eq.${encodeURIComponent(input.tenantId)}&contact_id=eq.${encodeURIComponent(input.contactId)}&channel=eq.${input.channel}&select=id&limit=1`,
  )
  const now = new Date().toISOString()
  const body = {
    status: input.status,
    source: input.source || null,
    reason: input.reason || null,
    captured_at: now,
    expires_at: input.expiresAt || null,
    metadata: input.metadata ?? {},
    updated_at: now,
  }

  if (Array.isArray(existing) && existing[0]?.id) {
    await supabaseRest("PATCH", `/contact_channel_preferences?id=eq.${encodeURIComponent(existing[0].id)}`, body)
    return { id: existing[0].id, updated: true }
  }

  const created = await supabaseRest<Array<{ id: string }>>("POST", "/contact_channel_preferences", [{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    channel: input.channel,
    ...body,
  }])
  return { id: Array.isArray(created) ? created[0]?.id ?? null : null, updated: false }
}
