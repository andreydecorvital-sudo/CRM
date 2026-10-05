import { supabaseRest } from "@/lib/server/supabase/rest"
import { evaluateConditions } from "./conditions"
import { executeAutomationAction } from "./actions"
import { scoreEvent } from "./scoring"
import type { AutomationRule, DomainEvent } from "./types"

type AutomationRun = {
  id: string
  status: "running" | "succeeded" | "failed" | "skipped"
  started_at?: string
}

async function loadEvent(eventId: string) {
  const rows = await supabaseRest<DomainEvent[]>(
    "GET",
    `/domain_events?id=eq.${encodeURIComponent(eventId)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function loadRules(event: DomainEvent) {
  const rows = await supabaseRest<AutomationRule[]>(
    "GET",
    `/automation_rules?tenant_id=eq.${encodeURIComponent(event.tenant_id)}&enabled=eq.true&trigger_event=eq.${encodeURIComponent(event.event_type)}&select=*&order=priority.asc,created_at.asc`,
  )
  return Array.isArray(rows) ? rows : []
}

async function existingRun(ruleId: string, eventId: string) {
  const rows = await supabaseRest<AutomationRun[]>(
    "GET",
    `/automation_runs?rule_id=eq.${encodeURIComponent(ruleId)}&event_id=eq.${encodeURIComponent(eventId)}&select=id,status,started_at&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function lastSuccessfulRun(ruleId: string, subjectKey: string) {
  const rows = await supabaseRest<AutomationRun[]>(
    "GET",
    `/automation_runs?rule_id=eq.${encodeURIComponent(ruleId)}&subject_key=eq.${encodeURIComponent(subjectKey)}&status=eq.succeeded&select=id,status,started_at&order=started_at.desc&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function processAutomationEvent(eventId: string) {
  const event = await loadEvent(eventId)
  if (!event) throw new Error("Evento não encontrado.")
  if (event.status === "processed") return { alreadyProcessed: true, rulesMatched: 0, actionsExecuted: 0 }

  await supabaseRest("PATCH", `/domain_events?id=eq.${encodeURIComponent(event.id)}`, {
    status: "processing",
    attempts: event.attempts + 1,
    last_error: null,
  })

  let rulesMatched = 0
  let actionsExecuted = 0
  const failures: string[] = []

  try {
    const scoring = await scoreEvent(event)
    const rules = await loadRules(event)
    const subject = {
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      contactId: event.contact_id,
      payload: event.payload,
      occurredAt: event.occurred_at,
    }

    for (const rule of rules) {
      const previous = await existingRun(rule.id, event.id)
      if (previous?.status === "succeeded" || previous?.status === "skipped") continue

      const subjectKey = event.contact_id
        ? `contact:${event.contact_id}`
        : `aggregate:${event.aggregate_type}:${event.aggregate_id || "none"}`
      const previousSuccess = rule.cooldown_seconds > 0
        ? await lastSuccessfulRun(rule.id, subjectKey)
        : null
      const lastTriggered = previousSuccess?.started_at ? new Date(previousSuccess.started_at).getTime() : 0
      const inCooldown = rule.cooldown_seconds > 0 && lastTriggered > 0
        && Date.now() - lastTriggered < rule.cooldown_seconds * 1000
      const matches = !inCooldown && evaluateConditions(subject, rule.conditions)

      let runId = previous?.id ?? null
      if (!runId) {
        const created = await supabaseRest<Array<{ id: string }>>("POST", "/automation_runs", [{
          tenant_id: event.tenant_id,
          rule_id: rule.id,
          event_id: event.id,
          status: matches ? "running" : "skipped",
          subject_key: subjectKey,
          input: { event: subject, subjectKey },
          output: matches ? {} : { reason: inCooldown ? "cooldown" : "conditions-not-matched" },
          completed_at: matches ? null : new Date().toISOString(),
        }])
        runId = Array.isArray(created) ? created[0]?.id ?? null : null
      } else if (matches) {
        await supabaseRest("PATCH", `/automation_runs?id=eq.${encodeURIComponent(runId)}`, {
          status: "running",
          error: null,
          started_at: new Date().toISOString(),
          completed_at: null,
        })
      }

      if (!matches) continue
      rulesMatched += 1

      const outputs: unknown[] = []
      try {
        const actions = Array.isArray(rule.actions) ? rule.actions : []
        for (let index = 0; index < actions.length; index += 1) {
          const output = await executeAutomationAction(actions[index], {
            event,
            rule,
            actionIndex: index,
          })
          outputs.push(output)
          actionsExecuted += 1
        }

        if (runId) {
          await supabaseRest("PATCH", `/automation_runs?id=eq.${encodeURIComponent(runId)}`, {
            status: "succeeded",
            output: { actions: outputs },
            completed_at: new Date().toISOString(),
          })
        }

        await supabaseRest("PATCH", `/automation_rules?id=eq.${encodeURIComponent(rule.id)}`, {
          last_triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        if (rule.stop_on_match) break
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`${rule.name}: ${message}`)
        if (runId) {
          await supabaseRest("PATCH", `/automation_runs?id=eq.${encodeURIComponent(runId)}`, {
            status: "failed",
            error: message.slice(0, 4000),
            output: { actions: outputs },
            completed_at: new Date().toISOString(),
          })
        }
        throw error
      }
    }

    await supabaseRest("PATCH", `/domain_events?id=eq.${encodeURIComponent(event.id)}`, {
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })

    return { scoring, rulesMatched, actionsExecuted, failures }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabaseRest("PATCH", `/domain_events?id=eq.${encodeURIComponent(event.id)}`, {
      status: "failed",
      last_error: message.slice(0, 4000),
      next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
    }).catch(() => null)
    throw error
  }
}
