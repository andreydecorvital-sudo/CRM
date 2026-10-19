import { operatorRest } from "@/lib/server/operator/auth-rest"
import { operatorFromCookie, forbiddenResponse } from "@/lib/server/operator/session"

export const dynamic = "force-dynamic"
type ConnectionRow = {
  provider: "waha"|"meta"|"bsp"
  status: string
  phone_e164: string|null
  config: Record<string,unknown>|null
}
function configured(key:string){return Boolean(process.env[key]?.trim())}

export async function GET() {
  const operator=await operatorFromCookie()
  if(!operator)return forbiddenResponse()
  if(!["owner","admin","manager"].includes(operator.role))return Response.json({error:"forbidden"},{status:403})
  // Only server-side configuration names/states are exposed; never reveal API keys.
  const checks=[
    {key:"WAHA_BASE_URL",label:"Endereço privado do WAHA",ok:configured("WAHA_BASE_URL")},
    {key:"WAHA_API_KEY",label:"Chave de acesso ao WAHA",ok:configured("WAHA_API_KEY")},
    {key:"WHATSAPP_WEBHOOK_SECRET",label:"Assinatura do webhook",ok:configured("WHATSAPP_WEBHOOK_SECRET")},
    {key:"SUPABASE_SERVICE_ROLE_KEY",label:"Acesso do worker ao banco (somente servidor)",ok:configured("SUPABASE_SERVICE_ROLE_KEY")},
    {key:"NEXT_PUBLIC_APP_URL",label:"Endereço HTTPS público do CRM",ok:configured("NEXT_PUBLIC_APP_URL")},
  ]
  try{
    const records=await operatorRest<ConnectionRow[]>(
      operator.accessToken,"GET",
      `/whatsapp_connections?tenant_id=eq.${operator.tenantId}&select=provider,status,phone_e164,config&limit=10`,
    )
    const providers=(records||[]).map(connection=>({
      provider:connection.provider,
      status:connection.status,
      phone:connection.phone_e164||null,
      session:typeof connection.config?.session==="string"?connection.config.session:null,
    }))
    const waha=providers.find(c=>c.provider==="waha")
    const readyForPairing=checks.every(c=>c.ok)&&Boolean(waha?.session)
    return Response.json({
      tenantConfigured:true,providers,checks,readyForPairing,
      connectedVerified:false,
      nextStep:!waha?"register_connection":!checks.every(c=>c.ok)?"configure_server":"verify_session",
      note:"Status salvo no banco não equivale a sessão WORKING. Pareamento e recebimento de mensagem ainda precisam de teste.",
    },{headers:{"Cache-Control":"no-store"}})
  }catch{
    return Response.json({
      error:"whatsapp_diagnostics_unavailable",
      checks,providers:[],readyForPairing:false,connectedVerified:false,
    },{status:503,headers:{"Cache-Control":"no-store"}})
  }
}
