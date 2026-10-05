import { randomUUID } from "node:crypto"
import { verifyApiKey } from "@/lib/server/api-keys/service"
import { assertFeature, assertWithinLimit, recordUsage } from "@/lib/server/billing/entitlements"

export type PublicApiContext = {
  requestId: string
  tenantId: string
  apiKeyId: string
  scopes: string[]
}

export async function authenticatePublicApi(request: Request, requiredScope: string): Promise<PublicApiContext> {
  const authorization = request.headers.get("authorization") || ""
  if (!authorization.startsWith("Bearer ")) throw new Error("unauthorized")

  const apiKey = authorization.slice(7).trim()
  const verified = await verifyApiKey(apiKey, requiredScope)
  if (!verified) throw new Error("unauthorized")

  await assertFeature(verified.tenantId, "api")
  await assertWithinLimit(verified.tenantId, "api.requests", 1)

  const requestId = (request.headers.get("x-request-id") || randomUUID()).slice(0, 160)
  return {
    requestId,
    tenantId: verified.tenantId,
    apiKeyId: verified.id,
    scopes: verified.scopes,
  }
}

export async function meterPublicApi(context: PublicApiContext, route: string) {
  await recordUsage({
    tenantId: context.tenantId,
    metric: "api.requests",
    dedupeKey: `api:${context.apiKeyId}:${context.requestId}`,
    metadata: { route },
  }).catch(() => null)
}
