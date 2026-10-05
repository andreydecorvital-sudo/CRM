import Link from "next/link"

const queue = [
  ["Mariana Costa", "WhatsApp", "Hoje 18:00", "Pendente"],
  ["Studio Lima", "WhatsApp", "Enviado há 2h", "Enviado"],
  ["Casa Nobre", "WhatsApp", "Respondido hoje", "5 ★"],
  ["Rafael Lima", "WhatsApp", "Respondido ontem", "3 ★"],
]

export default function ReviewsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <p className="text-sm text-violet-300">257 · Pós-venda</p>
        <h1 className="mt-1 text-3xl font-semibold">Avaliações</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">Peça feedback depois da compra, acompanhe resposta e use a mesma fila do WhatsApp sem bombardear o cliente.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[["Aguardando envio","18"],["Enviadas","64"],["Taxa de resposta","43%"],["Nota média","4,6 ★"]].map(([label,value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-sm text-white/45">{label}</p><strong className="mt-3 block text-3xl">{value}</strong></article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Fila de coleta</h2><p className="mt-1 text-xs text-white/45">Um pedido por compra e cooldown configurável por contato.</p></div>
          <div className="divide-y divide-white/5">
            {queue.map(([name, channel, when, status]) => (
              <div key={name} className="grid grid-cols-[1fr_auto] gap-4 p-5 sm:grid-cols-[1fr_110px_140px_90px]">
                <strong className="text-sm">{name}</strong><span className="text-xs text-white/45">{channel}</span><span className="text-xs text-white/45">{when}</span><span className="text-right text-xs text-violet-200">{status}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold">Regra padrão</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between rounded-xl bg-black/20 p-3"><span className="text-white/50">Depois da compra</span><strong>24h</strong></div>
            <div className="flex justify-between rounded-xl bg-black/20 p-3"><span className="text-white/50">Cooldown</span><strong>60 dias</strong></div>
            <div className="flex justify-between rounded-xl bg-black/20 p-3"><span className="text-white/50">Canal</span><strong>WhatsApp</strong></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-white/40">O link de avaliação pública pode aparecer para todos que responderem. Não usamos nota para esconder clientes insatisfeitos.</p>
          <Link href="/settings/whatsapp" className="mt-5 block rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-medium">Configurar WhatsApp</Link>
        </aside>
      </section>
    </div>
  )
}
