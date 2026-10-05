"use client"

import Link from "next/link"
import { MessageSquareText, UsersRound, PlugZap, Sparkles, Repeat2, Star } from "lucide-react"
import { usePathname } from "next/navigation"

const nav = [
  { href: "/inbox", label: "Atendimento", icon: MessageSquareText },
  { href: "/crm", label: "CRM", icon: UsersRound },
  { href: "/customers", label: "Recorrência", icon: Repeat2 },
  { href: "/reviews", label: "Avaliações", icon: Star },
  { href: "/settings/whatsapp", label: "WhatsApp", icon: PlugZap },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const publicReview = pathname.startsWith("/review/")

  if (publicReview) {
    return (
      <div className="min-h-screen">
        <header className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-6 text-sm font-semibold text-white/75">
          <span className="grid size-8 place-items-center rounded-lg bg-violet-600"><Sparkles size={16} /></span>
          Atendimento
        </header>
        <main className="px-5 pb-10">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-white/10 bg-[#0c0f15] p-5 md:min-h-screen md:border-b-0 md:border-r">
        <Link href="/" className="mb-8 flex items-center gap-3 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-600"><Sparkles size={18} /></span>
          MIRA CRM
        </Link>
        <nav className="grid gap-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white/8 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={18} /> {label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="p-5 md:p-8">{children}</main>
    </div>
  )
}
