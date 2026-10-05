const stages = [
  ["Novo lead", ["Mariana Costa", "Casa Nobre"]],
  ["Qualificado", ["Studio Lima"]],
  ["Orçamento", ["Decor SP", "Rafael Lima"]],
  ["Follow-up", ["Construtora Alba"]],
  ["Fechado", ["Loja Prisma"]],
]

export default function CrmPage() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6"><p className="text-sm text-violet-300">Pipeline</p><h1 className="mt-1 text-3xl font-semibold">CRM</h1><p className="mt-2 text-sm text-white/50">Filtre por vendedor, interesse, cidade, origem, tag, temperatura e tempo sem resposta.</p></div>
      <div className="mb-5 flex flex-wrap gap-2">{["Todos", "Quentes", "Sem resposta", "Hoje", "WhatsApp"].map((f, i) => <button key={f} className={`rounded-full border px-3 py-1.5 text-xs ${i === 0 ? "border-violet-400/40 bg-violet-500/15" : "border-white/10 bg-white/5 text-white/60"}`}>{f}</button>)}</div>
      <div className="grid gap-4 overflow-x-auto xl:grid-cols-5">
        {stages.map(([stage, contacts]) => (
          <section key={stage as string} className="min-w-[250px] rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            <div className="mb-3 flex items-center justify-between px-1"><strong className="text-sm">{stage}</strong><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-white/45">{(contacts as string[]).length}</span></div>
            <div className="space-y-3">{(contacts as string[]).map((name, i) => <article key={name} className="rounded-xl border border-white/8 bg-[#11151e] p-4"><strong className="text-sm">{name}</strong><p className="mt-2 text-xs text-white/45">WhatsApp · {i % 2 ? "Casa e decoração" : "Orçamento"}</p><div className="mt-3 flex justify-between text-[11px]"><span className="text-emerald-300">{i % 2 ? "Morno" : "Quente"}</span><span className="text-white/35">há {i + 1}h</span></div></article>)}</div>
          </section>
        ))}
      </div>
    </div>
  )
}
