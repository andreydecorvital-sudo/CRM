"use client"

import WorkspaceNavigation from "../../workspace-navigation"
import Image from "next/image"
import { useCallback, useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, CircleDashed, ExternalLink, Link2, RefreshCw, Server, ShieldCheck, Smartphone, WifiOff } from "lucide-react"

type Check={key:string;label:string;ok:boolean}
type Provider={provider:string;status:string;phone:string|null;session:string|null}
type Diagnostics={
  error?:string;checks:Check[];providers:Provider[];readyForPairing:boolean;connectedVerified:boolean;
  nextStep?:string;note?:string;liveStatus?:string|null
}

export default function WhatsappSetup() {
  const [state,setState]=useState<Diagnostics|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState("")
  const [working,setWorking]=useState(false)
  const [qr,setQr]=useState<string|null>(null)
  const [pairStatus,setPairStatus]=useState<string|null>(null)
  const [notice,setNotice]=useState("")
  const reload=useCallback(async()=>{
    setLoading(true)
    try{
      const response=await fetch("/api/operator/whatsapp",{cache:"no-store",credentials:"same-origin"})
      const result=await response.json() as Diagnostics
      setState(result)
      if(!response.ok)throw new Error(result.error||"Falha ao consultar WhatsApp")
      setError("")
    }catch{setError("Não foi possível consultar as conexões desta empresa. Verifique o banco e as permissões de acesso.")}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{
    const handle=setTimeout(()=>{void reload()},0)
    return ()=>clearTimeout(handle)
  },[reload])
  async function prepare(){
    setWorking(true);setError("");setNotice("")
    try {
      const res=await fetch("/api/operator/whatsapp",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"prepare"}),
      })
      if(!res.ok)throw new Error("connection_prepare_failed")
      setNotice("Canal exclusivo da empresa registrado. Próxima etapa: preparar a sessão WAHA.")
      await reload()
    }catch{setError("Não foi possível cadastrar o canal. O administrador precisa ativar a migration de registro no Supabase do CRM.")}
    finally{setWorking(false)}
  }
  async function startPairing(){
    if(!window.confirm("Criar uma sessão exclusiva no provedor WAHA configurado para o CRM? Nenhuma sessão existente será alterada."))return
    setWorking(true);setError("");setNotice("")
    try{
      const r=await fetch("/api/operator/whatsapp/pairing",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"start",confirmed:true}),
      })
      const data=await r.json() as {error?:string;status?:string}
      if(!r.ok)throw new Error(data.error||"pairing_unavailable")
      setPairStatus(data.status||"STARTING")
      setNotice("Sessão preparada. Quando aparecer SCAN_QR_CODE, clique em Exibir QR.")
    }catch(e){setError(e instanceof Error&&e.message==="waha_dedicated_instance_required"?
      "Configure uma instância WAHA exclusiva do CRM. A sessão do Argoplace está protegida.":
      "Ainda faltam as credenciais, o webhook ou a instância WAHA dedicada. Nenhum número foi conectado.")}
    finally{setWorking(false)}
  }
  async function fetchQr(){
    setWorking(true);setError("")
    try{
      const r=await fetch("/api/operator/whatsapp/pairing",{credentials:"same-origin",cache:"no-store"})
      const data=await r.json() as {error?:string;status?:string;qr?:string|null;connected?:boolean}
      if(!r.ok)throw new Error(data.error||"qr_unavailable")
      setPairStatus(data.status||null)
      setQr(data.qr||null)
      if(data.connected)setNotice("WAHA confirmou a sessão WORKING. Verifique o recebimento antes de liberar envios.")
      else if(!data.qr)setNotice("A sessão ainda não gerou QR. Atualize novamente após o início.")
    }catch{setError("QR indisponível. Confira se a sessão exclusiva foi iniciada e se o WAHA está acessível.")}
    finally{setWorking(false)}
  }
  const wa=state?.providers.find(p=>p.provider==="waha")
  const checks=state?.checks||[]
  const allConfigured=checks.length>0&&checks.every(c=>c.ok)
  const status=state?.connectedVerified?"Sessão WAHA verificada como WORKING":wa?.status==="connected"?"Conexão cadastrada como conectada":
    wa?"Conexão cadastrada — aguardando pareamento":"Nenhuma conexão desta empresa cadastrada"
  const reached=allConfigured&&wa?.session

  return <main className="min-h-screen bg-[#f5f7f7] font-sans text-[#202d32]">
    <WorkspaceNavigation/>
    <div className="mx-auto max-w-5xl space-y-7 px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.17em] text-[#568d70]">Configuração do canal</p><h1 className="text-3xl font-bold tracking-[-.04em]">Conectar WhatsApp</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#738489]">Veja o estado real da integração. Nenhum número será pareado, reiniciado ou desconectado ao consultar esta página.</p></div>
      <button type="button" onClick={()=>void reload()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#23483f] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"><RefreshCw size={15} className={loading?"animate-spin":""}/> Verificar agora</button></div>
      {error&&<div role="alert" className="flex items-start gap-2 rounded-xl border border-[#f0ded3] bg-[#fff8f4] px-4 py-3 text-xs text-[#9b634e]"><AlertCircle size={17}/>{error}</div>}
      <section className="rounded-2xl border border-[#e1e8e6] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#f0f4f2] text-[#5d7d6b]"><Smartphone size={22}/></span><div><h2 className="text-base font-semibold">Canal da empresa</h2><p className="mt-1 text-xs text-[#8b999a]">{loading?"Consultando a configuração...":status}</p></div></div>
        <span className="rounded-full border border-[#e2e7dc] bg-[#fbf8ee] px-3 py-1.5 text-[11px] font-semibold text-[#987941]">{state?.connectedVerified?"Conexão verificada":"Não verificado ao vivo"}</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#f7f9f8] p-4"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#93a09d]">Provedor</span><strong className="mt-2 block text-sm">{wa?.provider?.toUpperCase()||"Não vinculado"}</strong></div>
          <div className="rounded-xl bg-[#f7f9f8] p-4"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#93a09d]">Sessão</span><strong className="mt-2 block break-all text-sm">{wa?.session||"Não definida"}</strong></div>
          <div className="rounded-xl bg-[#f7f9f8] p-4"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#93a09d]">Número</span><strong className="mt-2 block text-sm">{wa?.phone||"Aguardando autenticação"}</strong></div>
        </div>
        {wa?.status==="connected"&&!state?.connectedVerified&&<p className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff6e9] px-4 py-3 text-xs text-[#977245]"><AlertCircle size={16}/> O registro do banco indica conectado, mas isso não confirma que a sessão WAHA esteja WORKING agora.</p>}
      </section>
      <section className="rounded-2xl border border-[#dee9e1] bg-white p-6 shadow-sm">
        <div className="mb-4"><h2 className="text-[15px] font-bold">Ativação assistida</h2><p className="mt-2 text-[12px] leading-5 text-[#81918a]">Registre a conexão, prepare a sessão do CRM e faça o pareamento por QR. O número só entra no sistema depois do escaneamento.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {!wa&&<button type="button" disabled={working||loading} onClick={()=>void prepare()} className="rounded-xl bg-[#255748] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50">1. Registrar canal da empresa</button>}
          {wa&&<button type="button" disabled={working||loading} onClick={()=>void startPairing()} className="rounded-xl bg-[#255748] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50">2. Preparar sessão WAHA</button>}
          {wa&&<button type="button" disabled={working||loading} onClick={()=>void fetchQr()} className="rounded-xl border border-[#cddfd4] bg-white px-4 py-3 text-xs font-semibold text-[#285743] disabled:opacity-50">3. Exibir ou atualizar QR</button>}
          {working&&<span role="status" className="text-xs text-[#76897e]">Consultando o provedor...</span>}
        </div>
        {notice&&<p role="status" className="mt-3 rounded-xl bg-[#eaf5ef] p-3 text-xs text-[#32674d]">{notice}</p>}
        {pairStatus&&<p className="mt-3 text-xs text-[#657c6d]">Status de pareamento: <strong>{pairStatus}</strong></p>}
        {qr&&<div className="mt-5 inline-flex flex-col items-center rounded-xl border border-[#e0e8e1] bg-white p-5">
          <Image unoptimized src={qr} width={240} height={240} alt="QR temporário para vincular o WhatsApp autorizado ao CRM" className="rounded-lg"/>
          <p className="mt-3 max-w-64 text-center text-[11px] leading-5 text-[#647a6c]">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho. Atualize o QR se expirar.</p>
        </div>}
        <p className="mt-4 text-[11px] text-[#80918a]">A instância WAHA deve ser dedicada ao CRM. Esta tela não reutiliza, reinicia ou desconecta a sessão do Argoplace.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-[#e1e8e6] bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><Server size={19} className="text-[#4e8870]"/><h2 className="text-[15px] font-semibold">Infraestrutura necessária</h2></div>
          <div className="space-y-2">{checks.map(item=><div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-[#edf0ed] px-4 py-3"><div><p className="text-xs font-semibold">{item.label}</p><code className="mt-1 block break-all text-[10px] text-[#9aa6a5]">{item.key}</code></div><span className={`flex shrink-0 items-center gap-1 text-[11px] font-semibold ${item.ok?"text-[#45886a]":"text-[#b18557]"}`}>{item.ok?<CheckCircle2 size={15}/>:<CircleDashed size={15}/>} {item.ok?"Definida":"Pendente"}</span></div>)}
          {loading&&!state&&<p className="text-xs text-[#8b999a]">Verificando variáveis do ambiente...</p>}</div>
          {state?.liveStatus&&<p className="mt-3 rounded-xl bg-[#f3f7f4] p-3 text-xs text-[#62836d]">Estado remoto WAHA: <strong>{state.liveStatus}</strong></p>}
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#81908a]"><ShieldCheck size={17} className="shrink-0 text-[#648a73]"/> Chaves e senhas permanecem exclusivamente no servidor; esta tela mostra apenas se estão presentes.</p>
        </section>
        <section className="rounded-2xl border border-[#e1e8e6] bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><Link2 size={19} className="text-[#4e8870]"/><h2 className="text-[15px] font-semibold">Etapas para ativar</h2></div>
          <ol className="space-y-5">
            {[
              {title:"Preparar instância WAHA",detail:"Usar uma instância autorizada para o CRM, sem substituir a sessão do Argoplace.",done:allConfigured},
              {title:"Vincular a empresa",detail:"Cadastrar o canal WhatsApp no tenant correto e definir uma sessão exclusiva.",done:Boolean(wa?.session)},
              {title:"Parear o telefone",detail:"Escanear o QR oficial do WAHA com o aparelho que usará este CRM.",done:state?.connectedVerified===true},
              {title:"Validar recebimento",detail:"Confirmar webhook e uma mensagem de teste com consentimento, antes de liberar respostas.",done:false},
            ].map((step,i)=><li className="flex gap-3" key={step.title}><span className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${step.done?"bg-[#e0f3e9] text-[#327d59]":"bg-[#eef1ef] text-[#8a9b90]"}`}>{step.done?<CheckCircle2 size={16}/>:i+1}</span><div><h3 className="text-xs font-semibold">{step.title}</h3><p className="mt-1 text-[11px] leading-5 text-[#83938e]">{step.detail}</p></div></li>)}
          </ol>
          <p className="mt-5 rounded-xl bg-[#f3f6f3] p-3 text-xs leading-5 text-[#6a7e70]">{reached?"Credenciais e sessão cadastradas. Ainda falta verificar o status WAHA ao vivo e o pareamento.":"Configuração incompleta. O QR e o envio ficam bloqueados até a integração ser autorizada e testada."}</p>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e1e8e6] bg-white px-6 py-5"><div className="flex items-center gap-3"><WifiOff size={21} className="text-[#9a7545]"/><div><strong className="text-[12px]">Nenhuma mensagem será enviada por esta tela.</strong><p className="mt-1 text-[11px] text-[#879591]">Configuração e diagnóstico não ativam disparos automáticos.</p></div></div><a href="https://waha.devlike.pro/docs/how-to/sessions/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#477e63] hover:underline">Documentação WAHA <ExternalLink size={14}/></a></div>
    </div>
  </main>
}
