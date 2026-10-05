const channels = [
  ["Google Ads", "142", "38", "26,8%", "R$ 41.220"],
  ["Meta Ads", "109", "25", "22,9%", "R$ 27.840"],
  ["Orgânico", "76", "21", "27,6%", "R$ 19.410"],
  ["Indicação", "31", "14", "45,2%", "R$ 24.780"],
  ["Direto / WhatsApp", "58", "12", "20,7%", "R$ 15.360"],
]

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <p className="text-sm text-violet-300">Aquisição</p>
        <h1 className="mt-1 text-3xl font-semibold">Origens & UTM</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">First touch mostra de onde o cliente veio. Last touch mostra o que trouxe a conversão. O CRM guarda os dois.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[["Leads","416"],["Vendas","110"],["Conversão","26,4%"],["Receita atribuída","R$ 128,6 mil"]].map(([label,value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-sm text-white/45">{label}</p><strong className="mt-3 block text-2xl">{value}</strong></article>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Performance por origem</h2><p className="mt-1 text-xs text-white/45">Fonte → leads → vendas → conversão → receita.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-white/40"><tr><th className="p-4">Origem</th><th>Leads</th><th>Vendas</th><th>Conversão</th><th>Receita</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {channels.map(row => <tr key={row[0]}>{row.map((value,index) => <td key={value} className={index === 0 ? "p-4 font-medium" : ""}>{value}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
