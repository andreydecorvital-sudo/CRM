export type EmailSendInput = {
  tenantId: string
  to: string
  subject: string
  text: string
  html?: string | null
  replyTo?: string | null
  tags?: Array<{ name: string; value: string }>
}

export type EmailSendResult = {
  accepted: boolean
  providerMessageId: string
}

export interface EmailProvider {
  readonly name: string
  send(input: EmailSendInput): Promise<EmailSendResult>
}
