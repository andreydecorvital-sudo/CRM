import Link from "next/link"

const cards = [
  ["Conversas abertas", "24", "+6 hoje"],
  ["Leads quentes", "11", "4 sem follow-up"],
  ["Recorrentes", "126", "38 VIP"],
  ["Em risco", "41", "reativação"],
  ["Avaliações", "43%", "taxa de resposta"],
  ["Resolvido pela MIRA", "68%", "+9 p.p."],
]

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-violet-300">MIRA · Comercial OS</p>
          <h1 className="text-3xl font-semibold tracking-tight">Do primeiro “oi” até a recompra.</h1>
          <p className="mt-2 max-w-2xl text-white/55">WhatsApp entra, MIRA classifica, o CRM organiza, acompanha venda, recorrência, pós-venda e avaliação.</p>
        </div>
        <Link href="/settings/whatsapp" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium">Conectar WhatsApp</Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-white/50">{label}</p>
            <strong className="mt-3 block text-2xl">{value}</strong>
            <span className="mt-2 block text-xs text-emerald-300">{detail}</span>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">Fila agora</h2><Link href="/inbox" className="text-sm text-violet-300">Abrir atendimento →</Link></div>
          <div className="grid gap-3">
            {["Quer orçamento para 30 unidades", "Preciso falar com vendedor", "Vocês entregam em Campinas?"].map((text, i) => (
              <div key={text} className="flex items-center justify-between rounded-xl bg-black/20 p-4">
                <div><p className="font-medium">{text}</p><p className="mt-1 text-xs text-white/45">Contato {i + 1} · WhatsApp</p></div>
                <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-200">{i === 0 ? "Lead quente" : i === 1 ? "Handoff" : "MIRA"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="font-semibold">Ciclo do cliente</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/customers" className="rounded-xl border border-white/8 bg-black/20 p-4"><strong className="text-sm">Recorrência</strong><p className="mt-1 text-xs text-white/45">VIP, LTV, ticket, risco e inatividade.</p></Link>
            <Link href="/reviews" className="rounded-xl border border-white/8 bg-black/20 p-4"><strong className="text-sm">Avaliações</strong><p className="mt-1 text-xs text-white/45">Pós-venda, coleta e reputação.</p></Link>
          </div>
        </article>
      </section>
    </div>
  )
}
