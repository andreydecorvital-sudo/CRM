import { supabaseRest } from "@/lib/server/supabase/rest"

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ReviewRow = {
  id: string
  tenant_id: string
  status: "pending" | "queued" | "sent" | "delivered" | "responded" | "expired" | "cancelled" | "failed"
  rating: number | null
  public_review_url: string | null
}

function externalHttps(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const token = String(body?.token || "").trim()
  const rating = Number(body?.rating)
  const feedback = String(body?.feedback || "").trim().slice(0, 2000)

  if (!TOKEN.test(token)) return Response.json({ error: "Link de avaliação inválido." }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Response.json({ error: "Escolha uma nota de 1 a 5." }, { status: 400 })

  const rows = await supabaseRest<ReviewRow[]>(
    "GET",
    `/review_requests?public_token=eq.${encodeURIComponent(token)}&select=id,tenant_id,status,rating,public_review_url&limit=1`,
  )
  const review = Array.isArray(rows) ? rows[0] : null
  if (!review) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 })

  if (review.status === "responded") {
    return Response.json({ ok: true, alreadyResponded: true, publicReviewUrl: externalHttps(review.public_review_url) })
  }
  if (review.status === "cancelled" || review.status === "expired") {
    return Response.json({ error: "Este pedido de avaliação não está mais disponível." }, { status: 410 })
  }

  const respondedAt = new Date().toISOString()
  await supabaseRest("PATCH", `/review_requests?id=eq.${encodeURIComponent(review.id)}`, {
    rating,
    feedback: feedback || null,
    status: "responded",
    responded_at: respondedAt,
    updated_at: respondedAt,
  })

  await supabaseRest("POST", "/audit_log", [{
    tenant_id: review.tenant_id,
    actor_type: "system",
    actor_id: "public-review",
    action: "review.responded",
    entity_type: "review_request",
    entity_id: review.id,
    metadata: { rating, hasFeedback: Boolean(feedback) },
  }])

  return Response.json({ ok: true, publicReviewUrl: externalHttps(review.public_review_url) })
}
