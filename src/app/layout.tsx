import type { Metadata } from "next"
import Link from "next/link"
import { MessageSquareText, UsersRound, PlugZap, Sparkles } from "lucide-react"
import "./globals.css"

export const metadata: Metadata = {
  title: "MIRA CRM",
  description: "Atendimento automático + CRM multiempresa",
}

const nav = [
  { href: "/inbox", label: "Atendimento", icon: MessageSquareText },
  { href: "/crm", label: "CRM", icon: UsersRound },
  { href: "/settings/whatsapp", label: "WhatsApp", icon: PlugZap },
]

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
          <aside className="border-b border-white/10 bg-[#0c0f15] p-5 md:min-h-screen md:border-b-0 md:border-r">
            <Link href="/" className="mb-8 flex items-center gap-3 text-lg font-semibold">
              <span className="grid size-9 place-items-center rounded-xl bg-violet-600"><Sparkles size={18} /></span>
              MIRA CRM
            </Link>
            <nav className="grid gap-2">
              {nav.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/5 hover:text-white">
                  <Icon size={18} /> {label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="p-5 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  )
}
