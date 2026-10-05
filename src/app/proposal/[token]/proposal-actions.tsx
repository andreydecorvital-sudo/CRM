"use client"

import { useState } from "react"

export default function ProposalActions({
  token,
  status,
  canAccept,
}: {
  token: string
  status: string
  canAccept: boolean
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    status === "accepted" ? "done" : "idle",
  )
  const [error, setError] = useState("")

  async function accept(event: React.FormEvent) {
    event.preventDefault()
    setState("sending")
    setError("")
    const response = await fetch("/api/proposals/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, email }),
    })
    const data = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) {
      setError(data.error || "Não foi possível aceitar.")
      setState("error")
      return
    }
    setState("done")
  }

  if (state === "done") {
    return <div className="mt-7 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-5 text-sm text-emerald-100"><strong>Proposta aceita.</strong><p className="mt-1 text-emerald-100/70">A empresa foi notificada e seguirá com os próximos passos.</p></div>
  }

  if (!canAccept) {
    return <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/55">Status da proposta: <strong className="text-white">{status}</strong>.</div>
  }

  return (
    <form onSubmit={accept} className="mt-7 rounded-2xl border border-violet-400/15 bg-violet-500/5 p-5">
      <h2 className="font-semibold">Aceitar proposta</h2>
      <p className="mt-1 text-xs text-white/45">Confirme seu nome. E-mail é opcional.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={event => setName(event.target.value)} required maxLength={160} placeholder="Seu nome" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-violet-400/40" />
        <input value={email} onChange={event => setEmail(event.target.value)} type="email" maxLength={240} placeholder="E-mail (opcional)" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-violet-400/40" />
      </div>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      <button disabled={state === "sending"} className="mt-4 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold disabled:opacity-50">{state === "sending" ? "Confirmando..." : "Aceitar proposta"}</button>
    </form>
  )
}
