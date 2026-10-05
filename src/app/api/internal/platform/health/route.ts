import { assertInternalRequest } from "@/lib/server/internal-auth"
import { platformReadiness } from "@/lib/server/platform/config"

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)

    return Response.json({
      ok:true,
      platform:platformReadiness(),
      notes:{
        aiGateway:"LiteLLM/OpenAI-compatible gateway; provider secrets stay outside the CRM.",
        posthog:"Server-side product analytics only; no PII fields are accepted by the helper.",
        langfuse:"OpenTelemetry tracing; prompt/response capture is opt-in.",
        queues:"Supabase Queues adoption waits for the isolated CRM project.",
        cron:"Supabase Cron adoption waits for the isolated CRM project.",
        vector:"pgvector adoption waits for an embedding use case and the isolated CRM project.",
      },
    },{
      headers:{ "Cache-Control":"no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") {
      return Response.json({ error:"unauthorized" },{ status:401 })
    }
    return Response.json({ error:"platform_health_error",message },{ status:400 })
  }
}
