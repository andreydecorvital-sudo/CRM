import { assertInternalRequest } from "@/lib/server/internal-auth"
import { listActionAdapters } from "@/lib/server/router/registry"

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    return Response.json({ adapters:listActionAdapters() })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "unauthorized") return Response.json({ error:"unauthorized" },{ status:401 })
    return Response.json({ error:"adapter_registry_error",message },{ status:400 })
  }
}
