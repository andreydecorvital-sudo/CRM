import type {
  RouterCapability,
  RouterDomainEvent,
  RouterPolicy,
  RouterSeverity,
  RouterWakeMode,
} from "./contracts"

function typeOf(event: RouterDomainEvent) {
  return String(event.event_type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g,".")
}

function policy(
  key: string,
  capabilities: RouterCapability[],
  severity: RouterSeverity = "info",
  wakeMode: RouterWakeMode = "route",
): RouterPolicy {
  return { key, capabilities: [...new Set(capabilities)], severity, wakeMode }
}

export function policyForDomainEvent(event: RouterDomainEvent): RouterPolicy {
  const eventType = typeOf(event)

  if (/^message\.(received|inbound)/.test(eventType)) {
    return policy("inbox.message.received",["inbox","customer"],"info","route")
  }

  if (/^message\.(sent|delivered|read|email\.sent)/.test(eventType)) {
    return policy("inbox.message.outbound",["inbox","integrations"],"info","observe")
  }

  if (/^conversation\.(sla|breach|overdue|unassigned)/.test(eventType)) {
    return policy("inbox.sla.attention",["inbox","tasks","analytics"],"critical","propose")
  }

  if (/^conversation\./.test(eventType)) {
    return policy("inbox.conversation",["inbox","customer"],"info","route")
  }

  if (/^registration\./.test(eventType)) {
    return policy("customer.registration",["customer","acquisition","inbox"],"info","route")
  }

  if (/^preference\./.test(eventType)) {
    return policy("customer.preference",["customer","opportunities"],"info","observe")
  }

  if (/^contact\./.test(eventType)) {
    return policy("customer.contact",["customer","acquisition"],"info","route")
  }

  if (/^deal\.health\./.test(eventType)) {
    return policy("sales.deal.health",["sales","tasks","analytics"],"info","observe")
  }

  if (/^next\.action\./.test(eventType) || /^next_action\./.test(eventType)) {
    return policy("sales.next.action",["tasks","sales","analytics"],"info","observe")
  }

  if (/^revenue\.recovery\./.test(eventType)) {
    return policy("sales.revenue.recovery",["sales","tasks","analytics"],"warning","propose")
  }

  if (/^task\./.test(eventType)) {
    return policy("sales.task",["tasks","sales","analytics"],"info","observe")
  }

  if (/^deal\.created$/.test(eventType)) {
    return policy("sales.deal.created",["sales","tasks","analytics"],"info","propose")
  }

  if (/^deal\.stage.changed$/.test(eventType)) {
    return policy("sales.deal.stage",["sales","tasks","analytics"],"info","propose")
  }

  if (/^deal\.won$/.test(eventType)) {
    return policy("sales.deal.won",["sales","lifecycle","analytics"],"info","route")
  }

  if (/^deal\.lost$/.test(eventType)) {
    return policy("sales.deal.lost",["sales","analytics"],"warning","route")
  }

  if (/^deal\./.test(eventType)) {
    return policy("sales.deal",["sales","tasks"],"info","route")
  }

  if (/^proposal\.(sent|viewed)$/.test(eventType)) {
    return policy("sales.proposal.attention",["proposals","sales","tasks"],"info","propose")
  }

  if (/^proposal\.accepted$/.test(eventType)) {
    return policy("sales.proposal.accepted",["proposals","sales","lifecycle"],"info","route")
  }

  if (/^proposal\./.test(eventType)) {
    return policy("sales.proposal",["proposals","sales"],"info","route")
  }

  if (/^transaction\.(refunded|cancelled)$/.test(eventType)) {
    return policy("lifecycle.transaction.reversed",["lifecycle","billing","analytics"],"warning","route")
  }

  if (/^transaction\.completed$/.test(eventType)) {
    return policy("lifecycle.transaction.completed",["lifecycle","customer","analytics"],"info","route")
  }

  if (/^review\./.test(eventType)) {
    return policy("lifecycle.review",["lifecycle","customer"],"info","route")
  }

  if (/^(checkout|lead)\.(abandoned|stalled)/.test(eventType)) {
    return policy("acquisition.recovery",["acquisition","sales","opportunities","tasks"],"warning","propose")
  }

  if (/^(checkout|lead)\./.test(eventType)) {
    return policy("acquisition.lead",["acquisition","sales"],"info","route")
  }

  if (/^whatsapp\.session\./.test(eventType)) {
    return policy(
      "integration.whatsapp.session",
      ["integrations","inbox"],
      /failed|disconnected|stopped/.test(eventType) ? "warning" : "info",
      /failed|disconnected|stopped/.test(eventType) ? "propose" : "observe",
    )
  }

  if (/^(webhook|api|integration)\./.test(eventType)) {
    return policy(
      "integration.external",
      ["integrations"],
      /failed|error|dead/.test(eventType) ? "warning" : "info",
      /failed|error|dead/.test(eventType) ? "propose" : "observe",
    )
  }

  if (/^privacy\./.test(eventType)) {
    return policy("privacy.request",["privacy","customer"],"warning","route")
  }

  if (/^(billing|subscription|usage)\./.test(eventType)) {
    return policy(
      "billing.account",
      ["billing"],
      /past.due|failed|limit|quota/.test(eventType) ? "warning" : "info",
      "route",
    )
  }

  if (/^automation\./.test(eventType)) {
    return policy(
      "automation.runtime",
      ["automation"],
      /failed|dead|error/.test(eventType) ? "warning" : "info",
      /failed|dead|error/.test(eventType) ? "propose" : "observe",
    )
  }

  if (/^ai\./.test(eventType)) {
    return policy("ai.runtime",["ai"],/failed|error/.test(eventType) ? "warning" : "info","observe")
  }

  return policy("operations.fallback",["operations","analytics"],"info","route")
}
