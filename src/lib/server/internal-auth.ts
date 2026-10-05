import { timingSafeEqual } from "node:crypto"

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a,b)
}

export function assertInternalRequest(request: Request) {
  const expected = String(process.env.CRM_INTERNAL_SECRET || "").trim()
  const bearer = String(request.headers.get("authorization") || "")
  const header = String(request.headers.get("x-crm-internal-secret") || "")
  const received = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : header.trim()

  if (!expected || !received || !safeEqual(expected,received)) {
    throw new Error("unauthorized")
  }
}
