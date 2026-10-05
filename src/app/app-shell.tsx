"use client"

import Link from "next/link"
import {
  BarChart3,
  BriefcaseBusiness,
  ListTodo,
  MessageSquareText,
  PlugZap,
  Repeat2,
  Sparkles,
  Star,
  UsersRound,
  Workflow,
} from "lucide-react"
import { usePathname } from "next/navigation"

const nav = [
  { href: "/inbox", label: "Atendimento", icon: MessageSquareText },
  { href: "/crm", label: "CRM", icon: UsersRound },
  { href: "/tasks", label: "Tarefas", icon: ListTodo },
  { href: "/proposals", label: "Propostas", icon: BriefcaseBusiness },
  { href: "/customers", label: "Recorrência", icon: Repeat2 },
  { href: "/reviews", label: "Avaliações", icon: Star },
  { href: "/sources", label: "Origens", icon: BarChart3 },
  { href: "/departments", label: "Equipes & Filas", icon: Workflow },
  { href: "/settings/whatsapp", label: "WhatsApp", icon: PlugZap },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const publicSurface = pathname.startsWith("/review/") || pathname.startsWith("/proposal/")

  if (publicSurface) {
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
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-white/10 bg-[#0c0f15] p-5 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <Link href="/" className="mb-7 flex items-center gap-3 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-600"><Sparkles size={18} /></span>
          MIRA CRM
        </Link>
        <nav className="grid gap-1.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white/8 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon size={17} /> {label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-7 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/30">Modo MIRA</p>
          <div className="mt-2 flex items-center justify-between"><strong className="text-sm">Assistido</strong><span className="size-2 rounded-full bg-emerald-400" /></div>
          <p className="mt-2 text-xs leading-5 text-white/40">Automação executa apenas regras liberadas por tenant.</p>
        </div>
      </aside>
      <main className="p-5 md:p-8">{children}</main>
    </div>
  )
}
