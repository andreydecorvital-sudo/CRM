import ReviewForm from "./review-form"

export default async function PublicReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center">
      <section className="w-full rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-sm text-violet-300">Sua opinião importa</p>
        <h1 className="mt-2 text-3xl font-semibold">Como foi sua experiência?</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">Leva menos de um minuto. Sua resposta ajuda a empresa a melhorar o atendimento.</p>
        <ReviewForm token={token} />
      </section>
    </div>
  )
}
