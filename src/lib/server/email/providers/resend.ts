import type { EmailProvider, EmailSendInput, EmailSendResult } from "../types"

export type ResendProviderConfig = {
  apiKey: string
  fromEmail: string
  fromName?: string | null
  replyTo?: string | null
  baseUrl?: string | null
}

function normalize(config: ResendProviderConfig) {
  const apiKey = String(config.apiKey || "").trim()
  const fromEmail = String(config.fromEmail || "").trim()
  const fromName = String(config.fromName || "").trim() || null
  const replyTo = String(config.replyTo || "").trim() || null
  const baseUrl = String(config.baseUrl || "https://api.resend.com").trim().replace(/\/+$/, "")

  if (!apiKey) throw new Error("Resend sem API key.")
  if (!fromEmail || !fromEmail.includes("@")) throw new Error("Resend sem remetente válido.")

  return { apiKey, fromEmail, fromName, replyTo, baseUrl }
}

export class ResendProvider implements EmailProvider {
  readonly name = "resend"
  private readonly config: ReturnType<typeof normalize>

  constructor(config: ResendProviderConfig) {
    this.config = normalize(config)
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const from = this.config.fromName
      ? `${this.config.fromName} <${this.config.fromEmail}>`
      : this.config.fromEmail

    const response = await fetch(`${this.config.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo || this.config.replyTo
          ? { reply_to: input.replyTo || this.config.replyTo }
          : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })

    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(String(data.message || data.error || `Resend HTTP ${response.status}`))
    }

    const id = String(data.id || "")
    if (!id) throw new Error("Resend não retornou id da mensagem.")

    return { accepted: true, providerMessageId: id }
  }
}
