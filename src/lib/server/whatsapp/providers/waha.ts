import type { WhatsappProvider, WhatsappSendInput, WhatsappSendResult } from "../types"

export type WahaProviderConfig = {
  baseUrl: string
  apiKey: string
  session: string
}

function normalize(config?: Partial<WahaProviderConfig>): WahaProviderConfig {
  const baseUrl = String(config?.baseUrl ?? process.env.WAHA_BASE_URL ?? "").trim().replace(/\/+$/, "")
  const apiKey = String(config?.apiKey ?? process.env.WAHA_API_KEY ?? "").trim()
  const session = String(config?.session ?? process.env.WAHA_SESSION ?? "default").trim() || "default"
  if (!baseUrl || !apiKey) throw new Error("WAHA não configurado.")
  return { baseUrl, apiKey, session }
}

export class WahaProvider implements WhatsappProvider {
  readonly name = "waha"
  private readonly config: WahaProviderConfig

  constructor(config?: Partial<WahaProviderConfig>) {
    this.config = normalize(config)
  }

  async sendText(input: WhatsappSendInput): Promise<WhatsappSendResult> {
    const { baseUrl, apiKey, session } = this.config
    const response = await fetch(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ session, chatId: input.to, text: input.text }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })

    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(data.message || data.error || `WAHA HTTP ${response.status}`))
    const id = String(
      data.id
      || data.messageId
      || (data.key as Record<string, unknown> | undefined)?.id
      || crypto.randomUUID(),
    )
    return { accepted: true, providerMessageId: id }
  }
}
