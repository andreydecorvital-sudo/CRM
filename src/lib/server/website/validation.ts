export type WebsiteLead = {
  requestId: string
  displayName: string
  email: string | null
  phoneE164: string | null
  message: string
  pageUrl: string
  utm: Record<string,string>
  privacyConsent: true
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UTM_FIELDS = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"] as const

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export function normalizeWebsiteOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

export function isAllowedWebsiteOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin || !Array.isArray(allowed)) return false
  const normalized = normalizeWebsiteOrigin(origin)
  return Boolean(normalized && allowed.some(value => normalizeWebsiteOrigin(value) === normalized))
}

function readString(record: Record<string,unknown>, field: string, max: number): string {
  const value = record[field]
  if (value == null || value === "") return ""
  if (typeof value !== "string" || value.length > max * 2) throw new Error("invalid_" + field)
  return value.trim().slice(0,max)
}

export function parseWebsiteLead(body: unknown, origin: string): WebsiteLead {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_payload")
  const input = body as Record<string,unknown>
  const requestId = readString(input,"requestId",50)
  if (!isUuid(requestId)) throw new Error("invalid_request_id")

  // Site forms accept permission to REPLY to the requested inquiry, not marketing opt-in.
  if (input.privacyConsent !== true) throw new Error("privacy_consent_required")
  const displayName = readString(input,"displayName",160)
  if (displayName.length < 2) throw new Error("invalid_name")
  const email = readString(input,"email",320).toLowerCase() || null
  const phone = readString(input,"phone",32) || null
  if (!email && !phone) throw new Error("contact_method_required")
  if (email && !EMAIL.test(email)) throw new Error("invalid_email")
  if (phone && (phone.replace(/\D/g,"").length < 8 || !/^\+?[0-9 ()-]+$/.test(phone))) throw new Error("invalid_phone")

  const pageUrl = readString(input,"pageUrl",1000)
  if (pageUrl) {
    let parsed: URL
    try { parsed = new URL(pageUrl) } catch { throw new Error("invalid_page_url") }
    if (parsed.origin !== origin || !["http:","https:"].includes(parsed.protocol)) throw new Error("invalid_page_url")
  }

  const rawUtm = input.utm && typeof input.utm === "object" && !Array.isArray(input.utm)
    ? input.utm as Record<string,unknown> : {}
  const utm: Record<string,string> = {}
  for (const field of UTM_FIELDS) {
    if (typeof rawUtm[field] === "string") utm[field] = (rawUtm[field] as string).slice(0,120)
  }
  return {
    requestId,displayName,email,phoneE164:phone,
    message:readString(input,"message",2000),pageUrl,utm,
    privacyConsent:true,
  }
}
