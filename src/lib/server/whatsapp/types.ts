export type WhatsappInbound = {
  tenantId: string
  externalContactId: string
  externalMessageId: string
  phoneE164?: string | null
  displayName?: string | null
  text: string
  receivedAt: string
  metadata?: Record<string, unknown>
}

export type WhatsappSendInput = {
  tenantId: string
  to: string
  text: string
}

export type WhatsappSendResult = {
  accepted: boolean
  providerMessageId: string
}

export interface WhatsappProvider {
  readonly name: string
  sendText(input: WhatsappSendInput): Promise<WhatsappSendResult>
}
