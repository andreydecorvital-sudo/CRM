export default function WhatsappSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6"><p className="text-sm text-violet-300">Integrações</p><h1 className="mt-1 text-3xl font-semibold">WhatsApp</h1></div>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">Provider atual · WAHA</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/50">Adapter desacoplado do CRM. Depois podemos trocar por Meta Cloud API ou BSP sem mexer em contatos, conversas e pipeline.</p></div><span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">Não configurado</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-white/40">Sessão</p><strong className="mt-2 block text-sm">default</strong></div><div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-white/40">Modo de IA</p><strong className="mt-2 block text-sm">Assistido</strong></div></div>
        <div className="mt-6 rounded-xl border border-white/10 p-4 text-sm text-white/55">Preencha <code>WAHA_BASE_URL</code>, <code>WAHA_API_KEY</code> e <code>WHATSAPP_WEBHOOK_SECRET</code> no ambiente da Vercel.</div>
      </section>
    </div>
  )
}
