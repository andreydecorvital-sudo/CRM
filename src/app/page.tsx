import Link from "next/link"

const cards = [
  ["Conversas abertas", "24", "+6 hoje"],
  ["SLA em risco", "3", "ação agora"],
  ["Follow-ups", "12", "4 atrasados"],
  ["Propostas abertas", "17", "R$ 48,3 mil"],
  ["Clientes recorrentes", "126", "38 VIP"],
  ["Avaliações", "4,6 ★", "43% resposta"],
]

const operations = [
  { href: "/inbox", title: "Atendimento", detail: "Fila, SLA, IA e handoff humano.", value: "24 abertas" },
  { href: "/tasks", title: "Próximas ações", detail: "Follow-ups, reuniões e retornos.", value: "4 atrasadas" },
  { href: "/proposals", title: "Negociação", detail: "Propostas enviadas, vistas e aceitas.", value: "17 abertas" },
  { href: "/customers", title: "Carteira", detail: "LTV, VIP, risco e reativação.", value: "41 em risco" },
]

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-violet-300">CRM · Revenue OS</p>
          <h1 className="text-3xl font-semibold tracking-tight">Do primeiro contato até a recompra.</h1>
          <p className="mt-2 max-w-3xl text-white/55">Atendimento, execução comercial, propostas, origem, recorrência e reputação em uma única linha do tempo do cliente.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/tasks" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">Ver tarefas</Link>
          <Link href="/settings/whatsapp" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium">Conectar WhatsApp</Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-white/45">{label}</p>
            <strong className="mt-3 block text-2xl">{value}</strong>
            <span className="mt-2 block text-xs text-emerald-300">{detail}</span>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {operations.map(item => (
          <Link key={item.href} href={item.href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-400/20 hover:bg-violet-500/[0.04]">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-semibold">{item.title}</h2><p className="mt-2 text-sm text-white/45">{item.detail}</p></div>
              <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/55">{item.value}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-white/30">Fluxo operacional</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {["Origem", "Lead", "Atendimento", "Tarefa", "Proposta", "Venda", "Recorrência", "Avaliação", "Reativação"].map((step,index,array) => (
            <div key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{step}</span>
              {index < array.length - 1 ? <span className="text-white/20">→</span> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
