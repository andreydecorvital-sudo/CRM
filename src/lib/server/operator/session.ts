import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { supabaseRest } from "@/lib/server/supabase/rest"

const COOKIE_NAME = "crm_internal_pilot"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_AGE_SECONDS = 60 * 60 * 8

type Ticket = { userId: string; tenantId: string; expiresAt: number }
export type Operator = { userId: string; tenantId: string; role: "owner"|"admin"|"manager"|"agent"|"viewer" }

function secrets() {
  const secret = process.env.CRM_OPERATOR_SESSION_SECRET || ""
  const tenantId = process.env.CRM_OPERATOR_TENANT_ID || ""
  if (secret.length < 32 || !UUID.test(tenantId)) return null
  return { secret, tenantId }
}

export function pilotConfigured() {
  return Boolean(secrets() && process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

function makeTicket(ticket: Ticket, secret: string) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url")
  return `${payload}.${sign(payload, secret)}`
}

function readTicket(raw: string | undefined, secret: string): Ticket | null {
  if (!raw || raw.length > 2048) return null
  const parts = raw.split(".")
  if (parts.length !== 2) return null
  const [payload, mac] = parts
  const expected = Buffer.from(sign(payload,secret))
  const supplied = Buffer.from(mac)
  if (expected.length !== supplied.length || !timingSafeEqual(expected,supplied)) return null
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload,"base64url").toString("utf8"))
    if (!decoded || typeof decoded !== "object") return null
    const ticket = decoded as Ticket
    if (!UUID.test(ticket.userId) || !UUID.test(ticket.tenantId) || !Number.isFinite(ticket.expiresAt)
      || ticket.expiresAt <= Date.now() || ticket.expiresAt > Date.now() + MAX_AGE_SECONDS * 1000) return null
    return ticket
  } catch { return null }
}

async function membership(userId: string, tenantId: string): Promise<Operator | null> {
  const rows = await supabaseRest<Array<{role:Operator["role"]}>>(
    "GET",
    `/tenant_members?tenant_id=eq.${tenantId}&user_id=eq.${userId}&select=role&limit=1`,
  )
  const role = rows?.[0]?.role
  if (!role || !["owner","admin","manager","agent","viewer"].includes(role)) return null
  return { userId, tenantId, role }
}

export async function operatorFromCookie(): Promise<Operator | null> {
  const config=secrets()
  if (!config) return null
  const store=await cookies()
  const ticket=readTicket(store.get(COOKIE_NAME)?.value,config.secret)
  if (!ticket || ticket.tenantId !== config.tenantId) return null
  return membership(ticket.userId,ticket.tenantId)
}

export async function signInOperator(email: string, password: string): Promise<boolean> {
  const config=secrets()
  if (!config || !pilotConfigured()) return false
  if (email.length > 320 || password.length > 1024 || !email.includes("@")) return false
  const url=String(process.env.SUPABASE_URL).replace(/\/+$/,"")
  const key=process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""
  const response=await fetch(`${url}/auth/v1/token?grant_type=password`,{
    method:"POST",cache:"no-store",
    headers:{apikey:key,"Content-Type":"application/json"},
    body:JSON.stringify({email,password}),
    signal:AbortSignal.timeout(10000),
  })
  if (!response.ok) return false
  const login = await response.json() as { user?: {id?:string} }
  if (!login.user?.id || !UUID.test(login.user.id)) return false
  const member=await membership(login.user.id,config.tenantId)
  if (!member || member.role==="viewer") return false
  const ticket=makeTicket({
    userId:login.user.id,tenantId:config.tenantId,
    expiresAt:Date.now()+MAX_AGE_SECONDS*1000,
  },config.secret)
  const store=await cookies()
  store.set(COOKIE_NAME,ticket,{
    httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",
    path:"/",maxAge:MAX_AGE_SECONDS,
  })
  return true
}

export async function signOutOperator() {
  const store=await cookies()
  store.delete(COOKIE_NAME)
}

export function safeMutationOrigin(request: Request): boolean {
  const origin=request.headers.get("origin")
  if (!origin) return false
  try { return new URL(origin).origin===new URL(request.url).origin }
  catch { return false }
}

export function forbiddenResponse() {
  return Response.json({error:"not_authenticated"},{status:401,headers:{"Cache-Control":"no-store"}})
}
