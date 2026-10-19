"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageCircle, Users, PlugZap } from "lucide-react"

const items=[
  {href:"/inbox",label:"Atendimento",icon:MessageCircle},
  {href:"/crm",label:"Relacionamento",icon:Users},
  {href:"/settings/whatsapp",label:"WhatsApp",icon:PlugZap},
] as const

/** Shared shell for the REAL CRM modules. Other prototype screens remain unlinked. */
export default function WorkspaceNavigation({children}:{children?:ReactNode}){
  const pathname=usePathname()
  return <header className="shrink-0 border-b border-[#e3e9e6] bg-white">
    <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
      <Link href="/inbox" aria-label="CRM, início" className="mr-2 flex shrink-0 items-center gap-2 text-[#203e34]">
        <span className="grid size-9 place-items-center rounded-xl bg-[#183a36] text-white"><MessageCircle size={19}/></span>
        <strong className="text-sm tracking-tight">CRM</strong>
      </Link>
      <nav className="order-3 flex w-full gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0" aria-label="Navegação principal do CRM">
        {items.map(({href,label,icon:Icon})=>{
          const active=pathname===href||pathname.startsWith(href+"/")
          return <Link key={href} href={href} aria-current={active?"page":undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition ${active?"bg-[#e8f2ec] text-[#226348]":"text-[#71827b] hover:bg-[#f2f6f3] hover:text-[#345d48]"}`}>
            <Icon size={15}/>{label}
          </Link>
        })}
      </nav>
      {children&&<div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">{children}</div>}
    </div>
  </header>
}
