const conversations = [
  { name: "Mariana Costa", text: "Queria orçamento para 30 unidades", tag: "Quente", time: "2 min" },
  { name: "Rafael Lima", text: "Vocês conseguem entregar amanhã?", tag: "MIRA", time: "8 min" },
  { name: "Studio Forma", text: "Preciso falar com financeiro", tag: "Handoff", time: "21 min" },
]

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6"><p className="text-sm text-violet-300">Atendimento</p><h1 className="mt-1 text-3xl font-semibold">Inbox</h1></div>
      <div className="grid min-h-[680px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] lg:grid-cols-[360px_1fr]">
        <section className="border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 p-4"><input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-white/30" placeholder="Buscar contato, tag ou mensagem" /></div>
          <div className="divide-y divide-white/5">
            {conversations.map((item, i) => (
              <div key={item.name} className={`p-4 ${i === 0 ? "bg-violet-500/10" : ""}`}>
                <div className="flex items-center justify-between"><strong className="text-sm">{item.name}</strong><span className="text-xs text-white/35">{item.time}</span></div>
                <p className="mt-2 truncate text-sm text-white/55">{item.text}</p>
                <span className="mt-2 inline-block rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/60">{item.tag}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="flex flex-col">
          <header className="border-b border-white/10 p-5"><strong>Mariana Costa</strong><p className="text-xs text-white/45">Lead · prioridade alta · sem responsável</p></header>
          <div className="flex-1 space-y-4 p-6">
            <div className="max-w-[72%] rounded-2xl rounded-tl-md bg-white/8 p-4 text-sm">Oi, queria orçamento para 30 unidades. Tem preço melhor?</div>
            <div className="ml-auto max-w-[72%] rounded-2xl rounded-tr-md border border-violet-400/20 bg-violet-500/10 p-4 text-sm">
              <p className="mb-2 text-xs font-semibold text-violet-300">Sugestão da MIRA</p>
              Consigo te ajudar. Para montar o orçamento certo, qual produto e cidade de entrega?
            </div>
          </div>
          <footer className="border-t border-white/10 p-4"><div className="flex gap-2"><input className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" placeholder="Responder..."/><button className="rounded-xl bg-violet-600 px-4 text-sm font-medium">Enviar</button></div></footer>
        </section>
      </div>
    </div>
  )
}
