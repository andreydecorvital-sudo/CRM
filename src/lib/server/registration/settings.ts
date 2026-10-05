import { supabaseRest } from "@/lib/server/supabase/rest"
import type { OpportunityChannel } from "@/lib/server/opportunities/service"

export type RegistrationTriggerMode = "new_contact" | "keyword" | "manual"

export async function updateRegistrationSettings(input: {
  tenantId: string
  enabled: boolean
  triggerMode?: RegistrationTriggerMode
  triggerKeywords?: string[]
  collectName?: boolean
  collectEmail?: boolean
  collectCity?: boolean
  emailRequired?: boolean
  askOpportunities?: boolean
  defaultOpportunityChannels?: OpportunityChannel[]
  welcomeMessage?: string
  promptName?: string
  promptEmail?: string
  promptCity?: string
  promptOpportunities?: string
  invalidEmailMessage?: string
  completionMessage?: string
}) {
  const channels = [...new Set(input.defaultOpportunityChannels ?? ["whatsapp","email"])]
    .filter((channel): channel is OpportunityChannel => channel === "whatsapp" || channel === "email")

  const body = {
    enabled: input.enabled,
    trigger_mode: input.triggerMode ?? "new_contact",
    trigger_keywords: [...new Set((input.triggerKeywords ?? ["cadastro","me cadastrar"])
      .map(value => String(value).trim())
      .filter(Boolean))]
      .slice(0,50),
    collect_name: input.collectName ?? true,
    collect_email: input.collectEmail ?? true,
    collect_city: input.collectCity ?? false,
    email_required: input.emailRequired ?? false,
    ask_opportunities: input.askOpportunities ?? true,
    default_opportunity_channels: channels,
    ...(input.welcomeMessage !== undefined ? { welcome_message: input.welcomeMessage.trim().slice(0,2000) } : {}),
    ...(input.promptName !== undefined ? { prompt_name: input.promptName.trim().slice(0,2000) } : {}),
    ...(input.promptEmail !== undefined ? { prompt_email: input.promptEmail.trim().slice(0,2000) } : {}),
    ...(input.promptCity !== undefined ? { prompt_city: input.promptCity.trim().slice(0,2000) } : {}),
    ...(input.promptOpportunities !== undefined ? { prompt_opportunities: input.promptOpportunities.trim().slice(0,2000) } : {}),
    ...(input.invalidEmailMessage !== undefined ? { invalid_email_message: input.invalidEmailMessage.trim().slice(0,2000) } : {}),
    ...(input.completionMessage !== undefined ? { completion_message: input.completionMessage.trim().slice(0,2000) } : {}),
    updated_at: new Date().toISOString(),
  }

  const existing = await supabaseRest<Array<{ tenant_id: string }>>(
    "GET",
    `/customer_registration_settings?tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=tenant_id&limit=1`,
  )

  if (Array.isArray(existing) && existing[0]) {
    await supabaseRest("PATCH", `/customer_registration_settings?tenant_id=eq.${encodeURIComponent(input.tenantId)}`, body)
    return { updated: true }
  }

  await supabaseRest("POST", "/customer_registration_settings", [{
    tenant_id: input.tenantId,
    ...body,
  }])

  return { updated: false }
}
