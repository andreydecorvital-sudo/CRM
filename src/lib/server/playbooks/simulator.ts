import { evaluateConditions } from "../automation/conditions"
import { renderValue } from "../automation/render"
import type { AutomationAction, DomainEvent } from "../automation/types"
import type {
  ChannelPreferenceStatus,
  PlaybookDefinition,
  PlaybookSimulationEvent,
  PlaybookSimulationResult,
  SimulatedAction,
  SimulationConsent,
} from "./types"
import { validatePlaybook } from "./validator"

function subject(event: DomainEvent) {
  return {
    eventType:event.event_type,
    aggregateType:event.aggregate_type,
    aggregateId:event.aggregate_id,
    contactId:event.contact_id,
    payload:event.payload,
    occurredAt:event.occurred_at,
  }
}

function renderAction(action: AutomationAction,event: DomainEvent,playbook: PlaybookDefinition) {
  return renderValue(action.params,{
    event:{
      id:event.id,
      eventType:event.event_type,
      aggregateType:event.aggregate_type,
      aggregateId:event.aggregate_id,
      contactId:event.contact_id,
      payload:event.payload,
      occurredAt:event.occurred_at,
    },
    rule:{
      id:`playbook:${playbook.key}:v${playbook.version}`,
      name:playbook.name,
    },
  }) as Record<string,unknown>
}

function preference(
  consent: SimulationConsent | undefined,
  channel: "whatsapp" | "email" | "sms",
): ChannelPreferenceStatus {
  return consent?.channelPreferences?.[channel] || "unknown"
}

function consentDecision(
  params: Record<string,unknown>,
  consent: SimulationConsent | undefined,
) {
  const channel = String(params.channel || "whatsapp") as "whatsapp" | "email" | "sms"
  const purpose = String(params.purpose || "support")
  const status = preference(consent,channel)

  if (!["whatsapp","email","sms"].includes(channel)) {
    return { allowed:false,reason:"invalid-channel" }
  }
  if (!["transactional","support","sales","marketing","opportunity"].includes(purpose)) {
    return { allowed:false,reason:"invalid-purpose" }
  }

  if (purpose === "transactional" || purpose === "support") {
    return { allowed:true,reason:"non-promotional" }
  }

  if (purpose === "sales") {
    if (status === "opted_out" || status === "transactional_only") {
      return { allowed:false,reason:`channel_preference:${status}` }
    }
    return { allowed:true,reason:"sales-allowed" }
  }

  if (purpose === "marketing") {
    return status === "opted_in"
      ? { allowed:true,reason:"marketing-opted-in" }
      : { allowed:false,reason:"marketing-consent-required" }
  }

  const opportunities = consent?.opportunities
  if (!opportunities?.enabled) return { allowed:false,reason:"opportunities-disabled" }
  if (!opportunities.channels.includes(channel as "whatsapp" | "email")) {
    return { allowed:false,reason:"opportunities-channel-disabled" }
  }
  if (status === "opted_out" || status === "transactional_only") {
    return { allowed:false,reason:`channel_preference:${status}` }
  }
  return { allowed:true,reason:"opportunity-opted-in" }
}

function simulateAction(input: {
  playbook: PlaybookDefinition
  event: DomainEvent
  action: AutomationAction
  actionIndex: number
  consent?: SimulationConsent
}): SimulatedAction {
  const params = renderAction(input.action,input.event,input.playbook)

  if (input.action.type === "message.queue") {
    const body = String(params.body || "").trim()
    if (!input.event.contact_id) {
      return {
        eventId:input.event.id,
        actionIndex:input.actionIndex,
        type:input.action.type,
        status:"suppressed",
        reason:"missing-contact",
        renderedParams:params,
      }
    }
    if (!body) {
      return {
        eventId:input.event.id,
        actionIndex:input.actionIndex,
        type:input.action.type,
        status:"suppressed",
        reason:"missing-body",
        renderedParams:params,
      }
    }

    const consent = consentDecision(params,input.consent)
    return {
      eventId:input.event.id,
      actionIndex:input.actionIndex,
      type:input.action.type,
      status:consent.allowed ? "would_execute" : "suppressed",
      reason:consent.allowed ? null : consent.reason,
      renderedParams:params,
    }
  }

  return {
    eventId:input.event.id,
    actionIndex:input.actionIndex,
    type:input.action.type,
    status:"would_execute",
    reason:null,
    renderedParams:params,
  }
}

export function simulatePlaybook(input: {
  playbook: PlaybookDefinition
  events: PlaybookSimulationEvent[]
}): PlaybookSimulationResult {
  const validation = validatePlaybook(input.playbook)
  if (!validation.valid) {
    throw new Error(`Playbook inválido: ${validation.errors.join(" ")}`)
  }

  const events = input.events.slice(0,10_000)
  const actions: SimulatedAction[] = []
  const matchedContacts = new Set<string>()
  let triggerEvents = 0
  let matchedEvents = 0

  for (const item of events) {
    const event = item.event
    if (event.event_type !== input.playbook.triggerEvent) continue
    triggerEvents += 1

    if (!evaluateConditions(subject(event),input.playbook.conditions)) continue
    matchedEvents += 1
    if (event.contact_id) matchedContacts.add(event.contact_id)

    input.playbook.actions.forEach((action,actionIndex) => {
      actions.push(simulateAction({
        playbook:input.playbook,
        event,
        action,
        actionIndex,
        consent:item.consent,
      }))
    })
  }

  const executed = actions.filter(action => action.status === "would_execute")
  const suppressed = actions.filter(action => action.status === "suppressed")
  const count = (type: AutomationAction["type"]) =>
    executed.filter(action => action.type === type).length

  const suppressionReasons: Record<string,number> = {}
  for (const action of suppressed) {
    const key = action.reason || "unknown"
    suppressionReasons[key] = (suppressionReasons[key] || 0) + 1
  }

  return {
    playbook:{
      key:input.playbook.key,
      name:input.playbook.name,
      version:input.playbook.version,
      mode:input.playbook.mode,
    },
    summary:{
      inputEvents:events.length,
      triggerEvents,
      matchedEvents,
      unmatchedEvents:triggerEvents - matchedEvents,
      uniqueContactsMatched:matchedContacts.size,
      actionsConsidered:actions.length,
      actionsWouldExecute:executed.length,
      actionsSuppressed:suppressed.length,
      tasksWouldCreate:count("task.create"),
      followupsWouldSet:count("deal.follow_up"),
      tagsWouldApply:count("contact.tag"),
      routesWouldChange:count("conversation.set_department"),
      notificationsWouldCreate:count("notification.create"),
      messagesWouldQueue:count("message.queue"),
      messagesSuppressed:suppressed.filter(action => action.type === "message.queue").length,
      messageSuppressions:suppressionReasons,
    },
    actions,
    warnings:validation.warnings,
  }
}
