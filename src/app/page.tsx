import Link from "next/link"
import { ArrowUpRight, Blocks, Globe2, MessageSquareText, ShieldCheck, UsersRound, Workflow } from "lucide-react"

const modules = [
  { href:"/integrations", title:"Integrações", detail:"Site, WhatsApp e API: prepare os canais de entrada.", icon:Globe2 },
  { href:"/automations", title:"Automações", detail:"Gatilhos, condições, playbooks e simulação.", icon:Workflow },
  { href:"/inbox", title:"Atendimento", detail:"Conversas, filas e passagem para humanos.", icon:MessageSquareText },
  { href:"/crm", title:"Relacionamento", detail:"Contatos, negociações e acompanhamento comercial.", icon:UsersRound },
]

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-700/20 via-[#121522] to-[#0d1017] p-7 md:p-10">
        <div className="relative z-10 max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">CRM · Plataforma SaaS</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Atenda, organize e automatize o relacionamento com seus clientes.</h1>
          <p className="mt-4 text-sm leading-7 text-white/60">
            Uma base única para leads que chegam pelo site, WhatsApp e integrações,
            com execução comercial orientada a eventos e regras auditáveis por empresa.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/integrations" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold hover:bg-violet-500">
              Conectar um canal <ArrowUpRight size={16} />
            </Link>
            <Link href="/automations" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
              Explorar automações
            </Link>
          </div>
        </div>
      </section>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Central de trabalho</h2>
        <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          Em preparação para piloto · não conectado a dados de clientes
        </span>
      </div>
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        {modules.map(({href,title,detail,icon:Icon}) => (
          <Link key={href} href={href} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-violet-400/30 hover:bg-violet-500/[0.05]">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><Icon size={21}/></span>
              <ArrowUpRight size={17} className="text-white/30 group-hover:text-violet-300"/>
            </div>
            <h3 className="mt-5 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/50">{detail}</p>
          </Link>
        ))}
      </section>
      <section className="mt-7 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <div className="flex items-center gap-2"><Blocks size={19} className="text-violet-300"/><h2 className="font-semibold">Fluxo do CRM</h2></div>
          <p className="mt-4 text-sm leading-7 text-white/60">
            Origem → contato → atendimento → oportunidade → próxima ação → proposta → venda → recorrência.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-300"/><h2 className="font-semibold">Ativação controlada</h2></div>
          <p className="mt-4 text-sm leading-7 text-white/60">
            Isolamento multiempresa, consentimento por canal, filas com retry e simulações antes de ativar uma automação.
            Nenhum indicador fictício é apresentado como dado operacional.
          </p>
        </div>
      </section>
    </div>
  )
}
