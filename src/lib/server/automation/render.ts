import { readPath } from "./conditions"

const TOKEN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g

export function renderString(template: string, context: unknown) {
  return template.replace(TOKEN, (_, path: string) => {
    const value = readPath(context, path)
    if (value === null || value === undefined) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  })
}

export function renderValue(value: unknown, context: unknown): unknown {
  if (typeof value === "string") return renderString(value, context)
  if (Array.isArray(value)) return value.map(item => renderValue(item, context))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, renderValue(item, context)]),
    )
  }
  return value
}
