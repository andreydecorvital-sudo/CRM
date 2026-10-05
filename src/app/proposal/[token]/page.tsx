import { notFound } from "next/navigation"
import { loadPublicProposal } from "@/lib/server/proposals/service"
import ProposalActions from "./proposal-actions"
import ProposalTracker from "./proposal-tracker"

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value / 100)

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const proposal = await loadPublicProposal(token).catch(() => null)
  if (!proposal) notFound()

  const canAccept = proposal.status === "sent" || proposal.status === "viewed"

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-10">
      <ProposalTracker token={token} enabled={proposal.status === "sent"} />
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <header className="border-b border-white/10 p-6 sm:p-8">
          <p className="text-sm text-violet-300">Proposta #{String(proposal.number).padStart(4, "0")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{proposal.title}</h1>
          <p className="mt-2 text-sm text-white/50">Preparada para {proposal.contactName}</p>
          {proposal.intro ? <p className="mt-5 max-w-2xl text-sm leading-6 text-white/65">{proposal.intro}</p> : null}
        </header>

        <div className="p-6 sm:p-8">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1fr_80px_120px] gap-3 border-b border-white/10 bg-black/15 px-4 py-3 text-xs text-white/40 sm:grid-cols-[1fr_100px_140px]">
              <span>Item</span><span>Qtd.</span><span>Valor</span>
            </div>
            <div className="divide-y divide-white/5">
              {proposal.items.map(item => (
                <div key={item.id} className="grid grid-cols-[1fr_80px_120px] gap-3 px-4 py-4 text-sm sm:grid-cols-[1fr_100px_140px]">
                  <span>{item.description}</span>
                  <span className="text-white/50">{item.quantity}</span>
                  <strong>{money(item.lineTotalCents, proposal.currency)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/45">Subtotal</span><span>{money(proposal.subtotalCents, proposal.currency)}</span></div>
            {proposal.discountCents > 0 ? <div className="flex justify-between"><span className="text-white/45">Desconto</span><span>- {money(proposal.discountCents, proposal.currency)}</span></div> : null}
            <div className="flex justify-between border-t border-white/10 pt-3 text-lg"><strong>Total</strong><strong>{money(proposal.totalCents, proposal.currency)}</strong></div>
          </div>

          {proposal.terms ? <div className="mt-7 rounded-2xl bg-black/20 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-white/35">Condições</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/60">{proposal.terms}</p></div> : null}

          {proposal.expiresAt ? <p className="mt-5 text-xs text-white/35">Validade: {new Intl.DateTimeFormat("pt-BR").format(new Date(proposal.expiresAt))}</p> : null}

          <ProposalActions token={token} status={proposal.status} canAccept={canAccept} />
        </div>
      </section>
    </div>
  )
}
