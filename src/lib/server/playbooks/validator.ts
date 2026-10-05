import type { AutomationAction, AutomationCondition } from "../automation/types"
import type { PlaybookDefinition } from "./types"

const EVENT_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i
const ALLOWED_ROOTS = new Set([
  "eventType",
  "aggregateType",
  "aggregateId",
  "contactId",
  "payload",
  "occurredAt",
])

const ACTION_TYPES = new Set<AutomationAction["type"]>([
  "task.create",
  "contact.tag",
  "deal.follow_up",
  "conversation.set_department",
  "message.queue",
  "notification.create",
])

function text(value: unknown,max: number) {
  return String(value ?? "").trim().slice(0,max)
}

function conditionErrors(condition: AutomationCondition,index: number,group: string) {
  const errors: string[] = []
  const path = text(condition.path,240)
  const root = path.split(".")[0]

  if (!path) errors.push(`${group}[${index}] sem path.`)
  else if (!ALLOWED_ROOTS.has(root)) {
    errors.push(`${group}[${index}] usa raiz não permitida: ${root}.`)
  }

  if (!["eq","neq","gt","gte","lt","lte","contains","exists","in"].includes(condition.op)) {
    errors.push(`${group}[${index}] usa operador inválido.`)
  }

  if (condition.op === "in" && !Array.isArray(condition.value)) {
    errors.push(`${group}[${index}] com op=in exige array.`)
  }

  return errors
}

function actionWarnings(action: AutomationAction,index: number) {
  const warnings: string[] = []
  if (action.type === "message.queue") {
    const purpose = text(action.params.purpose,40) || "support"
    if (["sales","marketing","opportunity"].includes(purpose)) {
      warnings.push(`actions[${index}] envia mensagem promocional e depende de consentimento no momento do envio.`)
    }
  }
  if (action.type === "conversation.set_department") {
    warnings.push(`actions[${index}] altera ownership/fila e deve ser validada em shadow antes da ativação.`)
  }
  return warnings
}

export function validatePlaybook(playbook: PlaybookDefinition) {
  const errors: string[] = []
  const warnings: string[] = []

  if (!text(playbook.key,120)) errors.push("key obrigatório.")
  if (!/^[a-z0-9][a-z0-9_-]{1,119}$/i.test(text(playbook.key,120))) {
    errors.push("key deve usar apenas letras, números, _ e -.")
  }

  if (!text(playbook.name,180)) errors.push("name obrigatório.")
  if (!text(playbook.description,2000)) warnings.push("description vazia.")
  if (!Number.isInteger(playbook.version) || playbook.version < 1) errors.push("version inválida.")

  const trigger = text(playbook.triggerEvent,120)
  if (!trigger || !EVENT_PATTERN.test(trigger)) errors.push("triggerEvent inválido.")

  if (!["draft","shadow","active"].includes(playbook.mode)) errors.push("mode inválido.")
  if (!Number.isInteger(playbook.priority) || playbook.priority < 1 || playbook.priority > 1000) {
    errors.push("priority deve ficar entre 1 e 1000.")
  }
  if (!Number.isInteger(playbook.cooldownSeconds) || playbook.cooldownSeconds < 0 || playbook.cooldownSeconds > 2_592_000) {
    errors.push("cooldownSeconds inválido.")
  }

  const all = Array.isArray(playbook.conditions?.all) ? playbook.conditions.all : []
  const any = Array.isArray(playbook.conditions?.any) ? playbook.conditions.any : []
  if (all.length + any.length > 40) errors.push("playbook excede 40 condições.")

  all.forEach((condition,index) => errors.push(...conditionErrors(condition,index,"all")))
  any.forEach((condition,index) => errors.push(...conditionErrors(condition,index,"any")))

  const actions = Array.isArray(playbook.actions) ? playbook.actions : []
  if (!actions.length) errors.push("playbook exige ao menos uma ação.")
  if (actions.length > 20) errors.push("playbook excede 20 ações.")

  actions.forEach((action,index) => {
    if (!ACTION_TYPES.has(action.type)) errors.push(`actions[${index}] usa tipo não suportado.`)
    if (!action.params || typeof action.params !== "object" || Array.isArray(action.params)) {
      errors.push(`actions[${index}] params inválido.`)
    }
    warnings.push(...actionWarnings(action,index))
  })

  if (playbook.mode === "active") {
    warnings.push("Playbook ativo deve possuir simulação recente antes de publicação no banco.")
  }

  return {
    valid:errors.length === 0,
    errors,
    warnings:[...new Set(warnings)],
  }
}
