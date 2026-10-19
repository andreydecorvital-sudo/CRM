import OperatorInbox from "./operator-inbox"
import OperatorLogin from "./operator-login"
import { operatorFromCookie, pilotConfigured } from "@/lib/server/operator/session"
import { ShieldAlert } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function InboxPage() {
  if (!pilotConfigured()) {
    return <main className="grid min-h-screen place-items-center bg-[#f7f9fa] p-6 font-sans text-[#273a43]"><div className="w-full max-w-xl rounded-2xl border border-[#e4e9e8] bg-white p-8"><ShieldAlert size={30} className="mb-5 text-[#b77d40]"/><h1 className="text-xl font-bold">Atendimento interno ainda não configurado</h1><p className="mt-3 text-sm leading-6 text-[#75838b]">A estrutura de leitura do CRM está implementada, mas o operador só poderá acessar dados reais depois que o ambiente tiver autenticação e tenant definidos. Nenhuma informação de outra empresa será exibida por padrão.</p><p className="mt-5 rounded-lg bg-[#f1f4f3] p-3 text-xs leading-6 text-[#5d6f75]">Configurações exigidas no servidor: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY, CRM_OPERATOR_TENANT_ID e CRM_OPERATOR_SESSION_SECRET.</p></div></main>
  }
  const operator=await operatorFromCookie().catch(()=>null)
  if(!operator)return <OperatorLogin/>
  return <OperatorInbox operatorId={operator.userId} role={operator.role}/>
}
