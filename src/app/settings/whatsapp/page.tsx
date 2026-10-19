import Link from "next/link"
import OperatorLogin from "@/app/inbox/operator-login"
import OperatorWorkspaceSetup from "@/app/inbox/operator-workspace-setup"
import { authenticatedIdentity, operatorFromCookie, pilotConfigured } from "@/lib/server/operator/session"
import WhatsappSetup from "./whatsapp-setup"

export const dynamic = "force-dynamic"

export default async function WhatsappSettingsPage(){
  if(!pilotConfigured())return <main className="grid min-h-screen place-items-center bg-[#f5f7f7] px-5 text-[#293a37]"><div className="max-w-xl rounded-2xl border border-[#dee7e2] bg-white p-8"><h1 className="text-xl font-bold">Autenticação do CRM indisponível</h1><p className="mt-3 text-sm leading-6 text-[#74877e]">Configure a URL e a chave pública do projeto Supabase do CRM antes de acessar as conexões WhatsApp.</p><Link href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#347e5c]">Voltar ao atendimento</Link></div></main>
  const operator=await operatorFromCookie().catch(()=>null)
  if(!operator)return (await authenticatedIdentity())?<OperatorWorkspaceSetup/>:<OperatorLogin/>
  if(!["owner","admin","manager"].includes(operator.role))
    return <main className="grid min-h-screen place-items-center bg-[#f5f7f7] px-5 text-[#293a37]"><div className="max-w-lg rounded-2xl border border-[#dee7e2] bg-white p-8"><h1 className="text-xl font-bold">Acesso restrito</h1><p className="mt-3 text-sm leading-6 text-[#74877e]">Somente administradores e gestores da empresa podem consultar a configuração do WhatsApp.</p><Link href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#347e5c]">Voltar ao atendimento</Link></div></main>
  return <WhatsappSetup/>
}
