"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, CheckCircle2, LogOut, ShieldCheck } from "lucide-react"

export default function OperatorWorkspaceSetup() {
  const router=useRouter()
  const [name,setName]=useState("")
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")

  async function create(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true);setError("")
    try {
      const res=await fetch("/api/operator/onboarding",{
        method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({workspaceName:name.trim()}),
      })
      if(!res.ok){
        const body=await res.json() as {error?:string}
        setError(body.error==="workspace_activation_unavailable"
          ?"A conta está autenticada, mas o banco do CRM ainda não liberou o cadastro de empresas. A configuração precisa ser ativada no Supabase."
          :"Não foi possível criar a empresa. Verifique o nome e tente novamente.")
        return
      }
      router.refresh()
    } catch {setError("Falha na comunicação com o CRM. Tente novamente.")}
    finally{setBusy(false)}
  }
  async function logout(){
    await fetch("/api/operator/session",{method:"DELETE",credentials:"same-origin"})
    router.refresh()
  }

  return <div className="min-h-screen bg-[#f6f7f9] text-[#24332d]">
    <header className="border-b border-[#e6ebe7] bg-white px-6 py-5"><div className="mx-auto flex max-w-5xl items-center justify-between"><strong className="flex items-center gap-2 text-sm"><span className="grid size-9 place-items-center rounded-xl bg-[#183a36] text-white"><Building2 size={18}/></span> CRM · Primeiros passos</strong><button type="button" onClick={()=>void logout()} className="flex items-center gap-2 text-xs text-[#819088]"><LogOut size={16}/> Sair</button></div></header>
    <main className="mx-auto grid min-h-[78vh] max-w-5xl place-items-center p-5">
      <div className="w-full max-w-[510px] rounded-2xl border border-[#e4ebe5] bg-white p-7 shadow-[0_22px_60px_rgba(0,0,0,.045)] sm:p-9">
        <span className="mb-5 grid size-12 place-items-center rounded-xl bg-[#e9f5ed] text-[#3c7d59]"><Building2 size={23}/></span>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#5b986f]">Etapa 2 de 2</p>
        <h1 className="text-2xl font-bold tracking-tight">Configure sua empresa</h1>
        <p className="mt-3 text-sm leading-6 text-[#788980]">Sua conta foi reconhecida. Agora falta apenas criar seu espaço de trabalho. Depois você poderá acessar a Inbox e preparar o WhatsApp.</p>
        <form className="mt-7 space-y-4" onSubmit={create}>
          <label className="block text-[13px] font-semibold">Nome da empresa
            <input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={100} required placeholder="Ex.: Minha empresa" className="mt-2 block w-full rounded-xl border border-[#dce7df] px-4 py-3 text-sm outline-none focus:border-[#4f946a]"/>
          </label>
          {error&&<p role="alert" className="rounded-xl bg-[#fff4f1] px-3 py-3 text-xs leading-5 text-[#a45f4b]">{error}</p>}
          <button type="submit" disabled={busy||name.trim().length<2} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#183a36] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60">{busy?"Configurando...":"Criar minha empresa"}<ArrowRight size={16}/></button>
        </form>
        <div className="mt-7 space-y-3 border-t border-[#edf1ef] pt-5 text-xs text-[#7b9081]"><p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#49946e]"/> Conta autenticada</p><p className="flex items-center gap-2"><ShieldCheck size={16} className="text-[#49946e]"/> Dados isolados por empresa</p><p className="text-[11px] leading-5">Nenhum WhatsApp será conectado ou usado automaticamente nesta etapa.</p></div>
      </div>
    </main>
  </div>
}
