"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react"

export default function OperatorLogin() {
  const router=useRouter()
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault()
    setBusy(true);setError("")
    try{
      const response=await fetch("/api/operator/session",{
        method:"POST",headers:{"Content-Type":"application/json"},
        credentials:"same-origin",cache:"no-store",body:JSON.stringify({email,password}),
      })
      if(!response.ok){setError(response.status===503?"A autenticação do piloto ainda não foi configurada.":"E-mail ou senha inválidos, ou usuário sem acesso a esta empresa.");return}
      setPassword("")
      router.refresh()
    }catch{setError("Não foi possível conectar ao servidor de autenticação.")}
    finally{setBusy(false)}
  }
  return <div className="min-h-screen bg-[#f6f7f9] font-sans text-[#1c2937]">
    <header className="border-b border-[#e5e8eb] bg-white px-6 py-5"><div className="mx-auto flex max-w-6xl items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#183a36] text-white"><MessageCircle size={20}/></span><strong className="text-[15px] tracking-tight">CRM <span className="font-normal text-[#9ba4af]">/ Atendimento</span></strong></div></header>
    <main className="mx-auto grid min-h-[78vh] max-w-6xl place-items-center px-4 py-12">
      <div className="w-full max-w-[430px] rounded-2xl border border-[#e6eaed] bg-white p-7 shadow-[0_22px_66px_rgba(24,41,55,.06)] sm:p-9">
        <span className="mb-6 grid size-12 place-items-center rounded-xl bg-[#eff6f1] text-[#2c7054]"><LockKeyhole size={23}/></span>
        <h1 className="text-2xl font-bold tracking-tight">Acessar atendimento</h1>
        <p className="mt-2 text-sm leading-6 text-[#71808b]">Entre com sua conta autorizada da empresa para consultar conversas e organizar os atendimentos.</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-[13px] font-semibold">E-mail<input autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" className="mt-2 block w-full rounded-xl border border-[#dce2e7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4b9774]" /></label>
          <label className="block text-[13px] font-semibold">Senha<input autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha" className="mt-2 block w-full rounded-xl border border-[#dce2e7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4b9774]" /></label>
          {error&&<p role="alert" className="rounded-xl bg-[#fff4f2] px-3 py-2.5 text-xs text-[#af4e3a]">{error}</p>}
          <button disabled={busy} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#183a36] px-4 py-3.5 text-[13px] font-semibold text-white transition hover:bg-[#2a5b51] disabled:opacity-60">{busy?"Verificando acesso...":"Entrar na central"}<ArrowRight size={17}/></button>
        </form>
        <p className="mt-6 flex items-start gap-2 border-t border-[#eff1f2] pt-5 text-[11px] leading-5 text-[#87939c]"><ShieldCheck size={17} className="shrink-0 text-[#508468]"/> Piloto interno: somente membros autorizados podem acessar dados da empresa.</p>
      </div>
    </main>
  </div>
}
