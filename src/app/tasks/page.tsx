const tasks = [
  ["Follow-up orçamento · Mariana Costa", "Hoje 17:30", "WhatsApp", "Alta", "Lucas"],
  ["Retornar Casa Nobre", "Hoje 18:15", "Ligação", "Normal", "Comercial"],
  ["Reunião · Studio Lima", "Amanhã 10:00", "Reunião", "Normal", "Ana"],
  ["Reativar Decor SP", "Atrasada 1 dia", "WhatsApp", "Urgente", "MIRA"],
]

export default function TasksPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <p className="text-sm text-violet-300">Execução comercial</p>
        <h1 className="mt-1 text-3xl font-semibold">Tarefas & Follow-ups</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">Toda próxima ação precisa ter dono e prazo. Follow-up automático entra aqui antes de virar lead esquecido.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Hoje","12"],["Atrasadas","4"],["Próximas 24h","18"],["Concluídas","37"]].map(([label,value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-white/45">{label}</p><strong className="mt-3 block text-3xl">{value}</strong>
          </article>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
          <div><h2 className="font-semibold">Fila de execução</h2><p className="mt-1 text-xs text-white/45">Prioridade, prazo, canal e responsável.</p></div>
          <div className="flex gap-2">
            {["Todos","Atrasadas","Hoje","WhatsApp","Reunião"].map((filter,index) => (
              <button key={filter} className={`rounded-full border px-3 py-1.5 text-xs ${index === 0 ? "border-violet-400/40 bg-violet-500/15" : "border-white/10 bg-white/5 text-white/60"}`}>{filter}</button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {tasks.map(([title,due,kind,priority,owner]) => (
            <div key={title} className="grid gap-3 p-5 md:grid-cols-[1fr_130px_110px_90px_100px] md:items-center">
              <strong className="text-sm">{title}</strong>
              <span className={`text-xs ${due.includes("Atrasada") ? "text-rose-300" : "text-white/45"}`}>{due}</span>
              <span className="text-xs text-white/45">{kind}</span>
              <span className={`text-xs ${priority === "Urgente" ? "text-rose-300" : priority === "Alta" ? "text-amber-300" : "text-white/45"}`}>{priority}</span>
              <span className="text-xs text-white/60">{owner}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
