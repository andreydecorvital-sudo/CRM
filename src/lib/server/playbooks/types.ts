import type {
  AutomationAction,
  AutomationConditions,
  AutomationRule,
  DomainEvent,
} from "../automation/types"

export type PlaybookMode = "draft" | "shadow" | "active"

export type PlaybookDefinition = {
  key: string
  name: string
  description: string
  version: number
  triggerEvent: string
  conditions: AutomationConditions
  actions: AutomationAction[]
  mode: PlaybookMode
  priority: number
  stopOnMatch: boolean
  cooldownSeconds: number
  tags: string[]
}

export type CompiledPlaybook = {
  playbookKey: string
  playbookVersion: number
  rule: Omit<AutomationRule,"id" | "last_triggered_at">
  warnings: string[]
}

export type ChannelPreferenceStatus =
  | "unknown"
  | "opted_in"
  | "opted_out"
  | "transactional_only"

export type SimulationConsent = {
  channelPreferences?: Partial<Record<"whatsapp" | "email" | "sms",ChannelPreferenceStatus>>
  opportunities?: {
    enabled: boolean
    channels: Array<"whatsapp" | "email">
  }
}

export type PlaybookSimulationEvent = {
  event: DomainEvent
  consent?: SimulationConsent
}

export type SimulatedAction = {
  eventId: string
  actionIndex: number
  type: AutomationAction["type"]
  status: "would_execute" | "suppressed"
  reason: string | null
  renderedParams: Record<string, unknown>
}

export type PlaybookSimulationSummary = {
  inputEvents: number
  triggerEvents: number
  matchedEvents: number
  unmatchedEvents: number
  uniqueContactsMatched: number
  actionsConsidered: number
  actionsWouldExecute: number
  actionsSuppressed: number
  tasksWouldCreate: number
  followupsWouldSet: number
  tagsWouldApply: number
  routesWouldChange: number
  notificationsWouldCreate: number
  messagesWouldQueue: number
  messagesSuppressed: number
  messageSuppressions: Record<string,number>
}

export type PlaybookSimulationResult = {
  playbook: {
    key: string
    name: string
    version: number
    mode: PlaybookMode
  }
  summary: PlaybookSimulationSummary
  actions: SimulatedAction[]
  warnings: string[]
}
