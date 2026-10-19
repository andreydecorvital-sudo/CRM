"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CheckCheck, ChevronLeft, CircleAlert, Inbox, Loader2, LogOut, MessageCircle, RefreshCw, Search, Send, ShieldCheck, UserRoundCheck, UserRoundX, Users, X } from "lucide-react"

type Conversation={
 id:string;contactId:string;name:string;phone:string|null;city:string|null;temperature:string;
 channel:string;status:string;category:string;priority:string;aiMode:string;unread:number;
 assignedTo:string|null;department:string|null;summary:string|null;lastAt:string|null;lastInboundAt:string|null
}
type Message={id:string;direction:"inbound"|"outbound";actor:string;text:string;status:string;created_at:string;sent_at:string|null}
type Thread={conversation:Conversation;messages:Message[];outbound:Array<{id:string;body:string;status:string;created_at:string}>}
type Filter="all"|"unread"|"mine"|"open"

function dateTime(value:string|null) {
  if(!value)return "—"
  const date=new Date(value)
  return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date)
}
const displayStatus:Record<string,string>={
 open:"Aberto",waiting_team:"Aguardando equipe",waiting_contact:"Aguardando cliente",resolved:"Resolvido"
}
const errorTranslation:Record<string,string>={
 claim_before_sending:"Assuma o atendimento antes de responder.",
 claim_before_resolving:"Assuma o atendimento antes de resolver.",
 conversation_assigned_to_other:"Conversa atribuída a outro operador.",
 not_conversation_owner:"Você não é responsável por esta conversa.",
 human_takeover_required:"Assuma o atendimento humano antes de responder.",
 outbound_not_enabled:"Envio ainda não liberado para este piloto.",
 reply_unavailable:"O serviço de envio está indisponível.",
 whatsapp_not_connected:"WhatsApp desta empresa ainda não está conectado.",
 outside_customer_service_window:"A última mensagem do cliente passou de 24 horas. É necessário seguir o fluxo permitido pelo provedor.",
 conversation_not_found:"Conversa não encontrada.",
 inbox_unavailable:"Não foi possível consultar o banco do CRM.",
 thread_unavailable:"Não foi possível carregar o histórico.",
 operation_failed:"Não foi possível concluir a operação."
}

export default function OperatorInbox({operatorId}:{operatorId:string}) {
  const router=useRouter()
  const [list,setList]=useState<Conversation[]>([])
  const [selected,setSelected]=useState<string|null>(null)
  const [thread,setThread]=useState<Thread|null>(null)
  const [filter,setFilter]=useState<Filter>("open")
  const [query,setQuery]=useState("")
  const [draft,setDraft]=useState("")
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState("")
  const [error,setError]=useState("")
  const [sendEnabled,setSendEnabled]=useState(false)
  const [tenants,setTenants]=useState<Array<{id:string;name:string;selected:boolean}>>([])
  const [pendingReplyId,setPendingReplyId]=useState<string|null>(null)
  const [detailOpen,setDetailOpen]=useState(true)
  const [mobileThread,setMobileThread]=useState(false)
  
  const reload=useCallback(async()=>{
    try {
      const res=await fetch("/api/operator/inbox",{credentials:"same-origin",cache:"no-store"})
      if(!res.ok)throw new Error("inbox_unavailable")
      const data=await res.json() as {conversations:Conversation[]}
      const conversations=Array.isArray(data.conversations)?data.conversations:[]
      setList(conversations)
      setSelected(previous=>previous&&conversations.some(x=>x.id===previous)?previous:conversations[0]?.id??null)
      setError("")
    }catch(e){setError(errorTranslation[e instanceof Error?e.message:""]||"Falha na leitura das conversas.")}
    finally{setLoading(false)}
  },[])
  const loadThread=useCallback(async(id:string)=>{
    try{
      const res=await fetch(`/api/operator/inbox/${id}`,{credentials:"same-origin",cache:"no-store"})
      if(!res.ok)throw new Error("thread_unavailable")
      setThread(await res.json() as Thread)
      setError("")
    }catch{setThread(null);setError("Não foi possível consultar o histórico desta conversa.")}
  },[])

  useEffect(()=>{
    const initial=setTimeout(()=>{void reload()},0)
    void fetch("/api/operator/session",{cache:"no-store",credentials:"same-origin"})
      .then(res=>res.json()).then(data=>{
        setSendEnabled(data.sendEnabled===true)
        setTenants(Array.isArray(data.tenants)?data.tenants:[])
      }).catch(()=>setSendEnabled(false))
    const interval=setInterval(()=>{void reload()},30000)
    return ()=>{clearTimeout(initial);clearInterval(interval)}
  },[reload])
  useEffect(()=>{
    if(!selected)return
    const handle=setTimeout(()=>{void loadThread(selected)},0)
    return ()=>clearTimeout(handle)
  },[selected,loadThread])

  const visible=useMemo(()=>list.filter(item=>{
    if(filter==="unread"&&item.unread<=0)return false
    if(filter==="mine"&&item.assignedTo!==operatorId)return false
    if(filter==="open"&&item.status==="resolved")return false
    const search=query.toLocaleLowerCase("pt-BR").trim()
    return !search || [item.name,item.phone,item.summary,item.department].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(search)
  }),[list,filter,query,operatorId])
  const selectedConversation=thread?.conversation || list.find(x=>x.id===selected) || null
  const myConversation=selectedConversation?.assignedTo===operatorId
  const canReply=Boolean(sendEnabled&&myConversation&&selectedConversation?.status!=="resolved"&&selectedConversation?.aiMode==="off"&&draft.trim())

  async function action(name:string) {
    if(!selected)return
    setBusy(true);setMessage("");setError("")
    try{
      const res=await fetch(`/api/operator/inbox/${selected}`,{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:name})})
      const data=await res.json() as {error?:string}
      if(!res.ok)throw new Error(data.error||"operation_failed")
      setMessage(name==="claim"?"Atendimento assumido: resposta automática desativada.":name==="resolve"?"Conversa resolvida.":name==="mark_read"?"Marcado como lido.":"Alteração registrada.")
      await reload();await loadThread(selected)
    }catch(e){setError(errorTranslation[e instanceof Error?e.message:""]||"Operação indisponível.")}
    finally{setBusy(false)}
  }
  async function reply() {
    if(!selected||!canReply)return
    if(!window.confirm("Confirmar o envio desta mensagem ao cliente pela fila do WhatsApp?"))return
    setBusy(true);setMessage("");setError("")
    try {
      const operationId=pendingReplyId||crypto.randomUUID()
      setPendingReplyId(operationId)
      const res=await fetch(`/api/operator/inbox/${selected}/reply`,{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({body:draft,operationId,confirmed:true})
      })
      const data=await res.json() as {error?:string}
      if(!res.ok)throw new Error(data.error||"reply_unavailable")
      setDraft("");setPendingReplyId(null);setMessage("Mensagem inserida na fila. O envio ao cliente depende da confirmação do provedor.")
      await loadThread(selected)
    }catch(e){setError(errorTranslation[e instanceof Error?e.message:""]||"Não foi possível enfileirar a mensagem.")}
    finally{setBusy(false)}
  }
  async function switchTenant(id:string) {
    if(!id||id===tenants.find(t=>t.selected)?.id)return
    setBusy(true);setError("")
    try {
      const result=await fetch("/api/operator/session",{
        method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({tenantId:id})
      })
      if(!result.ok)throw new Error("tenant_switch_failed")
      window.location.reload()
    }catch{
      setError("Não foi possível mudar de empresa. Confira suas permissões.")
      setBusy(false)
    }
  }
  async function logout() {
    const res=await fetch("/api/operator/session",{method:"DELETE",credentials:"same-origin"})
    if(res.ok)router.refresh()
  }

  return <div className="flex min-h-screen flex-col bg-[#f5f7f8] font-sans text-[#17242d]">
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#e6e9ec] bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#183a36] text-white"><MessageCircle size={20}/></span><span><strong className="block text-[14px] tracking-tight">CRM <span className="font-medium text-[#8794a0]">/ Atendimento</span></strong><span className="block text-[10px] text-[#83919b]">Operação interna · Dados do CRM</span></span></div>
      <div className="flex items-center gap-2 sm:gap-4">{tenants.length>1&&<label className="hidden items-center gap-2 text-[11px] text-[#71818a] sm:flex">Empresa <select aria-label="Empresa ativa" disabled={busy} value={tenants.find(t=>t.selected)?.id||""} onChange={e=>void switchTenant(e.target.value)} className="max-w-36 rounded-lg border border-[#e5e9eb] bg-white px-2 py-2 text-xs text-[#475a65]">{tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}<span className="hidden items-center gap-2 rounded-full bg-[#e9f4eb] px-3 py-1.5 text-[11px] font-semibold text-[#38815e] sm:flex"><span className="size-1.5 rounded-full bg-[#47996c]"/> Acesso autorizado</span><button onClick={()=>void reload()} type="button" aria-label="Atualizar conversas" className="rounded-lg p-2 text-[#60737d] hover:bg-[#f3f5f6]"><RefreshCw size={17}/></button><button onClick={()=>void logout()} type="button" className="flex items-center gap-2 rounded-lg border border-[#e5e9eb] px-3 py-2 text-[12px] text-[#596a75] hover:bg-[#f7f9fa]"><LogOut size={14}/><span className="hidden sm:inline">Sair</span></button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[76px] shrink-0 flex-col items-center gap-4 border-r border-[#e6e9ec] bg-white py-6 lg:flex">
        <span className="grid size-11 place-items-center rounded-xl bg-[#ecf4ee] text-[#246e4e]" title="Atendimento"><Inbox size={21}/></span>
        <Link href="/crm" title="Funil comercial (em evolução)" className="grid size-11 place-items-center rounded-xl text-[#96a2aa] hover:bg-[#f3f5f6]"><Users size={21}/></Link>
        <div className="flex-1"/><span className="mb-3 text-[10px] font-semibold text-[#aab3b9]">PILOTO</span>
      </aside>
      <div className="grid min-w-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_290px]">
        <aside className={`${mobileThread?"hidden":"flex"} min-w-0 flex-col border-r border-[#e6e9ec] bg-white lg:flex`}>
          <div className="border-b border-[#edf0f2] px-5 pb-4 pt-5"><div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-bold tracking-tight">Conversas</h1><span className="rounded-full bg-[#eef2f0] px-2.5 py-1 text-[11px] font-semibold text-[#71837a]">{list.length}</span></div>
            <div className="flex items-center gap-2 rounded-xl border border-[#e1e6e9] bg-[#fafbfb] px-3 focus-within:border-[#88b79f]"><Search size={17} className="text-[#9aa5ae]"/><input aria-label="Buscar conversas" className="min-w-0 flex-1 bg-transparent py-3 text-[12px] outline-none placeholder:text-[#a0abb2]" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar contato ou assunto..."/>{query&&<button type="button" aria-label="Limpar busca" onClick={()=>setQuery("")}><X size={13}/></button>}</div>
            <div className="mt-4 flex gap-1.5">{([["open","Em aberto"],["unread","Não lidas"],["mine","Minhas"],["all","Todas"]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`rounded-lg px-2.5 py-2 text-[10px] font-semibold ${filter===key?"bg-[#1e4c42] text-white":"bg-[#f2f4f5] text-[#71818a] hover:bg-[#e9eeee]"}`}>{label}</button>)}</div>
          </div>
          <div className="max-h-[calc(100vh-245px)] flex-1 overflow-y-auto">{loading?<p className="flex items-center justify-center gap-2 px-4 py-16 text-xs text-[#84929b]"><Loader2 size={16} className="animate-spin"/> Carregando conversas...</p>:visible.length===0?<div className="px-7 py-16 text-center"><Inbox size={30} className="mx-auto mb-4 text-[#abb9b3]"/><p className="text-[13px] font-semibold">Nenhuma conversa aqui</p><p className="mt-2 text-xs leading-5 text-[#91a0a9]">Os atendimentos recebidos aparecerão após conectar e configurar o WhatsApp da empresa.</p></div>:visible.map(item=><button type="button" key={item.id} onClick={()=>{setSelected(item.id);setThread(null);setDraft("");setPendingReplyId(null);setMobileThread(true)}} className={`flex w-full gap-3 border-b border-[#f0f2f3] px-5 py-4 text-left transition hover:bg-[#f7faf8] ${selected===item.id?"bg-[#eaf3ed]":"bg-white"}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e5ece7] text-xs font-bold text-[#416551]">{item.name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><strong className="truncate text-[12px]">{item.name}</strong><span className="shrink-0 text-[10px] text-[#9aa8ad]">{dateTime(item.lastAt)}</span></span><span className="mt-1 block truncate text-[11px] text-[#80919a]">{item.summary||`${item.channel} · ${displayStatus[item.status]||item.status}`}</span><span className="mt-2 flex items-center gap-1.5"><span className="rounded-md bg-[#edf1f0] px-2 py-1 text-[10px] text-[#668076]">{item.department||item.category||"Triagem"}</span>{item.priority==="high"||item.priority==="urgent"?<span className="rounded-md bg-[#fff0e9] px-2 py-1 text-[10px] text-[#bf7448]">Prioridade</span>:null}{item.unread>0&&<span className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#438565] px-1.5 py-0.5 text-[10px] font-bold text-white">{item.unread}</span>}</span></span>
            </button>)}</div>
          <div className="mt-auto border-t border-[#edf0f2] px-5 py-4 text-[11px] text-[#99a6ad]">Atualização automática a cada 30 s</div>
        </aside>
        <section className={`${mobileThread?"flex":"hidden"} min-h-[650px] min-w-0 flex-col bg-[#f7f9f9] lg:flex`}>
          {!selectedConversation?<div className="grid flex-1 place-items-center px-7 text-center"><div><MessageCircle className="mx-auto mb-4 text-[#b2c0b8]" size={38}/><h2 className="font-semibold">Selecione uma conversa</h2><p className="mt-2 text-xs text-[#8a9aa2]">Mensagens reais aparecerão aqui, sem dados fictícios.</p></div></div>:<>
            <div className="flex items-center justify-between gap-2 border-b border-[#e5e9e9] bg-white px-4 py-3 sm:px-6"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={()=>setMobileThread(false)} className="p-1 text-[#6e8085] lg:hidden" aria-label="Voltar à lista"><ChevronLeft size={19}/></button><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e5ece7] font-semibold text-[#416551]"><Users size={18}/></span><span className="min-w-0"><strong className="block truncate text-[13px]">{selectedConversation.name}</strong><span className="block truncate text-[11px] text-[#88979d]">{selectedConversation.phone||"Sem telefone"} · {displayStatus[selectedConversation.status]||selectedConversation.status}</span></span></div><button type="button" className="rounded-lg border border-[#e1e8e6] p-2 text-[#6f8478] 2xl:hidden" aria-label="Alternar detalhes" aria-pressed={detailOpen} onClick={()=>setDetailOpen(!detailOpen)}><Users size={17}/></button></div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e7ece9] bg-[#fcfdfc] px-4 py-3 sm:px-6">{!myConversation&&<button disabled={busy} onClick={()=>void action("claim")} className="flex items-center gap-1.5 rounded-lg bg-[#20584a] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"><UserRoundCheck size={14}/> Assumir atendimento</button>}{myConversation&&<button disabled={busy} onClick={()=>void action("release")} className="flex items-center gap-1.5 rounded-lg border border-[#dce5e0] px-3 py-2 text-[11px] font-semibold text-[#537361]"><UserRoundX size={14}/> Liberar</button>}{selectedConversation.status==="resolved"?<button disabled={busy} onClick={()=>void action("reopen")} className="rounded-lg border border-[#dce5e0] px-3 py-2 text-[11px] font-semibold text-[#537361]">Reabrir</button>:<button disabled={busy} onClick={()=>void action("resolve")} className="flex items-center gap-1.5 rounded-lg border border-[#dce5e0] px-3 py-2 text-[11px] font-semibold text-[#537361]"><Check size={14}/> Resolver</button>} {selectedConversation.unread>0&&<button disabled={busy} onClick={()=>void action("mark_read")} className="flex items-center gap-1.5 rounded-lg border border-[#dce5e0] px-3 py-2 text-[11px] font-semibold text-[#537361]"><CheckCheck size={14}/> Marcar lido</button>}</div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-7 sm:px-8"><div className="mb-6 text-center"><span className="rounded-full bg-white px-3 py-1.5 text-[10px] text-[#87999a]">Histórico do CRM</span></div>{thread===null?<p className="flex items-center justify-center gap-2 py-10 text-xs text-[#8d9b9b]"><Loader2 size={15} className="animate-spin"/> Consultando mensagens...</p>:thread.messages.length===0?<p className="py-10 text-center text-xs text-[#95a4a4]">Sem mensagens registradas para esta conversa.</p>:thread.messages.map(m=><div key={m.id} className={`flex ${m.direction==="outbound"?"justify-end":"justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[12px] leading-6 shadow-sm sm:max-w-[70%] ${m.direction==="outbound"?"rounded-tr-sm border border-[#c6dfcf] bg-[#e3f3e8] text-[#345844]":"rounded-tl-sm border border-[#e7eaea] bg-white text-[#304047]"}`}><p>{m.text||"Mensagem sem texto"}</p><div className="mt-1 flex items-center justify-end gap-2 text-[10px] opacity-60"><span>{dateTime(m.sent_at||m.created_at)}</span>{m.direction==="outbound"&&<span>{m.status}</span>}</div></div></div>)}{thread&&thread.outbound.length>0&&<div className="mx-auto max-w-xl rounded-xl border border-[#e2e7de] bg-[#f0f3eb] p-3 text-xs text-[#657c67]"><p className="mb-2 font-semibold">Fila de envio</p>{thread.outbound.map(o=><p key={o.id} className="mt-1 break-words">• {o.status}: {o.body.slice(0,150)}</p>)}</div>}</div>
            {error&&<div role="alert" className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-[#fff2ec] px-4 py-3 text-xs text-[#ae6549]"><CircleAlert size={17}/>{error}</div>}
            {message&&<div role="status" className="mx-4 mb-2 rounded-xl bg-[#e7f3e9] px-4 py-3 text-xs text-[#397758]">{message}</div>}
            <div className="border-t border-[#e6ebe8] bg-white px-4 py-4 sm:px-6"><div className="rounded-xl border border-[#e0e7e4] bg-[#fafcfa] p-3 focus-within:border-[#8cb7a0]"><textarea aria-label="Resposta ao cliente" rows={2} value={draft} onChange={e=>{setDraft(e.target.value);setPendingReplyId(null)}} placeholder={myConversation?"Escreva sua resposta ao cliente...":"Assuma a conversa antes de responder"} disabled={!myConversation||selectedConversation.status==="resolved"} className="block w-full resize-none bg-transparent text-[12px] leading-6 outline-none placeholder:text-[#a2aeaa] disabled:cursor-not-allowed"/><div className="mt-2 flex items-center justify-between border-t border-[#e8eeea] pt-2"><span className="flex items-center gap-1.5 text-[10px] text-[#97a7a1]"><ShieldCheck size={14}/> {sendEnabled?"Fila protegida · envio confirmado pelo provedor":"Envio não habilitado"}</span><button type="button" disabled={busy||!canReply} onClick={()=>void reply()} className="flex items-center gap-2 rounded-lg bg-[#20584a] px-4 py-2.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#bfcbc5]"><Send size={14}/> Enviar mensagem</button></div></div></div>
          </>}
        </section>
        <aside className={`${detailOpen?"block":"hidden"} min-w-0 border-l border-[#e5e9ec] bg-white 2xl:block`}>
          <div className="border-b border-[#e8edef] px-5 py-5"><strong className="text-[13px]">Detalhes do atendimento</strong></div>
          {selectedConversation?<div className="space-y-6 px-5 py-6"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9facb3]">Contato</p><h2 className="text-[14px] font-semibold">{selectedConversation.name}</h2><p className="mt-1 text-[11px] text-[#7b8d97]">{selectedConversation.phone||"Não informado"}</p><p className="text-[11px] text-[#7b8d97]">{selectedConversation.city||"Cidade não informada"}</p></div><div className="border-t border-[#eef1f2] pt-5"><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#9facb3]">Qualificação</p>{[["Departamento",selectedConversation.department||"Não definido"],["Categoria",selectedConversation.category],["Prioridade",selectedConversation.priority],["Temperatura",selectedConversation.temperature],["Atendimento",selectedConversation.assignedTo?"Atribuído":"Sem responsável"],["IA",selectedConversation.aiMode]].map(([k,v])=><div className="mb-3 flex items-center justify-between gap-2 text-[11px]" key={k}><span className="text-[#8c9ca5]">{k}</span><strong className="text-right font-medium text-[#43535f]">{v}</strong></div>)}</div><div className="border-t border-[#eef1f2] pt-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9facb3]">Última mensagem do cliente</p><p className="text-xs text-[#627783]">{dateTime(selectedConversation.lastInboundAt)}</p></div><div className="rounded-xl border border-[#deebe0] bg-[#f3faf3] p-3 text-[11px] leading-5 text-[#698674]"><ShieldCheck className="mb-2" size={16}/>Assumir atendimento ativa o takeover humano e desliga as respostas automáticas desta conversa.</div></div>:<p className="px-5 py-6 text-xs text-[#97a5ab]">Escolha uma conversa para ver os detalhes.</p>}
        </aside>
      </div>
    </div>
    <footer className="border-t border-[#e6e9ec] bg-white px-4 py-3 text-center text-[10px] text-[#8999a0]">CRM · Piloto interno · Conversas isoladas por empresa · Sem dados de demonstração</footer>
  </div>
}
