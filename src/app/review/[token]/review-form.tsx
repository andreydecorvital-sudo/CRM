"use client"

import { useState } from "react"

export default function ReviewForm({ token }: { token: string }) {
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [error, setError] = useState("")
  const [publicReviewUrl, setPublicReviewUrl] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (rating < 1) return setError("Escolha uma nota de 1 a 5.")
    setState("sending")
    setError("")
    const response = await fetch("/api/reviews/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, rating, feedback }),
    })
    const data = await response.json().catch(() => ({})) as { error?: string; publicReviewUrl?: string | null }
    if (!response.ok) {
      setError(data.error || "Não foi possível registrar sua avaliação.")
      setState("error")
      return
    }
    setPublicReviewUrl(data.publicReviewUrl || null)
    setState("done")
  }

  if (state === "done") {
    return (
      <div className="mt-7 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-5">
        <strong>Obrigado pela avaliação.</strong>
        <p className="mt-2 text-sm text-white/55">Seu feedback foi registrado.</p>
        {publicReviewUrl ? <a href={publicReviewUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium">Avaliar também publicamente</a> : null}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-7">
      <div className="flex gap-2" aria-label="Nota">
        {[1,2,3,4,5].map(value => (
          <button type="button" key={value} onClick={() => setRating(value)} className={`grid size-11 place-items-center rounded-xl border text-xl transition ${rating >= value ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/5"}`} aria-label={`${value} estrelas`}>★</button>
        ))}
      </div>
      <label className="mt-6 block text-sm text-white/60">Quer contar mais?</label>
      <textarea value={feedback} onChange={event => setFeedback(event.target.value)} maxLength={2000} rows={5} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm outline-none focus:border-violet-400/40" placeholder="Escreva seu comentário (opcional)" />
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      <button disabled={state === "sending"} className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold disabled:opacity-50">{state === "sending" ? "Enviando..." : "Enviar avaliação"}</button>
    </form>
  )
}
