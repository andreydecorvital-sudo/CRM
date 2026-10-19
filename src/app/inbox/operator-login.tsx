"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, LockKeyhole, MessageCircle, ShieldCheck, UserPlus } from "lucide-react"

type Mode="create"|"login"
export default function OperatorLogin() {
  const router=useRouter()
  const [mode,setMode]=useState<Mode>("create")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")

  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true);setError("");setNotice("")
    try {
      const res=await fetch(mode==="create"?"/api/operator/onboarding":"/api/operator/session",{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
        cache:"no-store",body:JSON.stringify({email,password}),
      })
      const data=await res.json() as {ok?:boolean;error?:string}
      if(!res.ok) {
        setError(mode==="create"
          ?"Não foi possível criar a conta. Verifique o e-mail ou tente novamente. O serviço de cadastro pode não estar habilitado."
          :res.status===503?"Não foi possível acessar a autenticação.":"E-mail ou senha inválidos, ou e-mail ainda não confirmado.")
        return
      }
      if(mode==="create") {
        setPassword("")
        setMode("login")
        setNotice("Cadastro solicitado! Confirme seu e-mail se receber uma mensagem de verificação. Depois entre com a senha que você criou.")
      } else {
        setPassword("")
        router.refresh()
      }
    } catch {
      setError("Não conseguimos acessar o servidor de autenticação. Tente novamente.")
    } finally {setBusy(false)}
  }

  const create=mode==="create"
  function switchMode(next:Mode){setMode(next);setError("");setNotice("");setPassword("")}
  return <div className="min-h-screen bg-[#f6f7f9] font-sans text-[#1c2937]">
    <header className="border-b border-[#e5e8eb] bg-white px-6 py-5">
      <div className="mx-auto flex max-w-6xl items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#183a36] text-white"><MessageCircle size={20}/></span><strong className="text-[15px] tracking-tight">CRM <span className="font-normal text-[#9ba4af]">/ Primeiro acesso</span></strong></div>
    </header>
    <main className="mx-auto grid min-h-[78vh] max-w-6xl place-items-center px-4 py-12">
      <div className="w-full max-w-[455px] rounded-2xl border border-[#e6eaed] bg-white p-7 shadow-[0_22px_66px_rgba(24,41,55,.06)] sm:p-9">
        <span className="mb-5 grid size-12 place-items-center rounded-xl bg-[#eff6f1] text-[#2c7054]">{create?<UserPlus size={23}/>:<LockKeyhole size={23}/>}</span>
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-[#f0f3f2] p-1" role="group" aria-label="Tipo de acesso">
          <button type="button" onClick={()=>switchMode("create")} aria-pressed={create} className={`rounded-lg px-3 py-2.5 text-xs font-semibold ${create?"bg-white text-[#244c3d] shadow-sm":"text-[#7d8985]"}`}>Criar minha conta</button>
          <button type="button" onClick={()=>switchMode("login")} aria-pressed={!create} className={`rounded-lg px-3 py-2.5 text-xs font-semibold ${!create?"bg-white text-[#244c3d] shadow-sm":"text-[#7d8985]"}`}>Já tenho conta</button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{create?"Comece pelo cadastro":"Entrar no CRM"}</h1>
        <p className="mt-2 text-sm leading-6 text-[#71808b]">{create
          ?"Crie seu acesso. Depois você poderá cadastrar sua empresa e conectar os canais de atendimento."
          :"Use o e-mail e a senha que você criou no cadastro."}</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-[13px] font-semibold">E-mail
            <input autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" className="mt-2 block w-full rounded-xl border border-[#dce2e7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4b9774]"/>
          </label>
          <label className="block text-[13px] font-semibold">{create?"Crie uma senha":"Senha"}
            <input autoComplete={create?"new-password":"current-password"} type="password" minLength={create?12:undefined} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={create?"Pelo menos 12 caracteres":"Sua senha"} className="mt-2 block w-full rounded-xl border border-[#dce2e7] bg-white px-4 py-3 text-sm outline-none focus:border-[#4b9774]"/>
          </label>
          {error&&<p role="alert" className="rounded-xl bg-[#fff4f2] px-3 py-2.5 text-xs leading-5 text-[#af4e3a]">{error}</p>}
          {notice&&<p role="status" className="flex gap-2 rounded-xl bg-[#eff8f0] px-3 py-3 text-xs leading-5 text-[#427457]"><CheckCircle2 size={17} className="shrink-0"/>{notice}</p>}
          <button disabled={busy} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#183a36] px-4 py-3.5 text-[13px] font-semibold text-white transition hover:bg-[#2a5b51] disabled:opacity-60">
            {busy?"Verificando...":create?"Criar conta":"Entrar na central"}<ArrowRight size={17}/>
          </button>
        </form>
        <p className="mt-6 flex items-start gap-2 border-t border-[#eff1f2] pt-5 text-[11px] leading-5 text-[#87939c]"><ShieldCheck size={17} className="shrink-0 text-[#508468]"/> Cada empresa terá seus próprios dados e somente pessoas autorizadas poderão acessá-los.</p>
      </div>
    </main>
  </div>
}
