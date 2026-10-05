import { timingSafeEqual } from "node:crypto"
import { runWorkerTick } from "@/lib/server/worker/process"

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorized(request: Request) {
  const workerSecret = String(process.env.CRM_WORKER_SECRET || "").trim()
  const cronSecret = String(process.env.CRON_SECRET || "").trim()

  const bearer = request.headers.get("authorization") || ""
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : ""
  const header = String(request.headers.get("x-crm-worker-secret") || "").trim()
  const received = token || header

  if (!received) return false

  return [workerSecret,cronSecret]
    .filter(Boolean)
    .some(expected => secureEqual(received,expected))
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 })

  const supabaseReady = Boolean(
    String(process.env.SUPABASE_URL || "").trim()
    && String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  )
  if (!supabaseReady) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: "supabase_not_configured",
    }, {
      headers: { "Cache-Control": "no-store" },
    })
  }

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get("limit") || 20)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 25) : 20
  const region = String(process.env.VERCEL_REGION || "local")
  const workerId = `crm-${region}-${crypto.randomUUID()}`

  const result = await runWorkerTick({
    workerId,
    limit,
    kinds: ["event_router","automation","commercial_intelligence","action_execution","outbound_message","webhook","contact_import"],
  })

  return Response.json({ ok: true, workerId, ...result })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
