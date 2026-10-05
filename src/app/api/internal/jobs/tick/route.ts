import { timingSafeEqual } from "node:crypto"
import { runWorkerTick } from "@/lib/server/worker/process"

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorized(request: Request) {
  const expected = String(process.env.CRM_WORKER_SECRET || "")
  if (!expected) return false

  const bearer = request.headers.get("authorization") || ""
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : ""
  const header = request.headers.get("x-crm-worker-secret") || ""
  const received = token || header

  return Boolean(received) && secureEqual(received, expected)
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get("limit") || 20)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 25) : 20
  const region = String(process.env.VERCEL_REGION || "local")
  const workerId = `crm-${region}-${crypto.randomUUID()}`

  const result = await runWorkerTick({
    workerId,
    limit,
    kinds: ["event_router","automation","action_execution","outbound_message","webhook","contact_import"],
  })

  return Response.json({ ok: true, workerId, ...result })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
