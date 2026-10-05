export type AttributionInput = {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  clickId: string | null
  referrer: string | null
  landingPath: string | null
}

const clean = (value: string | null | undefined, max = 240) => {
  const normalized = String(value || "").trim()
  return normalized ? normalized.slice(0, max) : null
}

export function attributionFromUrl(urlValue: string, referrerValue?: string | null): AttributionInput {
  const url = new URL(urlValue)
  const params = url.searchParams
  const clickId =
    clean(params.get("gclid")) ||
    clean(params.get("fbclid")) ||
    clean(params.get("ttclid")) ||
    clean(params.get("msclkid"))

  let referrerSource: string | null = null
  if (referrerValue) {
    try {
      referrerSource = new URL(referrerValue).hostname.replace(/^www\./, "")
    } catch {
      referrerSource = null
    }
  }

  return {
    source: clean(params.get("utm_source")) || referrerSource || "direct",
    medium: clean(params.get("utm_medium")) || (clickId ? "paid" : referrerSource ? "referral" : "direct"),
    campaign: clean(params.get("utm_campaign")),
    content: clean(params.get("utm_content")),
    term: clean(params.get("utm_term")),
    clickId,
    referrer: clean(referrerValue, 500),
    landingPath: clean(`${url.pathname}${url.search}`, 1000),
  }
}

export function attributionFingerprint(input: AttributionInput): string {
  return [
    input.source,
    input.medium,
    input.campaign,
    input.content,
    input.term,
    input.clickId,
    input.landingPath,
  ].map(value => value || "").join("|")
}
