"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Bot, CheckCheck, Clock3, Inbox, Info, Search, Send, ShieldCheck, Sparkles, UsersRound, X } from "lucide-react"

type Lead = {
  id:string; name:string; initials:string; company:string; time:string; summary:string;
  area:string; priority:"Alta"|"Normal"; stage:"Novo"|"Em atendimento"|"Handoff humano";
  message:string; suggestion:string; interest:string; owner:string
}

// Exclusively synthetic preview. These records are NEVER fetched from a tenant or sent to a provider.
const examples:Lead[]=[
  {id:"lead-1",name:"Mariana Costa",initials:"MC",company:"Cliente interessado",time:"10:42",summary:"Quero cotar 100 unidades para um projeto",area:"Comercial",priority:"Alta",stage:"Novo",message:"Oi! Quero cotar 100 unidades para um projeto. Vocês trabalham com atacado?",suggestion:"Claro! Para preparar uma cotação, qual produto você procura e para qual cidade seria a entrega?",interest:"Orçamento em volume",owner:"Não atribuído"},
  {id:"lead-2",name:"Studio Forma",initials:"SF",company:"Estúdio de arquitetura",time:"10:37",summary:"Gostaria de conversar sobre uma parceria",area:"Parcerias",priority:"Normal",stage:"Em atendimento",message:"Somos um escritório de arquitetura e gostaríamos de conversar sobre parceria.",suggestion:"Obrigado pelo contato! A parceria seria para indicação de projetos, revenda ou fornecimento?",interest:"Parceria B2B",owner:"Equipe de parcerias"},
  {id:"lead-3",name:"Rafael Lima",initials:"RL",company:"Cliente",time:"10:18",summary:"Preciso de ajuda com meu pedido",area:"Suporte",priority:"Alta",stage:"Handoff humano",message:"Meu pedido ainda não chegou. Preciso falar com uma pessoa.",suggestion:"Entendi. Vou encaminhar sua solicitação para a equipe responsável verificar seu pedido.",interest:"Acompanhamento de pedido",owner:"Aguardando atendente"},
  {id:"lead-4",name:"Casa Nobre",initials:"CN",company:"Loja de decoração",time:"Ontem",summary:"Vocês enviam para Campinas?",area:"Comercial",priority:"Normal",stage:"Em atendimento",message:"Boa tarde, vocês fazem entrega de revestimentos para Campinas?",suggestion:"Podemos verificar as opções de entrega. Qual produto e quantidade você precisa?",interest:"Entrega e logística",owner:"Não atribuído"},
]

type Filter="Todas"|"Novas"|"Prioridade"|"Humano"
const filterOptions:Filter[]=["Todas","Novas","Prioridade","Humano"]

export default function InboxPreview() {
  const [selected,setSelected]=useState("lead-1")
  const [search,setSearch]=useState("")
  const [filter,setFilter]=useState<Filter>("Todas")
  const [draft,setDraft]=useState("")
  const [details,setDetails]=useState(true)
  const [feedback,setFeedback]=useState("")
  const visible=useMemo(()=>examples.filter(x=>
    [x.name,x.company,x.summary,x.area].join(" ").toLowerCase().includes(search.toLowerCase().trim())
    && (filter==="Todas" || filter==="Novas"&&x.stage==="Novo" || filter==="Prioridade"&&x.priority==="Alta" || filter==="Humano"&&x.stage==="Handoff humano")
  ),[search,filter])
  const lead=examples.find(x=>x.id===selected)??examples[0]

  return <div className="overflow-hidden rounded-[24px] border border-[#e3e8df] bg-[#f8faf7] text-[#1b2b22] shadow-[0_20px_60px_rgba(0,0,0,.16)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ece5] bg-white px-5 py-4 sm:px-7">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e0f0e7] text-[#267354]"><Inbox size={19}/></span><div><h1 className="text-lg font-bold tracking-[-.035em]">Central de atendimento</h1><p className="text-[11px] text-[#7d8d82]">Converse, qualifique e acompanhe oportunidades</p></div></div>
      <span className="rounded-full border border-[#dbe9df] bg-[#f2f8f2] px-3 py-2 text-[11px] font-semibold text-[#3d805e]">Prévia de interface</span>
    </div>
    <div className="flex items-center gap-2 border-b border-[#e6ece5] bg-[#fbfcfa] px-5 py-2.5 sm:px-7"><Info size={15} className="shrink-0 text-[#698374]"/><p className="text-[11px] leading-5 text-[#637a6c]">Dados fictícios para avaliação visual. Não há WhatsApp, banco de clientes ou envio conectados nesta tela.</p></div>
    <div className={`grid min-h-[660px] ${details?"xl:grid-cols-[300px_minmax(0,1fr)_275px]":"xl:grid-cols-[330px_minmax(0,1fr)]"}`}>
      <aside className="flex flex-col border-b border-[#e6ece5] bg-white xl:border-b-0 xl:border-r">
        <div className="border-b border-[#edf1ec] p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-bold">Conversas <span className="ml-1 rounded-md bg-[#edf3ed] px-2 py-0.5 text-[11px] text-[#647d6a]">{visible.length}</span></h2><span className="text-[11px] text-[#99a79a]">Exemplo</span></div>
          <label className="flex items-center gap-2 rounded-xl border border-[#dce7df] bg-[#f7f9f6] px-3 py-2.5 focus-within:border-[#5f9e79]"><Search size={16} className="text-[#829589]"/><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Buscar conversas" placeholder="Buscar contato ou conversa..." className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a1aea3]"/>{search&&<button type="button" aria-label="Limpar busca" onClick={()=>setSearch("")}><X size={14}/></button>}</label>
          <div className="mt-3 flex flex-wrap gap-1.5">{filterOptions.map(item=><button key={item} type="button" aria-pressed={filter===item} onClick={()=>setFilter(item)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${filter===item?"bg-[#1f4937] text-white":"bg-[#eff3ef] text-[#798b7c] hover:bg-[#e4ebe3]"}`}>{item}</button>)}</div>
        </div>
        <div className="flex-1 divide-y divide-[#eff2ed]">{visible.length?visible.map(item=><button type="button" key={item.id} onClick={()=>{setSelected(item.id);setDraft("");setFeedback("")}} className={`flex w-full items-start gap-3 px-4 py-4 text-left transition ${selected===item.id?"bg-[#eef5ed] shadow-[inset_3px_0_0_#478c68]":"hover:bg-[#f9fbf8]"}`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#e4ece5] text-[12px] font-bold text-[#486957]">{item.initials}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-[12px]">{item.name}</strong><span className="shrink-0 text-[10px] text-[#a2aea4]">{item.time}</span></span><span className="mt-1 block truncate text-[11px] text-[#7d9081]">{item.summary}</span><span className="mt-2 flex items-center gap-1.5"><span className="rounded-md bg-white px-2 py-1 text-[10px] text-[#6c816e]">{item.area}</span>{item.priority==="Alta"&&<span className="rounded-md bg-[#fff1e3] px-2 py-1 text-[10px] text-[#ac7039]">Prioridade alta</span>}</span></span>
        </button>):<p className="px-4 py-12 text-center text-xs text-[#7b907e]">Nenhuma conversa encontrada.</p>}</div>
        <div className="border-t border-[#edf1ed] px-4 py-3 text-[11px] text-[#9ba99e]">4 conversas fictícias</div>
      </aside>
      <section className="flex min-h-[540px] min-w-0 flex-col bg-[#fafbf8]">
        <div className="flex items-center justify-between gap-2 border-b border-[#e5ebe3] bg-white px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e0ebe3] text-[11px] font-bold">{lead.initials}</span><span><strong className="block text-[13px]">{lead.name}</strong><span className="text-[11px] text-[#889a8d]">WhatsApp · {lead.area}</span></span></div><div className="flex items-center gap-2"><span className="hidden rounded-lg border border-[#e3ebe3] bg-[#f7faf6] px-2 py-1.5 text-[10px] text-[#607c6a] sm:inline">{lead.stage}</span><button type="button" aria-label={details?"Ocultar detalhes":"Mostrar detalhes"} aria-pressed={details} onClick={()=>setDetails(!details)} className="rounded-lg border border-[#e3ebe3] p-2 text-[#678575]"><UsersRound size={17}/></button></div></div>
        <div className="flex flex-1 flex-col gap-6 px-6 py-8"><div className="flex justify-center"><span className="rounded-full bg-[#ecf1eb] px-3 py-1.5 text-[10px] text-[#849789]">Exemplo fictício · Prévia do atendimento</span></div>
          <div className="max-w-[87%] self-start rounded-2xl rounded-tl-sm border border-[#e7ede5] bg-white p-4 text-[13px] leading-6 text-[#374e3e] shadow-sm"><p>{lead.message}</p><span className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[#a4afa6]">{lead.time}<CheckCheck size={12}/></span></div>
          <div className="max-w-[94%] self-end rounded-2xl border border-[#cbe1d2] bg-[#edf7f0] p-4 shadow-[0_6px_24px_rgba(17,84,42,.05)]"><div className="mb-2 flex items-center gap-2 text-[#32835d]"><Sparkles size={15}/><strong className="text-[11px]">Sugestão para revisão humana</strong></div><p className="text-[12px] leading-6 text-[#456b52]">{lead.suggestion}</p><button type="button" onClick={()=>{setDraft(lead.suggestion);setFeedback("Sugestão inserida no rascunho local.")}} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2f8159] hover:underline">Usar como rascunho <ArrowRight size={13}/></button></div>
        </div>
        <div className="border-t border-[#e4ebe1] bg-white p-4 sm:px-6"><div className="rounded-2xl border border-[#dfe8dd] bg-[#fbfcfa] p-3 focus-within:border-[#83b095]"><textarea value={draft} onChange={e=>{setDraft(e.target.value);setFeedback("")}} aria-label="Rascunho de resposta" rows={2} placeholder="Digite um rascunho... (envio indisponível)" className="w-full resize-none bg-transparent text-[12px] leading-6 outline-none placeholder:text-[#a5b1a6]"/><div className="flex items-center justify-between border-t border-[#edf1eb] pt-2"><span className="inline-flex items-center gap-1.5 text-[10px] text-[#849688]"><ShieldCheck size={13}/> Sem envio real</span><button type="button" disabled title="Conecte e autentique o WhatsApp para enviar mensagens" aria-label="Envio indisponível na prévia" className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-[#cedbd0] px-4 py-2 text-[11px] font-bold text-[#76917e]">Enviar <Send size={13}/></button></div></div>{feedback&&<p role="status" className="mt-2 text-[11px] text-[#39855f]">{feedback}</p>}</div>
      </section>
      {details&&<aside className="border-t border-[#e6ece5] bg-white xl:border-l xl:border-t-0"><div className="border-b border-[#e6ece5] px-5 py-5"><strong className="text-[12px]">Contexto do lead</strong></div><div className="p-5"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#e6ede5] text-xs font-bold">{lead.initials}</span><span><strong className="block text-[13px]">{lead.name}</strong><span className="text-[11px] text-[#94a194]">{lead.company}</span></span></div>
      <div className="mt-5 border-t border-[#edf1ec] pt-5"><h3 className="mb-4 flex items-center gap-2 text-[12px] font-bold"><Bot size={16} className="text-[#367e58]"/> Triagem sugerida</h3><div className="space-y-3">{[["Intenção",lead.interest],["Departamento",lead.area],["Prioridade",lead.priority],["Responsável",lead.owner]].map(([k,v])=><div key={k} className="flex items-center justify-between gap-3 text-[11px]"><span className="text-[#8e9f90]">{k}</span><strong className="text-right font-semibold text-[#45604c]">{v}</strong></div>)}</div></div>
      <div className="mt-5 border-t border-[#edf1ec] pt-5"><h3 className="flex items-center gap-2 text-[12px] font-bold"><Clock3 size={15} className="text-[#508d68]"/> Próximo passo</h3><p className="mt-3 text-[11px] leading-5 text-[#798f7d]">{lead.stage==="Handoff humano"?"Solicitar atendimento humano; não responder automaticamente.":"Confirmar dados faltantes e revisar a sugestão antes de encaminhar."}</p></div>
      <div className="mt-6 rounded-xl border border-[#e1ece1] bg-[#f5f9f3] p-3 text-[11px] leading-5 text-[#748b75]"><Info size={14} className="mb-2"/>Classificações simuladas. Nada foi escrito no CRM ou enviado ao cliente.</div></div></aside>}
    </div>
  </div>
}