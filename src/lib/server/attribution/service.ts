import { attributionFromUrl } from "@/lib/domain/attribution"
import { supabaseRest } from "@/lib/server/supabase/rest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value: string, label: string) {
  const normalized = String(value || "").trim()
  if (!UUID.test(normalized)) throw new Error(`${label} inválido.`)
  return normalized
}

export async function recordAttribution(input: {
  tenantId: string
  contactId: string
  url: string
  referrer?: string | null
  touchType?: "visit" | "lead" | "conversation" | "conversion" | "manual"
  channel?: string | null
  metadata?: Record<string, unknown>
}) {
  const tenantId = uuid(input.tenantId, "Tenant")
  const contactId = uuid(input.contactId, "Contato")
  const attribution = attributionFromUrl(input.url, input.referrer)

  return supabaseRest<Record<string, unknown>[]>("POST", "/lead_attributions", [{
    tenant_id: tenantId,
    contact_id: contactId,
    touch_type: input.touchType ?? "lead",
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    content: attribution.content,
    term: attribution.term,
    referrer: attribution.referrer,
    landing_path: attribution.landingPath,
    click_id: attribution.clickId,
    channel: input.channel || null,
    metadata: input.metadata ?? {},
  }])
}
