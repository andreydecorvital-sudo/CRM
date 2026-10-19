"use client"

import { usePathname } from "next/navigation"
import WorkspaceNavigation from "./workspace-navigation"

const liveRoutes=["/inbox","/crm","/settings/whatsapp"]
export default function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname()
  if(pathname==="/"||liveRoutes.some(x=>pathname===x||pathname.startsWith(x+"/")))
    return <main>{children}</main>
  if(pathname.startsWith("/review/")||pathname.startsWith("/proposal/"))
    return <main className="min-h-screen bg-[#090b10] text-[#f4f7fb]">{children}</main>

  // Older modules are preserved for ongoing development, but never advertised
  // alongside the real CRM as another usable "system".
  return <div className="min-h-screen bg-[#f5f7f8] font-sans text-[#20312a]">
    <WorkspaceNavigation/>
    <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-8">
      <p className="rounded-xl border border-[#eddfbe] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#916b35]" role="status">
        Módulo em evolução: esta tela é um protótipo e pode conter exemplos. Para dados reais, use Atendimento ou Relacionamento no menu principal.
      </p>
      <section className="min-h-[65vh] rounded-3xl bg-[#0d1017] p-4 text-white sm:p-7">{children}</section>
    </main>
  </div>
}
