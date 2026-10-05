export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return

  const { registerOTel } = await import("@vercel/otel")
  const serviceName = String(process.env.OTEL_SERVICE_NAME || "crm-platform").trim() || "crm-platform"
  const langfuseEnabled = Boolean(
    String(process.env.LANGFUSE_PUBLIC_KEY || "").trim()
    && String(process.env.LANGFUSE_SECRET_KEY || "").trim(),
  )

  if (!langfuseEnabled) {
    registerOTel(serviceName)
    return
  }

  const [{ LangfuseSpanProcessor }, { TraceIdRatioBasedSampler }] = await Promise.all([
    import("@langfuse/otel"),
    import("@opentelemetry/sdk-trace-base"),
  ])

  const rawSampleRate = Number(process.env.LANGFUSE_SAMPLE_RATE ?? 1)
  const sampleRate = Number.isFinite(rawSampleRate)
    ? Math.min(Math.max(rawSampleRate,0),1)
    : 1

  registerOTel({
    serviceName,
    traceSampler: new TraceIdRatioBasedSampler(sampleRate),
    spanProcessors: [new LangfuseSpanProcessor()],
  })
}
