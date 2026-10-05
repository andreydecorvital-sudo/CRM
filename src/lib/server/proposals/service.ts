import { proposalIsExpired } from "@/lib/domain/proposals"
import { supabaseRest } from "@/lib/server/supabase/rest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PublicProposal = {
  id: string
  number: number
  title: string
  intro: string | null
  terms: string | null
  status: "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired" | "cancelled"
  currency: string
  expiresAt: string | null
  subtotalCents: number
  discountCents: number
  totalCents: number
  contactName: string
  items: Array<{
    id: string
    description: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }>
}

type ProposalRow = {
  id: string
  number: number
  public_token: string
  contact_id: string
  title: string
  intro: string | null
  terms: string | null
  status: PublicProposal["status"]
  currency: string
  expires_at: string | null
  subtotal_cents: number
  discount_cents: number
  total_cents: number
}

type ContactRow = { display_name: string }
type ItemRow = { id: string; description: string; quantity: number; unit_price_cents: number }

function token(value: string) {
  const normalized = String(value || "").trim()
  if (!UUID.test(normalized)) throw new Error("Proposta inválida.")
  return normalized
}

export async function loadPublicProposal(publicToken: string): Promise<PublicProposal | null> {
  const safeToken = token(publicToken)
  const rows = await supabaseRest<ProposalRow[]>(
    "GET",
    `/proposals?public_token=eq.${encodeURIComponent(safeToken)}&select=id,number,public_token,contact_id,title,intro,terms,status,currency,expires_at,subtotal_cents,discount_cents,total_cents&limit=1`,
  )
  const proposal = Array.isArray(rows) ? rows[0] : null
  if (!proposal) return null

  const [contacts, items] = await Promise.all([
    supabaseRest<ContactRow[]>(
      "GET",
      `/contacts?id=eq.${encodeURIComponent(proposal.contact_id)}&select=display_name&limit=1`,
    ),
    supabaseRest<ItemRow[]>(
      "GET",
      `/proposal_items?proposal_id=eq.${encodeURIComponent(proposal.id)}&select=id,description,quantity,unit_price_cents&order=position.asc,created_at.asc`,
    ),
  ])

  const effectiveStatus = proposal.status === "sent" || proposal.status === "viewed"
    ? proposalIsExpired(proposal.expires_at) ? "expired" : proposal.status
    : proposal.status

  return {
    id: proposal.id,
    number: proposal.number,
    title: proposal.title,
    intro: proposal.intro,
    terms: proposal.terms,
    status: effectiveStatus,
    currency: proposal.currency,
    expiresAt: proposal.expires_at,
    subtotalCents: proposal.subtotal_cents,
    discountCents: proposal.discount_cents,
    totalCents: proposal.total_cents,
    contactName: Array.isArray(contacts) && contacts[0]?.display_name ? contacts[0].display_name : "Cliente",
    items: (Array.isArray(items) ? items : []).map(item => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents: Number(item.unit_price_cents),
      lineTotalCents: Math.round(Number(item.quantity) * Number(item.unit_price_cents)),
    })),
  }
}

export async function markProposalViewed(publicToken: string) {
  const safeToken = token(publicToken)
  const now = new Date().toISOString()
  return supabaseRest("PATCH", `/proposals?public_token=eq.${encodeURIComponent(safeToken)}&status=eq.sent`, {
    status: "viewed",
    viewed_at: now,
    updated_at: now,
  })
}

export async function acceptProposal(input: { token: string; name: string; email?: string | null }) {
  const safeToken = token(input.token)
  const name = String(input.name || "").trim().slice(0, 160)
  const email = String(input.email || "").trim().slice(0, 240) || null
  if (!name) throw new Error("Nome obrigatório.")

  return supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_accept_proposal", {
    p_public_token: safeToken,
    p_name: name,
    p_email: email,
  })
}

export async function createProposal(input: {
  tenantId: string
  contactId: string
  dealId?: string | null
  ownerUserId?: string | null
  title: string
  intro?: string | null
  terms?: string | null
  expiresAt?: string | null
  discountType?: "none" | "fixed" | "percentage"
  discountValue?: number
  items: Array<{
    description: string
    quantity: number
    unitPriceCents: number
    position?: number
    metadata?: Record<string, unknown>
  }>
}) {
  const tenantId = token(input.tenantId)
  const contactId = token(input.contactId)
  const dealId = input.dealId ? token(input.dealId) : null
  const ownerUserId = input.ownerUserId ? token(input.ownerUserId) : null
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Adicione pelo menos um item.")

  const items = input.items.map((item, index) => {
    const description = String(item.description || "").trim().slice(0, 500)
    if (!description) throw new Error(`Descrição obrigatória no item ${index + 1}.`)
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error(`Quantidade inválida no item ${index + 1}.`)
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) throw new Error(`Preço inválido no item ${index + 1}.`)
    return {
      description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      position: item.position ?? index + 1,
      metadata: item.metadata ?? {},
    }
  })

  return supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_create_proposal", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_deal_id: dealId,
    p_owner_user_id: ownerUserId,
    p_title: String(input.title || "").trim().slice(0, 180),
    p_intro: String(input.intro || "").trim().slice(0, 4000) || null,
    p_terms: String(input.terms || "").trim().slice(0, 8000) || null,
    p_expires_at: input.expiresAt || null,
    p_discount_type: input.discountType ?? "none",
    p_discount_value: Math.max(0, Number(input.discountValue || 0)),
    p_items: items,
  })
}

export async function sendProposal(proposalId: string) {
  const id = token(proposalId)
  const now = new Date().toISOString()
  return supabaseRest("PATCH", `/proposals?id=eq.${encodeURIComponent(id)}&status=eq.draft`, {
    status: "sent",
    sent_at: now,
    updated_at: now,
  })
}
