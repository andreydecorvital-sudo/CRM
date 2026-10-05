import { captureProductEvent } from "@/lib/server/platform/analytics/posthog"
import { withAiTrace } from "@/lib/server/platform/observability/langfuse"

export type AiGatewayRole = "system" | "user" | "assistant" | "tool"

export type AiGatewayMessage = {
  role: AiGatewayRole
  content: string
  name?: string
  tool_call_id?: string
}

export type AiGatewayUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type AiGatewayResult = {
  id: string
  model: string
  content: string
  finishReason: string | null
  usage: AiGatewayUsage
  latencyMs: number
}

type GatewayResponse = {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

function config() {
  const baseUrl = String(process.env.AI_GATEWAY_BASE_URL || "").trim().replace(/\/+$/,"")
  const apiKey = String(process.env.AI_GATEWAY_API_KEY || "").trim()
  const model = String(process.env.AI_GATEWAY_MODEL || "").trim()
  const timeoutMsRaw = Number(process.env.AI_GATEWAY_TIMEOUT_MS ?? 45_000)
  const timeoutMs = Number.isFinite(timeoutMsRaw)
    ? Math.min(Math.max(Math.trunc(timeoutMsRaw),5_000),180_000)
    : 45_000

  if (!baseUrl || !apiKey || !model) {
    throw new Error("AI Gateway não configurado.")
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("AI_GATEWAY_BASE_URL inválida.")
  }

  return { baseUrl,apiKey,model,timeoutMs }
}

function endpoint(baseUrl: string) {
  return baseUrl.endsWith("/v1")
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`
}

function normalizeMessages(messages: AiGatewayMessage[]) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("AI Gateway exige ao menos uma mensagem.")
  }

  return messages.slice(-64).map(message => {
    const content = String(message.content || "").trim().slice(0,50_000)
    if (!content) throw new Error("Mensagem vazia no AI Gateway.")

    return {
      role:message.role,
      content,
      ...(message.name ? { name:String(message.name).slice(0,120) } : {}),
      ...(message.tool_call_id ? { tool_call_id:String(message.tool_call_id).slice(0,240) } : {}),
    }
  })
}

export async function aiChatCompletion(input: {
  tenantId: string
  feature: string
  messages: AiGatewayMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  traceInput?: unknown
}) {
  const gateway = config()
  const model = String(input.model || gateway.model).trim()
  const messages = normalizeMessages(input.messages)
  const started = Date.now()

  return withAiTrace({
    name:"ai-gateway.chat",
    tenantId:input.tenantId,
    feature:input.feature,
    model,
    traceInput:input.traceInput ?? messages,
  }, async trace => {
    try {
      const response = await fetch(endpoint(gateway.baseUrl),{
        method:"POST",
        headers:{
          Authorization:`Bearer ${gateway.apiKey}`,
          "Content-Type":"application/json",
          "X-CRM-Tenant":String(input.tenantId).slice(0,120),
          "X-CRM-Feature":String(input.feature).slice(0,120),
        },
        body:JSON.stringify({
          model,
          messages,
          ...(Number.isFinite(input.temperature)
            ? { temperature:Math.min(Math.max(Number(input.temperature),0),2) }
            : {}),
          ...(Number.isFinite(input.maxTokens)
            ? { max_tokens:Math.min(Math.max(Math.trunc(Number(input.maxTokens)),1),32_768) }
            : {}),
        }),
        cache:"no-store",
        signal:AbortSignal.timeout(gateway.timeoutMs),
      })

      const data = await response.json().catch(() => ({})) as GatewayResponse & {
        error?: unknown
        message?: unknown
      }

      if (!response.ok) {
        const detail = typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : `AI Gateway HTTP ${response.status}`
        throw new Error(detail.slice(0,1000))
      }

      const choice = Array.isArray(data.choices) ? data.choices[0] : null
      const content = String(choice?.message?.content || "").trim()
      if (!content) throw new Error("AI Gateway retornou resposta vazia.")

      const usage: AiGatewayUsage = {
        promptTokens:Number(data.usage?.prompt_tokens || 0),
        completionTokens:Number(data.usage?.completion_tokens || 0),
        totalTokens:Number(data.usage?.total_tokens || 0),
      }
      const latencyMs = Date.now() - started

      const result: AiGatewayResult = {
        id:String(data.id || ""),
        model:String(data.model || model),
        content,
        finishReason:choice?.finish_reason ?? null,
        usage,
        latencyMs,
      }

      trace.setResult({
        status:"success",
        model:result.model,
        latencyMs,
        inputTokens:usage.promptTokens,
        outputTokens:usage.completionTokens,
        totalTokens:usage.totalTokens,
        output:content,
      })

      await captureProductEvent({
        tenantId:input.tenantId,
        distinctId:`tenant:${input.tenantId}`,
        event:"ai request completed",
        properties:{
          feature:input.feature,
          model:result.model,
          latency_ms:latencyMs,
          prompt_tokens:usage.promptTokens,
          completion_tokens:usage.completionTokens,
          total_tokens:usage.totalTokens,
        },
      }).catch(() => null)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const latencyMs = Date.now() - started

      trace.setResult({
        status:"error",
        model,
        latencyMs,
        errorClass:error instanceof Error ? error.name : "UnknownError",
      })

      await captureProductEvent({
        tenantId:input.tenantId,
        distinctId:`tenant:${input.tenantId}`,
        event:"ai request failed",
        properties:{
          feature:input.feature,
          model,
          latency_ms:latencyMs,
          error_class:error instanceof Error ? error.name : "UnknownError",
        },
      }).catch(() => null)

      throw new Error(`AI Gateway: ${message}`)
    }
  })
}
