const conversations = [
  { name: "Mariana Costa", text: "Queria orçamento para 30 unidades", tag: "Lead quente", time: "2 min", dept: "Comercial", sla: "7m" },
  { name: "Rafael Lima", text: "Vocês conseguem entregar amanhã?", tag: "MIRA", time: "8 min", dept: "Comercial", sla: "9m" },
  { name: "Studio Forma", text: "Preciso falar com financeiro", tag: "Handoff", time: "21 min", dept: "Financeiro", sla: "18m" },
]

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-violet-300">Atendimento</p><h1 className="mt-1 text-3xl font-semibold">Inbox</h1><p className="mt-2 text-sm text-white/50">Uma fila, vários departamentos, SLA e histórico único por cliente.</p></div>
        <div className="flex gap-2">{["Todas", "Comercial", "Suporte", "Financeiro", "SLA em risco"].map((item,index) => <button key={item} className={`rounded-full border px-3 py-1.5 text-xs ${index === 0 ? "border-violet-400/40 bg-violet-500/15" : "border-white/10 bg-white/5 text-white/55"}`}>{item}</button>)}</div>
      </div>

      <div className="grid min-h-[680px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] lg:grid-cols-[390px_1fr]">
        <section className="border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 p-4"><input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-white/30" placeholder="Buscar contato, tag ou mensagem" /></div>
          <div className="divide-y divide-white/5">
            {conversations.map((item,i) => (
              <div key={item.name} className={`p-4 ${i === 0 ? "bg-violet-500/10" : ""}`}>
                <div className="flex items-center justify-between gap-3"><strong className="text-sm">{item.name}</strong><span className="text-xs text-white/35">{item.time}</span></div>
                <p className="mt-2 truncate text-sm text-white/55">{item.text}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-white/5 px-2 py-1 text-white/55">{item.dept}</span>
                  <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-200">{item.tag}</span>
                  <span className={`ml-auto ${Number(item.sla.replace("m","")) <= 7 ? "text-amber-300" : "text-white/35"}`}>SLA {item.sla}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col">
          <header className="border-b border-white/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><strong>Mariana Costa</strong><p className="mt-1 text-xs text-white/45">Comercial · Lead quente · SLA de 1ª resposta em 7 min</p></div>
              <div className="flex gap-2"><button className="rounded-lg border border-white/10 px-3 py-2 text-xs">Criar tarefa</button><button className="rounded-lg border border-white/10 px-3 py-2 text-xs">Transferir</button></div>
            </div>
          </header>
          <div className="flex-1 space-y-4 p-6">
            <div className="max-w-[72%] rounded-2xl rounded-tl-md bg-white/8 p-4 text-sm">Oi, queria orçamento para 30 unidades. Tem preço melhor?</div>
            <div className="ml-auto max-w-[72%] rounded-2xl rounded-tr-md border border-violet-400/20 bg-violet-500/10 p-4 text-sm">
              <p className="mb-2 text-xs font-semibold text-violet-300">Sugestão da MIRA</p>
              Consigo te ajudar. Para montar a condição correta, qual produto e cidade de entrega?
            </div>
          </div>
          <footer className="border-t border-white/10 p-4">
            <div className="flex gap-2"><input className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" placeholder="Responder..." /><button className="rounded-xl bg-violet-600 px-4 text-sm font-medium">Enviar</button></div>
          </footer>
        </section>
      </div>
    </div>
  )
}
