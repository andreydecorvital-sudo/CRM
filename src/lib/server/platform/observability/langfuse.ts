type TraceMetadata = Record<string,string | number | boolean | null>

export type AiTraceHandle = {
  setResult(input: {
    status: "success" | "error"
    model?: string
    latencyMs?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    output?: unknown
    errorClass?: string
  }): void
}

function enabled() {
  return Boolean(
    String(process.env.LANGFUSE_PUBLIC_KEY || "").trim()
    && String(process.env.LANGFUSE_SECRET_KEY || "").trim(),
  )
}

function captureContent() {
  return String(process.env.LANGFUSE_CAPTURE_CONTENT || "").toLowerCase() === "true"
}

function safeMetadata(metadata: TraceMetadata) {
  const result: TraceMetadata = {}
  for (const [rawKey,value] of Object.entries(metadata)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_]/g,"").slice(0,80)
    if (!key) continue
    result[key] = typeof value === "string" ? value.slice(0,200) : value
  }
  return result
}

export async function withAiTrace<T>(input: {
  name: string
  tenantId: string
  feature: string
  model: string
  traceInput?: unknown
}, execute: (trace: AiTraceHandle) => Promise<T>): Promise<T> {
  if (!enabled()) {
    return execute({ setResult:() => undefined })
  }

  const { startActiveObservation } = await import("@langfuse/tracing")
  const started = Date.now()

  return startActiveObservation(
    String(input.name || "ai-request").slice(0,160),
    async span => {
      const baseMetadata = safeMetadata({
        tenantId:input.tenantId,
        feature:input.feature,
        model:input.model,
        service:process.env.OTEL_SERVICE_NAME || "crm-platform",
      })

      span.update({
        metadata:baseMetadata,
        ...(captureContent() ? { input:input.traceInput } : {}),
      })

      const handle: AiTraceHandle = {
        setResult(result) {
          const latencyMs = result.latencyMs ?? Date.now() - started
          span.update({
            metadata:safeMetadata({
              ...baseMetadata,
              status:result.status,
              model:result.model || input.model,
              latencyMs,
              inputTokens:result.inputTokens ?? null,
              outputTokens:result.outputTokens ?? null,
              totalTokens:result.totalTokens ?? null,
              errorClass:result.errorClass ?? null,
            }),
            ...(captureContent() && result.output !== undefined
              ? { output:result.output }
              : {}),
          })
        },
      }

      return execute(handle)
    },
  )
}
