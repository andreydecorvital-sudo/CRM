import type { AutomationRule } from "../automation/types"
import type { CompiledPlaybook, PlaybookDefinition } from "./types"
import { validatePlaybook } from "./validator"

export function compilePlaybook(input: {
  tenantId: string
  playbook: PlaybookDefinition
  simulationApproved?: boolean
}): CompiledPlaybook {
  const validation = validatePlaybook(input.playbook)
  if (!validation.valid) {
    throw new Error(`Playbook inválido: ${validation.errors.join(" ")}`)
  }

  if (input.playbook.mode === "active" && input.simulationApproved !== true) {
    throw new Error("Playbook ativo exige simulationApproved=true.")
  }

  const rule: Omit<AutomationRule,"id" | "last_triggered_at"> = {
    tenant_id:input.tenantId,
    name:input.playbook.name,
    trigger_event:input.playbook.triggerEvent,
    conditions:input.playbook.conditions,
    actions:input.playbook.actions,
    enabled:input.playbook.mode === "active",
    priority:input.playbook.priority,
    stop_on_match:input.playbook.stopOnMatch,
    cooldown_seconds:input.playbook.cooldownSeconds,
  }

  return {
    playbookKey:input.playbook.key,
    playbookVersion:input.playbook.version,
    rule,
    warnings:validation.warnings,
  }
}
