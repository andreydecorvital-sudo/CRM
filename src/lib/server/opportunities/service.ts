import { supabaseRest } from "@/lib/server/supabase/rest"

export type OpportunityChannel = "whatsapp" | "email"
export type OpportunityFrequency = "realtime" | "daily" | "weekly" | "important_only"

type PreferenceRow = {
  id: string
  public_token: string
  tenant_id: string
  contact_id: string
  enabled: boolean
  channels: OpportunityChannel[]
  topics: string[]
  frequency: OpportunityFrequency
  max_per_week: number
  consent_source: string | null
  captured_at: string | null
  revoked_at: string | null
}

type ContactRow = {
  id: string
  email: string | null
  phone_e164: string | null
}

export async function getOpportunityPreference(tenantId: string, contactId: string) {
  const rows = await supabaseRest<PreferenceRow[]>(
    "GET",
    `/contact_opportunity_preferences?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(contactId)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function getOpportunityPreferenceByToken(token: string) {
  const rows = await supabaseRest<PreferenceRow[]>(
    "GET",
    `/contact_opportunity_preferences?public_token=eq.${encodeURIComponent(token)}&select=id,public_token,tenant_id,contact_id,enabled,channels,topics,frequency,max_per_week,consent_source,captured_at,revoked_at&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function setOpportunityPreference(input: {
  tenantId: string
  contactId: string
  enabled: boolean
  channels: OpportunityChannel[]
  frequency?: OpportunityFrequency
  source?: string | null
  consentText?: string | null
  consentVersion?: string | null
}) {
  return supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_set_opportunity_preference", {
    p_tenant_id: input.tenantId,
    p_contact_id: input.contactId,
    p_enabled: input.enabled,
    p_channels: input.channels,
    p_frequency: input.frequency ?? "important_only",
    p_source: input.source ?? null,
    p_consent_text: input.consentText ?? null,
    p_consent_version: input.consentVersion ?? "v1",
  })
}

export async function updateOpportunityPreferenceByToken(input: {
  token: string
  enabled: boolean
  channels: OpportunityChannel[]
  frequency?: OpportunityFrequency
}) {
  return supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_update_opportunity_preference_by_token", {
    p_token: input.token,
    p_enabled: input.enabled,
    p_channels: input.channels,
    p_frequency: input.frequency ?? "important_only",
  })
}

export async function queueOpportunity(input: {
  tenantId: string
  contactId: string
  key: string
  whatsappText?: string | null
  emailSubject?: string | null
  emailText?: string | null
  emailHtml?: string | null
  channels?: OpportunityChannel[]
  scheduledAt?: string | null
  metadata?: Record<string, unknown>
}) {
  const preference = await getOpportunityPreference(input.tenantId, input.contactId)
  if (!preference?.enabled) return { queued: 0, suppressed: true, reason: "opportunities-disabled" }

  const requested = input.channels?.length ? input.channels : preference.channels
  const allowed = requested.filter(channel => preference.channels.includes(channel))
  if (!allowed.length) return { queued: 0, suppressed: true, reason: "no-allowed-channel" }

  const contacts = await supabaseRest<ContactRow[]>(
    "GET",
    `/contacts?id=eq.${encodeURIComponent(input.contactId)}&tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=id,email,phone_e164&limit=1`,
  )
  const contact = Array.isArray(contacts) ? contacts[0] : null
  if (!contact) throw new Error("Contato não encontrado.")

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recent = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/outbound_messages?tenant_id=eq.${encodeURIComponent(input.tenantId)}&contact_id=eq.${encodeURIComponent(input.contactId)}&purpose=eq.opportunity&created_at=gte.${encodeURIComponent(since)}&status=in.(pending,queued,sending,sent,delivered,read)&select=id&limit=${Math.max(1, preference.max_per_week)}`,
  )
  const recentCount = Array.isArray(recent) ? recent.length : 0
  if (recentCount >= preference.max_per_week) {
    return { queued: 0, suppressed: true, reason: "weekly-limit", recentCount }
  }

  const rows: Array<Record<string, unknown>> = []
  const scheduledAt = input.scheduledAt || new Date().toISOString()
  const metadata = { ...(input.metadata ?? {}), opportunityKey: input.key }

  if (allowed.includes("whatsapp") && input.whatsappText?.trim() && contact.phone_e164) {
    rows.push({
      tenant_id: input.tenantId,
      contact_id: input.contactId,
      channel: "whatsapp",
      purpose: "opportunity",
      body: input.whatsappText.trim().slice(0, 12000),
      status: "pending",
      scheduled_at: scheduledAt,
      dedupe_key: `opportunity:${input.key}:whatsapp:${input.contactId}`,
      metadata,
    })
  }

  if (allowed.includes("email") && input.emailText?.trim() && input.emailSubject?.trim() && contact.email) {
    rows.push({
      tenant_id: input.tenantId,
      contact_id: input.contactId,
      channel: "email",
      purpose: "opportunity",
      subject: input.emailSubject.trim().slice(0, 500),
      body: input.emailText.trim().slice(0, 12000),
      html_body: input.emailHtml?.trim().slice(0, 100000) || null,
      status: "pending",
      scheduled_at: scheduledAt,
      dedupe_key: `opportunity:${input.key}:email:${input.contactId}`,
      metadata,
    })
  }

  if (!rows.length) {
    return { queued: 0, suppressed: true, reason: "missing-channel-destination-or-content" }
  }

  const created = await supabaseRest<Array<{ id: string; channel: string; status: string }>>(
    "POST",
    "/outbound_messages",
    rows,
  )

  return {
    queued: Array.isArray(created) ? created.length : rows.length,
    messages: Array.isArray(created) ? created : [],
    preferenceToken: preference.public_token,
  }
}
