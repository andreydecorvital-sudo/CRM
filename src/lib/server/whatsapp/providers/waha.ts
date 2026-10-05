import type { WhatsappProvider, WhatsappSendInput, WhatsappSendResult } from "../types"

function env() {
  const baseUrl = String(process.env.WAHA_BASE_URL || "").trim().replace(/\/+$/, "")
  const apiKey = String(process.env.WAHA_API_KEY || "").trim()
  const session = String(process.env.WAHA_SESSION || "default").trim() || "default"
  if (!baseUrl || !apiKey) throw new Error("WAHA não configurado.")
  return { baseUrl, apiKey, session }
}

export class WahaProvider implements WhatsappProvider {
  readonly name = "waha"

  async sendText(input: WhatsappSendInput): Promise<WhatsappSendResult> {
    const { baseUrl, apiKey, session } = env()
    const response = await fetch(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ session, chatId: input.to, text: input.text }),
      cache: "no-store",
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(data.message || data.error || `WAHA HTTP ${response.status}`))
    const id = String(data.id || data.messageId || (data.key as Record<string, unknown> | undefined)?.id || crypto.randomUUID())
    return { accepted: true, providerMessageId: id }
  }
}
