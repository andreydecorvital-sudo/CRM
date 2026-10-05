import { supabaseRest } from "@/lib/server/supabase/rest"
import {
  getOpportunityPreference,
  setOpportunityPreference,
  type OpportunityChannel,
} from "@/lib/server/opportunities/service"

type RegistrationStep = "name" | "email" | "city" | "opportunities" | "done"

type SettingsRow = {
  tenant_id: string
  enabled: boolean
  trigger_mode: "new_contact" | "keyword" | "manual"
  trigger_keywords: string[]
  collect_name: boolean
  collect_email: boolean
  collect_city: boolean
  email_required: boolean
  ask_opportunities: boolean
  default_opportunity_channels: OpportunityChannel[]
  welcome_message: string
  prompt_name: string
  prompt_email: string
  prompt_city: string
  prompt_opportunities: string
  invalid_email_message: string
  completion_message: string
}

type ContactRow = {
  id: string
  display_name: string
  email: string | null
  city: string | null
  phone_e164: string | null
}

type SessionRow = {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string
  status: "active" | "completed" | "cancelled"
  step: RegistrationStep
  attempts: number
  collected: Record<string, unknown>
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function genericName(value: string) {
  const name = normalized(value)
  return !name || name === "contato" || name === "cliente" || /^\+?\d{8,}$/.test(name)
}

function isSkip(value: string) {
  return ["pular","prefiro nao informar","nao informar","sem email","nao tenho"].includes(normalized(value))
}

function yesNo(value: string): boolean | null {
  const text = normalized(value)
  if (["sim","s","quero","aceito","pode","pode enviar","tenho interesse"].includes(text)) return true
  if (["nao","n","nao quero","recuso","prefiro nao","sem interesse"].includes(text)) return false
  return null
}

function isCancelRegistration(value: string) {
  const text = normalized(value)
  return ["cancelar cadastro","sair do cadastro","parar cadastro"].includes(text)
}

function wantsOpportunityOff(value: string) {
  const text = normalized(value)
  return /^(parar|cancelar|desativar).*(oportunidade|promocao|oferta)/.test(text)
    || /^nao quero.*(oportunidade|promocao|oferta)/.test(text)
}

function wantsOpportunityOn(value: string) {
  const text = normalized(value)
  return /^(quero|ativar|receber).*(oportunidade|promocao|oferta)/.test(text)
}

async function loadSettings(tenantId: string) {
  const rows = await supabaseRest<SettingsRow[]>(
    "GET",
    `/customer_registration_settings?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function loadContact(tenantId: string, contactId: string) {
  const rows = await supabaseRest<ContactRow[]>(
    "GET",
    `/contacts?id=eq.${encodeURIComponent(contactId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,display_name,email,city,phone_e164&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function loadActiveSession(tenantId: string, contactId: string) {
  const rows = await supabaseRest<SessionRow[]>(
    "GET",
    `/contact_registration_sessions?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(contactId)}&status=eq.active&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function hasCompletedSession(tenantId: string, contactId: string) {
  const rows = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/contact_registration_sessions?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(contactId)}&status=eq.completed&select=id&limit=1`,
  )
  return Boolean(Array.isArray(rows) && rows[0])
}

function availableOpportunityChannels(settings: SettingsRow, contact: ContactRow) {
  const channels = settings.default_opportunity_channels.filter(channel => {
    if (channel === "email") return Boolean(contact.email)
    if (channel === "whatsapp") return Boolean(contact.phone_e164)
    return false
  })
  return channels.length ? channels : ["whatsapp"] as OpportunityChannel[]
}

async function nextStep(
  settings: SettingsRow,
  contact: ContactRow,
  tenantId: string,
  collected: Record<string, unknown> = {},
): Promise<RegistrationStep> {
  if (settings.collect_name && genericName(contact.display_name)) return "name"
  if (settings.collect_email && !contact.email && collected.emailSkipped !== true) return "email"
  if (settings.collect_city && !contact.city && collected.citySkipped !== true) return "city"

  if (settings.ask_opportunities) {
    const preference = await getOpportunityPreference(tenantId, contact.id)
    if (!preference) return "opportunities"
  }

  return "done"
}

function promptFor(settings: SettingsRow, step: RegistrationStep) {
  if (step === "name") return settings.prompt_name
  if (step === "email") return settings.prompt_email
  if (step === "city") return settings.prompt_city
  if (step === "opportunities") return settings.prompt_opportunities
  return settings.completion_message
}

async function queueWhatsapp(input: {
  tenantId: string
  contactId: string
  conversationId: string
  sessionId: string
  step: RegistrationStep
  body: string
  sequence: number
}) {
  const body = input.body.trim()
  if (!body) return null

  const rows = await supabaseRest<Array<{ id: string; status: string }>>("POST", "/outbound_messages", [{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    channel: "whatsapp",
    purpose: "support",
    body: body.slice(0,12000),
    status: "pending",
    scheduled_at: new Date().toISOString(),
    dedupe_key: `registration:${input.sessionId}:${input.step}:${input.sequence}`,
    metadata: {
      actor: "system",
      registrationSessionId: input.sessionId,
      registrationStep: input.step,
    },
  }])

  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function finishSession(session: SessionRow, settings: SettingsRow) {
  const now = new Date().toISOString()
  await supabaseRest("PATCH", `/contact_registration_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    status: "completed",
    step: "done",
    completed_at: now,
    updated_at: now,
  })

  await queueWhatsapp({
    tenantId: session.tenant_id,
    contactId: session.contact_id,
    conversationId: session.conversation_id,
    sessionId: session.id,
    step: "done",
    body: settings.completion_message,
    sequence: session.attempts + 1,
  })

  await supabaseRest("POST", "/rpc/crm_emit_event", {
    p_tenant_id: session.tenant_id,
    p_event_type: "registration.completed",
    p_aggregate_type: "contact",
    p_aggregate_id: session.contact_id,
    p_contact_id: session.contact_id,
    p_payload: { conversationId: session.conversation_id, sessionId: session.id },
    p_dedupe_key: `registration-completed:${session.id}`,
  }).catch(() => null)

  return { handled: true, completed: true, sessionId: session.id }
}

async function promptStep(session: SessionRow, settings: SettingsRow, step: RegistrationStep, body?: string) {
  const attempts = session.attempts + 1
  const now = new Date().toISOString()

  await supabaseRest("PATCH", `/contact_registration_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    step,
    attempts,
    last_prompt_at: now,
    updated_at: now,
  })

  await queueWhatsapp({
    tenantId: session.tenant_id,
    contactId: session.contact_id,
    conversationId: session.conversation_id,
    sessionId: session.id,
    step,
    body: body || promptFor(settings,step),
    sequence: attempts,
  })

  return { handled: true, completed: false, step, sessionId: session.id }
}

export async function startWhatsappRegistration(input: {
  tenantId: string
  contactId: string
  conversationId: string
}) {
  const [settings,contact,active] = await Promise.all([
    loadSettings(input.tenantId),
    loadContact(input.tenantId,input.contactId),
    loadActiveSession(input.tenantId,input.contactId),
  ])

  if (!settings?.enabled) return { started: false, reason: "registration-disabled" }
  if (!contact) throw new Error("Contato não encontrado.")
  if (active) return { started: false, reason: "already-active", sessionId: active.id, step: active.step }

  const step = await nextStep(settings,contact,input.tenantId,{})
  const rows = await supabaseRest<SessionRow[]>("POST", "/contact_registration_sessions", [{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    status: step === "done" ? "completed" : "active",
    step,
    attempts: 0,
    completed_at: step === "done" ? new Date().toISOString() : null,
    metadata: { source: "whatsapp" },
  }])

  const session = Array.isArray(rows) ? rows[0] : null
  if (!session) throw new Error("Não foi possível iniciar o cadastro.")

  if (step === "done") {
    await queueWhatsapp({
      tenantId: session.tenant_id,
      contactId: session.contact_id,
      conversationId: session.conversation_id,
      sessionId: session.id,
      step: "done",
      body: settings.completion_message,
      sequence: 1,
    })
    return { started: true, completed: true, sessionId: session.id }
  }

  const body = [settings.welcome_message,promptFor(settings,step)].filter(Boolean).join("\n\n")
  await promptStep(session,settings,step,body)

  await supabaseRest("POST", "/rpc/crm_emit_event", {
    p_tenant_id: session.tenant_id,
    p_event_type: "registration.started",
    p_aggregate_type: "contact",
    p_aggregate_id: session.contact_id,
    p_contact_id: session.contact_id,
    p_payload: { conversationId: session.conversation_id, sessionId: session.id, step },
    p_dedupe_key: `registration-started:${session.id}`,
  }).catch(() => null)

  return { started: true, completed: false, sessionId: session.id, step }
}

async function processActiveSession(session: SessionRow, settings: SettingsRow, text: string) {
  if (isCancelRegistration(text)) {
    const now = new Date().toISOString()
    await supabaseRest("PATCH", `/contact_registration_sessions?id=eq.${encodeURIComponent(session.id)}`, {
      status: "cancelled",
      completed_at: now,
      updated_at: now,
    })

    await queueWhatsapp({
      tenantId: session.tenant_id,
      contactId: session.contact_id,
      conversationId: session.conversation_id,
      sessionId: session.id,
      step: session.step,
      body: "Cadastro cancelado. Se quiser retomar depois, é só pedir.",
      sequence: session.attempts + 1,
    })

    return { handled: true, cancelled: true, sessionId: session.id }
  }

  const contact = await loadContact(session.tenant_id,session.contact_id)
  if (!contact) throw new Error("Contato não encontrado.")

  if (session.step === "name") {
    const name = text.trim().replace(/\s+/g," ").slice(0,160)
    if (name.length < 2) return promptStep(session,settings,"name","Me diga seu nome com pelo menos 2 caracteres.")

    await supabaseRest("PATCH", `/contacts?id=eq.${encodeURIComponent(contact.id)}&tenant_id=eq.${encodeURIComponent(session.tenant_id)}`, {
      display_name: name,
      updated_at: new Date().toISOString(),
    })
    contact.display_name = name
  }

  const collected = { ...(session.collected || {}) }

  if (session.step === "email") {
    if (isSkip(text) && !settings.email_required) {
      collected.emailSkipped = true
    } else {
      const email = normalized(text)
      if (!EMAIL.test(email)) return promptStep(session,settings,"email",settings.invalid_email_message)

      await supabaseRest("PATCH", `/contacts?id=eq.${encodeURIComponent(contact.id)}&tenant_id=eq.${encodeURIComponent(session.tenant_id)}`, {
        email: email.slice(0,320),
        updated_at: new Date().toISOString(),
      })
      contact.email = email
      collected.email = email
    }
  }

  if (session.step === "city") {
    if (!isSkip(text)) {
      const city = text.trim().replace(/\s+/g," ").slice(0,160)
      if (city.length < 2) return promptStep(session,settings,"city","Me diga a cidade ou responda PULAR.")

      await supabaseRest("PATCH", `/contacts?id=eq.${encodeURIComponent(contact.id)}&tenant_id=eq.${encodeURIComponent(session.tenant_id)}`, {
        city,
        updated_at: new Date().toISOString(),
      })
      contact.city = city
      collected.city = city
    } else {
      collected.citySkipped = true
    }
  }

  if (session.step === "name") {
    collected.name = contact.display_name
  }

  if (session.step === "opportunities") {
    const answer = yesNo(text)
    if (answer === null) {
      return promptStep(session,settings,"opportunities","Responda somente SIM ou NÃO para escolher se quer receber oportunidades.")
    }

    await setOpportunityPreference({
      tenantId: session.tenant_id,
      contactId: session.contact_id,
      enabled: answer,
      channels: answer ? availableOpportunityChannels(settings,contact) : [],
      frequency: "important_only",
      source: "whatsapp-registration",
      consentText: settings.prompt_opportunities,
      consentVersion: "v1",
    })
    collected.opportunities = answer
  }

  await supabaseRest("PATCH", `/contact_registration_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    collected,
    updated_at: new Date().toISOString(),
  })

  const updatedContact = await loadContact(session.tenant_id,session.contact_id)
  if (!updatedContact) throw new Error("Contato não encontrado após atualização.")

  const step = await nextStep(settings,updatedContact,session.tenant_id,collected)
  if (step === "done") return finishSession(session,settings)
  return promptStep(session,settings,step)
}

async function handleOpportunityCommand(input: {
  settings: SettingsRow | null
  tenantId: string
  contactId: string
  conversationId: string
  text: string
}) {
  const off = wantsOpportunityOff(input.text)
  const on = wantsOpportunityOn(input.text)
  if (!off && !on) return null

  const contact = await loadContact(input.tenantId,input.contactId)
  if (!contact) return null

  const settings = input.settings
  const channels = on
    ? settings
      ? availableOpportunityChannels(settings,contact)
      : (contact.email ? ["whatsapp","email"] : ["whatsapp"]) as OpportunityChannel[]
    : []

  await setOpportunityPreference({
    tenantId: input.tenantId,
    contactId: input.contactId,
    enabled: on,
    channels,
    frequency: "important_only",
    source: "whatsapp-command",
    consentText: input.text,
    consentVersion: "v1",
  })

  const sessionId = `preference-${input.contactId}`
  await queueWhatsapp({
    tenantId: input.tenantId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    sessionId,
    step: "opportunities",
    body: on
      ? "Pronto. Você poderá receber oportunidades pelos canais escolhidos. Se quiser desligar depois, escreva PARAR OPORTUNIDADES."
      : "Pronto. Não enviaremos novas oportunidades. Se quiser ativar novamente, escreva ATIVAR OPORTUNIDADES.",
    sequence: Date.now(),
  })

  return { handled: true, preferenceUpdated: true, enabled: on }
}

export async function handleWhatsappRegistrationInbound(input: {
  tenantId: string
  contactId: string
  conversationId: string
  text: string
  contactCreated: boolean
}) {
  const settings = await loadSettings(input.tenantId)
  const active = await loadActiveSession(input.tenantId,input.contactId)

  if (active) {
    if (!settings?.enabled) {
      await supabaseRest("PATCH", `/contact_registration_sessions?id=eq.${encodeURIComponent(active.id)}`, {
        status: "cancelled",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).catch(() => null)
      return { handled: false, reason: "registration-disabled" }
    }
    return processActiveSession(active,settings,input.text)
  }

  const preferenceCommand = await handleOpportunityCommand({
    settings,
    tenantId: input.tenantId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    text: input.text,
  })
  if (preferenceCommand) return preferenceCommand

  if (!settings?.enabled) return { handled: false, reason: "registration-disabled" }

  const keywordTriggered = settings.trigger_mode === "keyword"
    && settings.trigger_keywords.some(keyword => normalized(input.text).includes(normalized(keyword)))

  const shouldStart = settings.trigger_mode === "new_contact"
    ? input.contactCreated
    : keywordTriggered

  if (!shouldStart || settings.trigger_mode === "manual") {
    return { handled: false, reason: "not-triggered" }
  }

  if (await hasCompletedSession(input.tenantId,input.contactId)) {
    return { handled: false, reason: "already-completed" }
  }

  return startWhatsappRegistration({
    tenantId: input.tenantId,
    contactId: input.contactId,
    conversationId: input.conversationId,
  })
}
