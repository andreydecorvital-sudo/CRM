"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Check, ClipboardCopy, Code2, Globe2, Info, MessageCircle, ShieldCheck } from "lucide-react"

export default function IntegrationsPage() {
  const [siteId,setSiteId] = useState("")
  const [copied,setCopied] = useState(false)
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(siteId.trim())
  const snippet = `<script async src="https://SEU_CRM/api/public/widget.js?site=${valid ? siteId.trim() : "ID_DO_SITE"}"></script>`

  async function copy() {
    if (!valid) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
    } catch { setCopied(false) }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="mb-2 text-sm text-violet-300">Integrações</p>
        <h1 className="text-3xl font-semibold tracking-tight">Conecte o CRM ao seu negócio.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
          A captura de leads já tem um endpoint próprio e um widget incorporável.
          Para ativar uma empresa real, precisamos provisionar o site no tenant e autorizar seu domínio.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon:Globe2,title:"Site e landing page",detail:"Formulário flutuante, UTM e evento no CRM.",state:"Base implementada" },
          { icon:MessageCircle,title:"WhatsApp",detail:"Infraestrutura multiempresa via adapter WAHA; conexão do cliente exige provedor e sessão.",state:"Configuração necessária" },
          { icon:Code2,title:"API e webhooks",detail:"API key com scopes para sistemas externos; eventos acionam as automações.",state:"Backend existente" },
        ].map(item => (
          <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <item.icon size={24} className="text-violet-300" />
            <h2 className="mt-3 font-semibold">{item.title}</h2>
            <p className="mt-2 min-h-14 text-sm leading-6 text-white/50">{item.detail}</p>
            <p className="mt-4 text-xs text-white/40">{item.state}</p>
          </article>
        ))}
      </div>

      <section className="mt-7 rounded-2xl border border-white/10 bg-[#11151d] p-6">
        <div className="flex items-center gap-3"><Globe2 className="text-violet-300" size={22}/><h2 className="text-xl font-semibold">Instalar no site do cliente</h2></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <label htmlFor="sourceId" className="mb-2 block text-sm font-medium">Identificador do site</label>
            <input
              id="sourceId" value={siteId} onChange={event => { setSiteId(event.target.value);setCopied(false) }}
              placeholder="UUID fornecido pelo administrador"
              className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm outline-none focus:border-violet-400"
            />
            <p className="mt-3 text-xs leading-5 text-white/45">
              Substitua SEU_CRM pelo domínio publicado do SaaS. O identificador só funciona após o site ser criado, ter domínio autorizado e ser ativado.
              Não é senha e não deve ser usado para autorizar chamadas administrativas.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Código para colar antes de fechar o body</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-violet-200">{snippet}</pre>
            <button
              disabled={!valid} onClick={copy}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
              {copied ? <Check size={16} /> : <ClipboardCopy size={16}/>}
              {copied ? "Copiado" : "Copiar código"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={19} className="text-emerald-300"/> O que acontece com os leads?</h2>
          <ol className="mt-4 list-inside list-decimal space-y-2 text-sm leading-6 text-white/60">
            <li>O visitante autoriza o retorno e envia os dados.</li>
            <li>Origem, tenant, limites e duplicação são verificados no servidor.</li>
            <li>O CRM cria/atualiza o contato e registra <code>website.lead_submitted</code>.</li>
            <li>Uma regra ativada posteriormente poderá gerar tarefa ou follow-up.</li>
          </ol>
        </div>
        <div className="rounded-2xl border border-white/10 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Info size={19} className="text-amber-300"/> Antes de entregar ao cliente</h2>
          <p className="mt-4 text-sm leading-6 text-white/60">
            Falta implementar login e onboarding próprios, ativação de domínios pela empresa,
            limites por assinatura e um painel autenticado de regras. A tela atual orienta a instalação
            e não inventa conexões, dados ou automações ativas.
          </p>
          <Link href="/automations" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-300">
            Ver modelos de automação <ArrowRight size={15}/>
          </Link>
          <Link href="/settings/whatsapp" className="mt-3 flex items-center gap-2 text-sm font-semibold text-violet-300">
            Consultar WhatsApp <ArrowRight size={15}/>
          </Link>
        </div>
      </section>
    </div>
  )
}
