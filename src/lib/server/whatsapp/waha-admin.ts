import { supabaseRest } from "@/lib/server/supabase/rest"

type ConnectionRow = {
  id: string
  tenant_id: string
  provider: "waha"
  status: "disconnected" | "pairing" | "connected" | "error"
  provider_status: string | null
  phone_e164: string | null
  secret_ref: string | null
  config: Record<string, unknown>
  provider_metadata: Record<string, unknown>
  last_status_at: string | null
  last_health_at: string | null
  last_qr_at: string | null
  connected_at: string | null
  disconnected_at: string | null
  last_error: string | null
}

type WahaSession = {
  name?: string
  status?: string
  config?: Record<string, unknown>
  metadata?: Record<string, unknown>
  me?: Record<string, unknown> | null
  [key: string]: unknown
}

type WahaQr = {
  mimetype?: string
  data?: string
}

class WahaHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function configString(config: Record<string, unknown>, key: string) {
  const value = config?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function secretFromRef(ref: string | null) {
  if (!ref) {
    const fallback = String(process.env.WAHA_API_KEY || "").trim()
    if (!fallback) throw new Error("WAHA_API_KEY não configurada.")
    return fallback
  }
  if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(ref)) throw new Error("secret_ref do WAHA inválido.")
  const value = String(process.env[ref] || "").trim()
  if (!value) throw new Error(`Secret WAHA não configurado: ${ref}`)
  return value
}

function normalizeBaseUrl(value: string) {
  const url = value.trim().replace(/\/+$/,"")
  if (!/^https?:\/\//i.test(url)) throw new Error("Base URL WAHA inválida.")
  return url
}

function phoneFromMe(me: Record<string, unknown> | null | undefined) {
  const id = typeof me?.id === "string" ? me.id : ""
  const digits = id.replace(/@.*$/,"").replace(/\D/g,"")
  return digits ? `+${digits}` : null
}

function sessionStatus(value: unknown) {
  return String(value || "UNKNOWN").trim().toUpperCase() || "UNKNOWN"
}

async function loadConnection(tenantId: string) {
  const rows = await supabaseRest<ConnectionRow[]>(
    "GET",
    `/whatsapp_connections?tenant_id=eq.${encodeURIComponent(tenantId)}&provider=eq.waha&select=*&limit=1`,
  )
  const connection = Array.isArray(rows) ? rows[0] : null
  if (!connection) throw new Error("Tenant sem conexão WAHA configurada.")
  return connection
}

async function wahaRequest<T>(
  connection: ConnectionRow,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const baseUrl = normalizeBaseUrl(
    configString(connection.config,"baseUrl") || String(process.env.WAHA_BASE_URL || ""),
  )
  const apiKey = secretFromRef(connection.secret_ref)
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })

  const text = await response.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }

  if (!response.ok) {
    const record = data && typeof data === "object" ? data as Record<string, unknown> : null
    const message = String(record?.message || record?.error || data || `WAHA HTTP ${response.status}`)
    throw new WahaHttpError(response.status,message)
  }

  return data as T
}

export async function recordWahaSessionStatus(input: {
  tenantId: string
  session: string
  status: string
  phoneE164?: string | null
  error?: string | null
  metadata?: Record<string, unknown>
}) {
  return supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_record_whatsapp_session_status", {
    p_tenant_id: input.tenantId,
    p_provider: "waha",
    p_session_name: input.session,
    p_provider_status: sessionStatus(input.status),
    p_phone_e164: input.phoneE164 || null,
    p_error: input.error || null,
    p_metadata: input.metadata ?? {},
  })
}

export async function syncWahaSession(tenantId: string) {
  const connection = await loadConnection(tenantId)
  const session = configString(connection.config,"session")
  if (!session) throw new Error("Conexão WAHA sem session configurada.")

  try {
    const live = await wahaRequest<WahaSession>(
      connection,
      `/api/sessions/${encodeURIComponent(session)}`,
    )
    await recordWahaSessionStatus({
      tenantId,
      session,
      status: sessionStatus(live.status),
      phoneE164: phoneFromMe(live.me),
      metadata: {
        source: "status-poll",
        session: typeof live.name === "string" ? live.name : session,
        engine: live.engine && typeof live.engine === "object"
          ? String((live.engine as Record<string, unknown>).engine || "")
          : null,
      },
    })
    return live
  } catch (error) {
    if (error instanceof WahaHttpError && error.status === 404) {
      await recordWahaSessionStatus({
        tenantId,
        session,
        status: "STOPPED",
        error: "session-not-found",
        metadata: { source: "status-poll", notFound: true },
      }).catch(() => null)
      return null
    }
    throw error
  }
}

function buildWebhookUrl(tenantId: string) {
  const base = String(process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/,"")
  if (!/^https:\/\//i.test(base)) throw new Error("NEXT_PUBLIC_APP_URL HTTPS obrigatória para webhook WAHA.")
  return `${base}/api/webhooks/whatsapp/waha?tenant=${encodeURIComponent(tenantId)}`
}

function webhookSecret() {
  const value = String(process.env.WHATSAPP_WEBHOOK_SECRET || "").trim()
  if (!value) throw new Error("WHATSAPP_WEBHOOK_SECRET não configurado.")
  return value
}

export async function provisionWahaSession(tenantId: string) {
  const connection = await loadConnection(tenantId)
  const session = configString(connection.config,"session")
  if (!session) throw new Error("Conexão WAHA sem session configurada.")

  let live: WahaSession | null = null
  let created = false
  try {
    live = await wahaRequest<WahaSession>(
      connection,
      `/api/sessions/${encodeURIComponent(session)}`,
    )
  } catch (error) {
    if (!(error instanceof WahaHttpError) || error.status !== 404) throw error
  }

  if (!live) {
    created = true
    live = await wahaRequest<WahaSession>(connection,"/api/sessions",{
      method: "POST",
      body: JSON.stringify({
        name: session,
        config: {
          metadata: {
            "crm.tenant_id": tenantId,
          },
          ignore: {
            status: true,
            groups: true,
            channels: true,
            broadcast: true,
          },
          webhooks: [{
            url: buildWebhookUrl(tenantId),
            events: ["message","session.status"],
            customHeaders: [{
              name: "x-crm-webhook-secret",
              value: webhookSecret(),
            }],
            retries: {
              policy: "constant",
              delaySeconds: 2,
              attempts: 10,
            },
          }],
        },
      }),
    })
  }

  const started = await wahaRequest<WahaSession>(
    connection,
    `/api/sessions/${encodeURIComponent(session)}/start`,
    { method: "POST" },
  )

  const effective = started || live
  await recordWahaSessionStatus({
    tenantId,
    session,
    status: sessionStatus(effective?.status || "STARTING"),
    phoneE164: phoneFromMe(effective?.me),
    metadata: { source: "provision", sessionCreated: created },
  })

  return effective
}

export async function controlWahaSession(
  tenantId: string,
  action: "start" | "restart" | "stop" | "logout",
) {
  const connection = await loadConnection(tenantId)
  const session = configString(connection.config,"session")
  if (!session) throw new Error("Conexão WAHA sem session configurada.")

  const live = await wahaRequest<WahaSession>(
    connection,
    `/api/sessions/${encodeURIComponent(session)}/${action}`,
    { method: "POST" },
  )

  const fallback = action === "stop" || action === "logout" ? "STOPPED" : "STARTING"
  await recordWahaSessionStatus({
    tenantId,
    session,
    status: sessionStatus(live?.status || fallback),
    phoneE164: phoneFromMe(live?.me),
    metadata: { source: "control", action },
  })

  return live
}

export async function getWahaQr(tenantId: string) {
  const connection = await loadConnection(tenantId)
  const session = configString(connection.config,"session")
  if (!session) throw new Error("Conexão WAHA sem session configurada.")

  const live = await syncWahaSession(tenantId)
  const status = sessionStatus(live?.status)
  if (status === "WORKING") {
    return { status, connected: true, qr: null }
  }

  if (status !== "SCAN_QR_CODE") {
    return { status, connected: false, qr: null }
  }

  const qr = await wahaRequest<WahaQr>(
    connection,
    `/api/${encodeURIComponent(session)}/auth/qr?format=image`,
    { headers: { Accept: "application/json" } },
  )

  if (!qr?.data) throw new Error("WAHA não retornou QR válido.")

  await supabaseRest(
    "PATCH",
    `/whatsapp_connections?id=eq.${encodeURIComponent(connection.id)}`,
    { last_qr_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  )

  return {
    status,
    connected: false,
    qr: {
      mimetype: qr.mimetype || "image/png",
      data: qr.data,
    },
  }
}

export async function getStoredWahaConnection(tenantId: string) {
  const connection = await loadConnection(tenantId)
  return {
    id: connection.id,
    tenantId: connection.tenant_id,
    status: connection.status,
    providerStatus: connection.provider_status,
    phoneE164: connection.phone_e164,
    session: configString(connection.config,"session"),
    lastStatusAt: connection.last_status_at,
    lastHealthAt: connection.last_health_at,
    lastQrAt: connection.last_qr_at,
    connectedAt: connection.connected_at,
    disconnectedAt: connection.disconnected_at,
    lastError: connection.last_error,
  }
}
