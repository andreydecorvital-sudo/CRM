import type { AutomationCondition, AutomationConditions } from "./types"

export function readPath(input: unknown, path: string): unknown {
  const parts = String(path || "")
    .split(".")
    .map(part => part.trim())
    .filter(Boolean)

  let current: unknown = input
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function equals(left: unknown, right: unknown) {
  if (left === right) return true
  if (typeof left === "number" || typeof right === "number") {
    const a = number(left)
    const b = number(right)
    return a !== null && b !== null && a === b
  }
  return String(left ?? "") === String(right ?? "")
}

export function evaluateCondition(subject: unknown, condition: AutomationCondition): boolean {
  const actual = readPath(subject, condition.path)
  const expected = condition.value

  switch (condition.op) {
    case "exists":
      return expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null
    case "eq":
      return equals(actual, expected)
    case "neq":
      return !equals(actual, expected)
    case "contains":
      if (typeof actual === "string") return actual.toLowerCase().includes(String(expected ?? "").toLowerCase())
      if (Array.isArray(actual)) return actual.some(item => equals(item, expected))
      return false
    case "in":
      return Array.isArray(expected) && expected.some(item => equals(actual, item))
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = number(actual)
      const b = number(expected)
      if (a === null || b === null) return false
      if (condition.op === "gt") return a > b
      if (condition.op === "gte") return a >= b
      if (condition.op === "lt") return a < b
      return a <= b
    }
    default:
      return false
  }
}

export function evaluateConditions(subject: unknown, conditions: AutomationConditions | null | undefined): boolean {
  const all = Array.isArray(conditions?.all) ? conditions.all : []
  const any = Array.isArray(conditions?.any) ? conditions.any : []
  const allPass = all.every(condition => evaluateCondition(subject, condition))
  const anyPass = any.length === 0 || any.some(condition => evaluateCondition(subject, condition))
  return allPass && anyPass
}
