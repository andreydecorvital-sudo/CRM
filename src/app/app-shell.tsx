"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { ArrowUpRight, BarChart3, BriefcaseBusiness, CircleHelp, ContactRound, FileText, Globe2, Inbox, LayoutGrid, ListTodo, Menu, PlugZap, Settings2, ShieldCheck, Sparkles, Star, UsersRound, Workflow, X } from "lucide-react"

const nav = [
  {title:"Trabalho",links:[{href:"/inbox",label:"Atendimento",icon:Inbox},{href:"/crm",label:"Oportunidades",icon:LayoutGrid},{href:"/tasks",label:"Minhas tarefas",icon:ListTodo},{href:"/proposals",label:"Propostas",icon:FileText}]},
  {title:"Relacionamento",links:[{href:"/customers",label:"Clientes",icon:ContactRound},{href:"/reviews",label:"Avaliações",icon:Star},{href:"/sources",label:"Origem dos leads",icon:BarChart3}]},
  {title:"Configurações",links:[{href:"/departments",label:"Equipes e filas",icon:UsersRound},{href:"/automations",label:"Automações",icon:Workflow},{href:"/integrations",label:"Integrações",icon:Globe2},{href:"/settings/whatsapp",label:"WhatsApp",icon:PlugZap}]},
]

export default function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname()
  const [menuOpen,setMenuOpen]=useState(false)
  const publicSurface=pathname.startsWith("/review/")||pathname.startsWith("/proposal/")
  if (publicSurface) return <div className="min-h-screen bg-[#101719] text-white"><header className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-6 text-sm font-semibold"><span className="grid size-8 place-items-center rounded-xl bg-[#b7e4d1] text-[#164331]"><Sparkles size={16}/></span> CRM <span className="font-normal text-white/40">/ Área segura</span></header><main className="px-5 pb-10">{children}</main></div>
  return <div className="min-h-screen bg-[#101719] text-[#f1f5f2] lg:grid lg:grid-cols-[246px_minmax(0,1fr)]" style={{fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}}>
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-[#101719] px-4 py-3 lg:hidden">
      <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-xl bg-[#b7e4d1] font-black text-[#153b30]">C</span> CRM</Link>
      <button type="button" aria-label={menuOpen?"Fechar menu":"Abrir menu"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)} className="rounded-xl border border-white/15 p-2 text-white/80">{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>
    </div>
    <aside className={`${menuOpen?"block":"hidden"} z-30 flex-col border-b border-white/10 bg-[#101719] lg:sticky lg:top-0 lg:flex lg:h-screen lg:border-b-0 lg:border-r lg:border-white/10`}>
      <Link href="/" className="hidden items-center gap-3 px-6 pb-6 pt-7 lg:flex"><span className="grid size-10 place-items-center rounded-[14px] bg-[#b7e4d1] text-xl font-black text-[#153b30]">C</span><span><strong className="block text-[15px]">CRM</strong><small className="block text-[11px] text-white/40">Workspace comercial</small></span></Link>
      <div className="mx-4 mb-5 hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 lg:flex">
        <span className="grid size-9 place-items-center rounded-xl bg-[#253a34] text-sm font-bold text-[#c6e8da]">W</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">Workspace</span><span className="block truncate text-[11px] text-white/40">Ambiente de preparação</span></span><Settings2 size={15} className="text-white/40"/>
      </div>
      <nav aria-label="Navegação principal" className="max-h-[65vh] space-y-5 overflow-y-auto px-3 pb-4 lg:max-h-none lg:flex-1">
        {nav.map(group=><div key={group.title}><p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{group.title}</p><div className="space-y-0.5">{group.links.map(({href,label,icon:Icon})=>{
          const active=pathname===href||pathname.startsWith(href+"/")
          return <Link key={href} href={href} aria-current={active?"page":undefined} onClick={()=>setMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-[#b7e4d1] ${active?"bg-[#25352f] text-[#d2f3e5]":"text-white/55 hover:bg-white/[0.06] hover:text-white"}`}><Icon size={17} strokeWidth={active?2.3:1.8}/>{label}{active&&<span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-[#a7dec8]"/>}</Link>
        })}</div></div>)}
      </nav>
      <div className="border-t border-white/10 px-4 py-4"><div className="flex gap-2.5 rounded-xl bg-white/[0.035] p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#a7dec8]"/><div><p className="text-xs font-semibold">Implantação controlada</p><p className="mt-1 text-[11px] leading-4 text-white/45">Sem envio automático na prévia.</p></div></div><Link href="/integrations" className="mt-3 flex items-center justify-between px-2 text-xs text-white/50 hover:text-white">Configurar conexões <ArrowUpRight size={14}/></Link></div>
    </aside>
    <div className="min-w-0">
      <header className="hidden h-[67px] items-center justify-between border-b border-white/10 px-8 lg:flex"><div className="flex items-center gap-2 text-xs text-white/45"><BriefcaseBusiness size={14}/> Workspace <span className="text-white/20">/</span><span className="font-medium text-white/75">{nav.flatMap(g=>g.links).find(x=>pathname===x.href)?.label||"Visão geral"}</span></div><div className="flex items-center gap-5 text-xs text-white/55"><span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#b7e4d1]"/> Design em revisão</span><Link href="/integrations" className="inline-flex items-center gap-1.5 hover:text-white"><CircleHelp size={14}/> Integrações</Link></div></header>
      <main className={`min-w-0 ${pathname==="/inbox"?"p-3 sm:p-5 lg:p-6":"p-5 md:p-8"}`}>{children}</main>
    </div>
  </div>
}