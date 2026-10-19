import OperatorInbox from "./operator-inbox"
import OperatorLogin from "./operator-login"
import OperatorWorkspaceSetup from "./operator-workspace-setup"
import { authenticatedIdentity, operatorFromCookie, pilotConfigured } from "@/lib/server/operator/session"
import { ShieldAlert } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function InboxPage() {
  if (!pilotConfigured()) {
    return <main className="grid min-h-screen place-items-center bg-[#f7f9fa] p-6 font-sans text-[#273a43]"><div className="w-full max-w-xl rounded-2xl border border-[#e4e9e8] bg-white p-8"><ShieldAlert size={30} className="mb-5 text-[#b77d40]"/><h1 className="text-xl font-bold">Atendimento interno ainda não configurado</h1><p className="mt-3 text-sm leading-6 text-[#75838b]">A estrutura de leitura do CRM está implementada, mas o operador só poderá acessar dados reais depois que o ambiente tiver autenticação e tenant definidos. Nenhuma informação de outra empresa será exibida por padrão.</p><p className="mt-5 rounded-lg bg-[#f1f4f3] p-3 text-xs leading-6 text-[#5d6f75]">Configuração pendente: URL e chave pública do Supabase Auth da empresa. Nenhuma senha padrão é necessária.</p></div></main>
  }
  const operator=await operatorFromCookie().catch(()=>null)
  if(!operator)return (await authenticatedIdentity())?<OperatorWorkspaceSetup/>:<OperatorLogin/>
  return <OperatorInbox operatorId={operator.userId}/>
}
