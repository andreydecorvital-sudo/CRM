import Link from "next/link"

const segments = [
  { name: "VIP", count: 38, value: "R$ 82,4 mil", detail: "5+ compras ou LTV alto", tone: "text-violet-200 bg-violet-500/10 border-violet-400/15" },
  { name: "Recorrentes", count: 126, value: "R$ 119,8 mil", detail: "2+ compras", tone: "text-emerald-200 bg-emerald-500/10 border-emerald-400/15" },
  { name: "Em risco", count: 41, value: "R$ 31,2 mil", detail: "45+ dias sem comprar", tone: "text-amber-200 bg-amber-500/10 border-amber-400/15" },
  { name: "Inativos", count: 73, value: "R$ 47,9 mil", detail: "90+ dias sem comprar", tone: "text-rose-200 bg-rose-500/10 border-rose-400/15" },
]

const customers = [
  ["Mariana Costa", "VIP", "Ativo", "8 compras", "R$ 6.420", "há 8 dias"],
  ["Casa Nobre", "Recorrente", "Em risco", "4 compras", "R$ 3.180", "há 51 dias"],
  ["Studio Lima", "1ª compra", "Ativo", "1 compra", "R$ 890", "há 12 dias"],
  ["Decor SP", "VIP", "Inativo", "11 compras", "R$ 12.770", "há 102 dias"],
]

export default function CustomersPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-violet-300">253 · Ciclo do cliente</p>
          <h1 className="mt-1 text-3xl font-semibold">Recorrência</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50">Separe valor do cliente de atividade: um VIP pode estar ativo, em risco ou inativo.</p>
        </div>
        <Link href="/crm" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">Abrir pipeline</Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {segments.map(item => (
          <article key={item.name} className={`rounded-2xl border p-5 ${item.tone}`}>
            <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{item.name}</p><strong className="text-2xl">{item.count}</strong></div>
            <p className="mt-4 text-xl font-semibold">{item.value}</p>
            <p className="mt-1 text-xs opacity-65">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
          <div><h2 className="font-semibold">Clientes</h2><p className="mt-1 text-xs text-white/45">LTV, frequência, última compra e status de reativação.</p></div>
          <div className="flex flex-wrap gap-2">
            {["Todos", "VIP", "Recorrentes", "Em risco", "Inativos"].map((filter, index) => (
              <button key={filter} className={`rounded-full border px-3 py-1.5 text-xs ${index === 0 ? "border-violet-400/40 bg-violet-500/15" : "border-white/10 bg-white/5 text-white/60"}`}>{filter}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-white/40"><tr><th className="p-4">Cliente</th><th>Tier</th><th>Atividade</th><th>Compras</th><th>LTV</th><th>Última compra</th><th></th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {customers.map(([name, tier, activity, purchases, ltv, last]) => (
                <tr key={name}>
                  <td className="p-4 font-medium">{name}</td>
                  <td><span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200">{tier}</span></td>
                  <td className={activity === "Ativo" ? "text-emerald-300" : activity === "Em risco" ? "text-amber-300" : "text-rose-300"}>{activity}</td>
                  <td>{purchases}</td><td>{ltv}</td><td className="text-white/50">{last}</td>
                  <td><button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60">Reativar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
