import Link from "next/link"
import { ArrowRight, CircleDashed, ShieldCheck, Workflow, Zap } from "lucide-react"
import { playbookTemplates } from "@/lib/server/playbooks/templates"

const actions: Record<string,string> = {
  "task.create":"Criar tarefa",
  "contact.tag":"Adicionar tag",
  "deal.follow_up":"Agendar retorno",
  "conversation.set_department":"Enviar para equipe",
  "message.queue":"Enfileirar mensagem (com consentimento)",
  "notification.create":"Gerar notificação",
}

export default function AutomationsPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-violet-300">Central de automações · SaaS CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight">Cada lead com seu próximo passo.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Modelos extraídos do motor real de playbooks. Visualizar não significa ativar:
            a publicação dependerá de login do tenant, simulação e aprovação.
          </p>
        </div>
        <Link href="/integrations" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold">
          Conectar meu site <ArrowRight size={16} />
        </Link>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          ["Entrada","Site, WhatsApp e API criam eventos do tenant."],
          ["Execução","Condições e ações passam pelo motor durável, com deduplicação."],
          ["Proteção","Consentimento, simulação, auditoria e retry sem disparos cegos."],
        ].map(([title,description],i) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <span className="mb-3 inline-flex size-8 items-center justify-center rounded-lg bg-violet-500/15 text-sm font-bold text-violet-200">{i+1}</span>
            <h2 className="font-medium">{title}</h2><p className="mt-2 text-sm leading-6 text-white/50">{description}</p>
          </div>
        ))}
      </section>

      <div className="mb-4 flex items-center gap-2">
        <Workflow size={19} className="text-violet-300" />
        <h2 className="text-xl font-semibold">Biblioteca de playbooks existentes</h2>
        <span className="ml-auto rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">Templates · não ativados</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {playbookTemplates.map(template => (
          <article key={template.key} className="rounded-2xl border border-white/10 bg-[#11151d] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{template.name}</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">{template.description}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
                <CircleDashed size={13} /> {template.mode === "shadow" ? "Simulação" : template.mode}
              </span>
            </div>
            <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/35">Quando acontecer</p>
              <p className="mt-1 text-sm font-medium text-violet-200">{template.triggerEvent}</p>
              <div className="my-3 border-t border-white/8" />
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/35">Então</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {template.actions.map((action,index) => (
                  <span key={index} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/75">
                    {actions[action.type] || action.type}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs text-white/35">
              {template.conditions.all?.length || 0} condições obrigatórias · {template.conditions.any?.length || 0} alternativas ·
              {" "}{template.cooldownSeconds > 0 ? "com cooldown" : "sem cooldown"}
            </p>
          </article>
        ))}
      </div>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-6">
          <Zap size={21} className="text-violet-300" />
          <h2 className="mt-3 text-lg font-semibold">Capturar leads do site</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            O widget usa identificador público e domínio autorizado para vincular cada solicitação à empresa correta.
            As entradas geram o evento <code>website.lead_submitted</code>.
          </p>
          <Link href="/integrations" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-violet-300">
            Ver integração <ArrowRight size={15} />
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <ShieldCheck size={21} className="text-emerald-300" />
          <h2 className="mt-3 text-lg font-semibold">Antes de ativar uma regra</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Validar, simular com eventos reais anonimizados, revisar impacto e aprovar.
            Mensagens de marketing exigem opt-in próprio; captar lead não autoriza campanha.
          </p>
          <Link href="/settings/whatsapp" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-violet-300">
            Ver WhatsApp <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  )
}
