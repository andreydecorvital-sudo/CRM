export type RouterCapability =
  | "acquisition"
  | "customer"
  | "inbox"
  | "sales"
  | "tasks"
  | "proposals"
  | "lifecycle"
  | "opportunities"
  | "automation"
  | "integrations"
  | "ai"
  | "billing"
  | "privacy"
  | "analytics"
  | "operations"

export type RouterSeverity = "info" | "warning" | "critical"
export type RouterWakeMode = "observe" | "route" | "propose"

export type RouterDomainEvent = {
  id: string
  tenant_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string | null
  contact_id: string | null
  payload: Record<string, unknown>
  occurred_at: string
  created_at: string
}

export type RouterPolicy = {
  key: string
  capabilities: RouterCapability[]
  severity: RouterSeverity
  wakeMode: RouterWakeMode
  summary?: string
}

export type EventRouterDispatch = {
  id: string
  tenant_id: string
  event_id: string
  capability: RouterCapability
  severity: RouterSeverity
  wake_mode: RouterWakeMode
  policy_key: string
  fingerprint: string
  aggregate_type: string
  aggregate_id: string | null
  contact_id: string | null
  summary: string
  payload: Record<string, unknown>
  status: "routed" | "consumed" | "ignored" | "failed"
  routed_at: string
}

export type ActionRisk = "low" | "medium" | "high" | "critical"
export type ActionProposalStatus =
  | "proposed"
  | "awaiting_approval"
  | "authorized"
  | "rejected"
  | "expired"

export type ActionProposal = {
  id: string
  tenant_id: string
  dispatch_id: string | null
  action_key: string
  action_type: string
  target_type: string
  target_id: string | null
  recommendation: string
  payload: Record<string, unknown>
  evidence: unknown[]
  missing_data: string[]
  risk_level: ActionRisk
  confidence: number
  source: "router" | "ai" | "human" | "system"
  proposal_only: boolean
  status: ActionProposalStatus
  expires_at: string | null
  created_at: string
}

export type AuthorizedIntent = {
  id: string
  tenant_id: string
  proposal_id: string
  action_key: string
  action_type: string
  target_type: string
  target_id: string | null
  payload: Record<string, unknown>
  proposal_snapshot: Record<string, unknown>
  status: "authorized" | "rejected" | "expired" | "revoked"
  authorization_source: "policy" | "human"
  authorized_by: string | null
  authorization_reason: string | null
  authorization_granted: boolean
  proposal_only_cleared: boolean
  authorized_at: string
}

export type ActionExecutionStatus =
  | "executing"
  | "verified"
  | "failed"
  | "unknown"
  | "rolled_back"
  | "blocked"
  | "adapter_missing"

export type ActionAdapterVerification = {
  verified: boolean
  details: Record<string, unknown>
}

export type ActionAdapter = {
  key: string
  actionType: string
  semantics: "idempotent" | "uncertain"
  rehydrate(intent: AuthorizedIntent): Promise<Record<string, unknown>>
  execute(
    intent: AuthorizedIntent,
    facts: Record<string, unknown>,
  ): Promise<Record<string, unknown>>
  verify(
    intent: AuthorizedIntent,
    facts: Record<string, unknown>,
    result: Record<string, unknown>,
  ): Promise<ActionAdapterVerification>
}
