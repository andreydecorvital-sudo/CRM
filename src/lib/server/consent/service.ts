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


export async function checkOutboundConsent(input: {
  tenantId: string
  contactId: string
  channel: "whatsapp" | "email" | "sms"
  purpose: "transactional" | "support" | "sales" | "marketing" | "opportunity"
}) {
  if (input.purpose === "transactional" || input.purpose === "support") {
    return { allowed: true, reason: "non-promotional" }
  }

  const channelRows = await supabaseRest<Array<{ status: PreferenceStatus }>>(
    "GET",
    `/contact_channel_preferences?tenant_id=eq.${encodeURIComponent(input.tenantId)}&contact_id=eq.${encodeURIComponent(input.contactId)}&channel=eq.${input.channel}&select=status&limit=1`,
  )
  const channelStatus = Array.isArray(channelRows) ? channelRows[0]?.status ?? "unknown" : "unknown"

  if (input.purpose === "sales") {
    if (channelStatus === "opted_out" || channelStatus === "transactional_only") {
      return { allowed: false, reason: `channel_preference:${channelStatus}` }
    }
    return { allowed: true, reason: "sales-allowed" }
  }

  if (input.purpose === "marketing") {
    return channelStatus === "opted_in"
      ? { allowed: true, reason: "marketing-opted-in" }
      : { allowed: false, reason: "marketing-consent-required" }
  }

  const preferenceRows = await supabaseRest<Array<{
    enabled: boolean
    channels: string[]
  }>>(
    "GET",
    `/contact_opportunity_preferences?tenant_id=eq.${encodeURIComponent(input.tenantId)}&contact_id=eq.${encodeURIComponent(input.contactId)}&select=enabled,channels&limit=1`,
  )
  const preference = Array.isArray(preferenceRows) ? preferenceRows[0] : null

  if (!preference?.enabled) return { allowed: false, reason: "opportunities-disabled" }
  if (!Array.isArray(preference.channels) || !preference.channels.includes(input.channel)) {
    return { allowed: false, reason: "opportunities-channel-disabled" }
  }
  if (channelStatus === "opted_out" || channelStatus === "transactional_only") {
    return { allowed: false, reason: `channel_preference:${channelStatus}` }
  }

  return { allowed: true, reason: "opportunity-opted-in" }
}
