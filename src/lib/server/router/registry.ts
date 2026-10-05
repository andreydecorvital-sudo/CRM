import type { ActionAdapter } from "./contracts"
import { internalActionAdapters } from "./adapters/internal"

const registry = new Map<string,ActionAdapter>()

for (const adapter of internalActionAdapters) {
  if (registry.has(adapter.actionType)) {
    throw new Error(`Action adapter duplicado: ${adapter.actionType}`)
  }
  registry.set(adapter.actionType,adapter)
}

export function getActionAdapter(actionType: string) {
  return registry.get(actionType) ?? null
}

export function listActionAdapters() {
  return [...registry.values()].map(adapter => ({
    key: adapter.key,
    actionType: adapter.actionType,
    semantics: adapter.semantics,
  }))
}
