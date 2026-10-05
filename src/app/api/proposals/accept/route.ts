import { acceptProposal } from "@/lib/server/proposals/service"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  try {
    const result = await acceptProposal({
      token: String(body?.token || ""),
      name: String(body?.name || ""),
      email: String(body?.email || "") || null,
    })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível aceitar a proposta." },
      { status: 400 },
    )
  }
}
