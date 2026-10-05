const departments = [
  { name: "Comercial", queue: 18, sla: "8m", target: "15m", breach: 1, routing: "Menor fila", members: 5 },
  { name: "Suporte", queue: 9, sla: "4m", target: "10m", breach: 0, routing: "Round-robin", members: 4 },
  { name: "Financeiro", queue: 3, sla: "12m", target: "30m", breach: 0, routing: "Manual", members: 2 },
]

export default function DepartmentsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <p className="text-sm text-violet-300">Multiatendimento</p>
        <h1 className="mt-1 text-3xl font-semibold">Equipes & Filas</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">Separe Comercial, Suporte e Financeiro, distribua conversas e acompanhe SLA sem perder o histórico do cliente.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {departments.map(item => (
          <article key={item.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start justify-between"><div><p className="text-xs text-white/40">Departamento</p><h2 className="mt-1 text-lg font-semibold">{item.name}</h2></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50">{item.members} pessoas</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-white/40">Fila aberta</p><strong className="mt-1 block text-2xl">{item.queue}</strong></div>
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-white/40">Resposta média</p><strong className="mt-1 block text-2xl">{item.sla}</strong></div>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-white/40">Meta SLA</span><strong>{item.target}</strong></div>
              <div className="flex justify-between"><span className="text-white/40">Estourados</span><strong className={item.breach ? "text-rose-300" : "text-emerald-300"}>{item.breach}</strong></div>
              <div className="flex justify-between"><span className="text-white/40">Roteamento</span><strong>{item.routing}</strong></div>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold">Regra operacional</h2>
        <p className="mt-2 text-sm leading-6 text-white/50">Nova conversa pode entrar em uma fila por intenção. A MIRA classifica, o departamento recebe, o SLA começa e o roteador escolhe atendente por regra. Transferência não cria outro contato nem quebra o histórico.</p>
      </section>
    </div>
  )
}
