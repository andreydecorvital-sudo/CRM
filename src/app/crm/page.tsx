import Link from "next/link"
import { ArrowUpRight, ClipboardList, ContactRound, LayoutDashboard, ShieldAlert } from "lucide-react"
import WorkspaceNavigation from "../workspace-navigation"
import OperatorLogin from "../inbox/operator-login"
import OperatorWorkspaceSetup from "../inbox/operator-workspace-setup"
import { authenticatedIdentity, operatorFromCookie, pilotConfigured, type Operator } from "@/lib/server/operator/session"
import { operatorRest } from "@/lib/server/operator/auth-rest"

export const dynamic="force-dynamic"

type Pipeline={id:string;name:string;is_default:boolean}
type Stage={id:string;name:string;position:number}
type Deal={id:string;title:string;stage_id:string;contact_id:string;value_cents:number|string|null;updated_at:string|null}
type Contact={id:string;display_name:string;phone_e164:string|null;temperature:string;city:string|null}

async function loadWorkspace(operator:Operator){
  const tenant=operator.tenantId
  const token=operator.accessToken
  const [pipelines,contacts]=await Promise.all([
    operatorRest<Pipeline[]>(token,"GET",
      `/pipelines?tenant_id=eq.${tenant}&select=id,name,is_default&order=is_default.desc&limit=20`),
    operatorRest<Contact[]>(token,"GET",
      `/contacts?tenant_id=eq.${tenant}&select=id,display_name,phone_e164,temperature,city&order=last_seen_at.desc&limit=80`),
  ])
  const pipeline=pipelines.find(p=>p.is_default)??pipelines[0]??null
  if(!pipeline)return {pipeline:null,stages:[] as Stage[],deals:[] as Deal[],contacts}
  const [stages,deals]=await Promise.all([
    operatorRest<Stage[]>(token,"GET",
      `/pipeline_stages?pipeline_id=eq.${pipeline.id}&select=id,name,position&order=position.asc&limit=50`),
    operatorRest<Deal[]>(token,"GET",
      `/deals?tenant_id=eq.${tenant}&pipeline_id=eq.${pipeline.id}&select=id,title,stage_id,contact_id,value_cents,updated_at&order=updated_at.desc&limit=300`),
  ])
  return {pipeline,stages,deals,contacts}
}

function money(value:number|string|null) {
  if(value===null)return "Sem valor"
  const cents=Number(value)
  if(!Number.isFinite(cents)||cents<0)return "Sem valor"
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100)
}

export default async function CrmPage() {
  if(!pilotConfigured())return <main className="grid min-h-screen place-items-center bg-[#f5f7f8] p-6 text-[#263d34]"><div className="max-w-lg rounded-2xl border border-[#e0e9e3] bg-white p-7"><ShieldAlert size={25}/><h1 className="mt-4 text-xl font-bold">Acesso ao CRM indisponível</h1><p className="mt-2 text-sm text-[#788b7f]">A autenticação do Supabase precisa estar configurada.</p></div></main>
  const operator=await operatorFromCookie()
  if(!operator)return (await authenticatedIdentity())?<OperatorWorkspaceSetup/>:<OperatorLogin/>

  let data:Awaited<ReturnType<typeof loadWorkspace>>|null=null
  try{data=await loadWorkspace(operator)}catch{data=null}
  const names=new Map((data?.contacts??[]).map(c=>[c.id,c.display_name]))
  return <div className="min-h-screen bg-[#f5f7f8] font-sans text-[#20312a]">
    <WorkspaceNavigation/>
    <main className="mx-auto max-w-[1600px] space-y-7 px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.15em] text-[#559372]">Central de trabalho</p>
          <h1 className="text-3xl font-bold tracking-tight">Relacionamento</h1>
          <p className="mt-2 text-sm text-[#809088]">Contatos e oportunidades reais da mesma empresa e do mesmo login da Inbox.</p>
        </div>
        <Link href="/inbox" className="inline-flex items-center gap-2 rounded-xl border border-[#d5e4d9] bg-white px-4 py-3 text-xs font-semibold text-[#32664e]">Abrir atendimento <ArrowUpRight size={15}/></Link>
      </div>
      {!data?<section role="alert" className="rounded-2xl border border-[#ead9c7] bg-[#fffaf4] p-7 text-sm text-[#986d40]"><ShieldAlert size={21}/><h2 className="mt-3 font-semibold">Não foi possível carregar os dados reais</h2><p className="mt-2 text-xs leading-6">Confira o vínculo da empresa, as permissões do Supabase ou a disponibilidade do banco. Nenhum contato fictício será mostrado.</p></section>:<>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e2eae5] bg-white p-5"><div className="flex items-center gap-2 text-xs text-[#788b80]"><ContactRound size={17}/> Contatos consultados</div><strong className="mt-2 block text-2xl font-bold">{data.contacts.length}</strong><p className="mt-2 text-[11px] text-[#97a49a]">Até 80 contatos mais recentes</p></div>
          <div className="rounded-2xl border border-[#e2eae5] bg-white p-5"><div className="flex items-center gap-2 text-xs text-[#788b80]"><ClipboardList size={17}/> Oportunidades no funil</div><strong className="mt-2 block text-2xl font-bold">{data.deals.length}</strong><p className="mt-2 text-[11px] text-[#97a49a]">Até 300 oportunidades</p></div>
          <div className="rounded-2xl border border-[#e2eae5] bg-white p-5"><div className="flex items-center gap-2 text-xs text-[#788b80]"><LayoutDashboard size={17}/> Funil ativo</div><strong className="mt-2 block truncate text-lg font-bold">{data.pipeline?.name??"Ainda não configurado"}</strong><p className="mt-2 text-[11px] text-[#97a49a]">Somente dados da empresa atual</p></div>
        </div>
        <section className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Oportunidades</h2><span className="text-xs text-[#8b9b90]">Leitura real · sem amostras</span></div>
          {data.stages.length===0?<div className="rounded-2xl border border-[#e2eae5] bg-white p-8 text-sm text-[#73887b]">Esta empresa ainda não possui etapas de funil cadastradas. As oportunidades aparecerão aqui depois que o funil estiver configurado.</div>:
            <div className="flex gap-4 overflow-x-auto pb-4">
              {data.stages.map(stage=>{
                const stageDeals=data.deals.filter(d=>d.stage_id===stage.id)
                return <section key={stage.id} className="w-[270px] shrink-0 rounded-2xl border border-[#e0e9e3] bg-[#f0f4f0] p-3 sm:w-[300px]">
                  <div className="mb-3 flex items-center justify-between gap-2 px-2 py-1"><h3 className="truncate text-[13px] font-bold">{stage.name}</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs text-[#67806e]">{stageDeals.length}</span></div>
                  <div className="space-y-2">{stageDeals.length===0?<div className="rounded-xl border border-dashed border-[#d7e1d9] px-4 py-7 text-center text-xs text-[#9aaa9e]">Sem oportunidades</div>:
                    stageDeals.map(deal=><article key={deal.id} className="rounded-xl border border-[#e3eae4] bg-white px-4 py-4 shadow-sm"><strong className="block break-words text-sm">{deal.title}</strong><p className="mt-2 truncate text-xs text-[#87978b]">{names.get(deal.contact_id)||"Contato cadastrado"}</p><p className="mt-3 text-[12px] font-bold text-[#336950]">{money(deal.value_cents)}</p></article>)
                  }</div>
                </section>
              })}
            </div>}
        </section>
        <section className="rounded-2xl border border-[#e0e8e3] bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-lg font-bold">Contatos</h2><span className="text-xs text-[#8b9b90]">Registros mais recentes</span></div>
          {data.contacts.length===0?<div className="py-12 text-center text-sm text-[#8c9c93]">Nenhum contato registrado ainda. As conversas recebidas poderão formar sua base de contatos.</div>:
            <div className="mt-5 divide-y divide-[#edf1ee]">{data.contacts.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3.5"><div className="min-w-0"><strong className="block truncate text-[13px]">{c.display_name}</strong><p className="mt-1 text-xs text-[#8b9b91]">{[c.phone_e164,c.city].filter(Boolean).join(" · ")||"Sem detalhes adicionais"}</p></div><span className="rounded-full bg-[#eff4ef] px-3 py-1.5 text-[11px] text-[#60836b]">{c.temperature==="hot"?"Quente":c.temperature==="warm"?"Morno":c.temperature==="cold"?"Frio":"Não classificado"}</span></div>)}</div>}
        </section>
      </>}
    </main>
  </div>
}
