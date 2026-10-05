const proposals = [
  ["#1042", "Mariana Costa", "R$ 6.420,00", "Visualizada", "vence em 4 dias"],
  ["#1041", "Casa Nobre", "R$ 3.180,00", "Enviada", "vence em 2 dias"],
  ["#1040", "Studio Lima", "R$ 890,00", "Aceita", "aceita hoje"],
  ["#1039", "Decor SP", "R$ 12.770,00", "Rascunho", "editada há 1h"],
]

export default function ProposalsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-violet-300">Negociação</p>
          <h1 className="mt-1 text-3xl font-semibold">Propostas</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50">Do orçamento ao aceite com preço, desconto, validade e vínculo direto com contato e oportunidade.</p>
        </div>
        <button className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium">Nova proposta</button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[["Em aberto","17"],["Visualizadas","9"],["Aceitas","6"],["Valor aberto","R$ 48,3 mil"]].map(([label,value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-sm text-white/45">{label}</p><strong className="mt-3 block text-2xl">{value}</strong></article>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Propostas recentes</h2></div>
        <div className="divide-y divide-white/5">
          {proposals.map(([number,name,total,status,detail]) => (
            <div key={number} className="grid gap-3 p-5 md:grid-cols-[90px_1fr_140px_120px_140px] md:items-center">
              <strong className="text-sm">{number}</strong>
              <span className="text-sm">{name}</span>
              <strong className="text-sm">{total}</strong>
              <span className={`text-xs ${status === "Aceita" ? "text-emerald-300" : status === "Visualizada" ? "text-violet-300" : "text-white/50"}`}>{status}</span>
              <span className="text-xs text-white/40">{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 text-xs text-white/35">A proposta pública usa token próprio e aceite idempotente. Exemplo de rota: <code>/proposal/&lt;token&gt;</code>.</div>
    </div>
  )
}
