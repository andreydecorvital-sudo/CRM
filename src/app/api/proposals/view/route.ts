import { markProposalViewed } from "@/lib/server/proposals/service"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const token = String(body?.token || "").trim()
  try {
    await markProposalViewed(token)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
}
