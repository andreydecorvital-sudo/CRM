import { operatorRest } from "@/lib/server/operator/auth-rest"
import { operatorFromCookie, forbiddenResponse, safeMutationOrigin } from "@/lib/server/operator/session"
import { registerOwnWahaChannel } from "@/lib/server/operator/whatsapp-setup"

export const dynamic = "force-dynamic"
type ConnectionRow = {
  provider: "waha"|"meta"|"bsp"
  status: string
  phone_e164: string|null
  config: Record<string,unknown>|null
}
function configured(key:string){return Boolean(process.env[key]?.trim())}

// Read-only probe. Does not create, start, stop or reconfigure WhatsApp sessions.
async function liveSessionStatus(session:string):Promise<string|null> {
  const base=process.env.WAHA_BASE_URL?.trim().replace(new RegExp("/+$"),"")||""
  const key=process.env.WAHA_API_KEY?.trim()||""
  if(!base||!key||!/^[a-zA-Z0-9_-]{1,80}$/.test(session))return null
  let url:URL
  try {
    url=new URL(base)
    if(url.protocol!=="https:" || url.username || url.password)return null
  }catch{return null}
  try{
    const res=await fetch(`${base}/api/sessions/${encodeURIComponent(session)}`,{
      headers:{"X-Api-Key":key,Accept:"application/json"},
      cache:"no-store",signal:AbortSignal.timeout(7000),
    })
    if(!res.ok)return null
    const data=await res.json() as {status?:unknown}
    return typeof data.status==="string"?data.status.toUpperCase():null
  }catch{return null}
}

export async function GET() {
  const operator=await operatorFromCookie()
  if(!operator)return forbiddenResponse()
  if(!["owner","admin","manager"].includes(operator.role))return Response.json({error:"forbidden"},{status:403})
  // Only server-side configuration names/states are exposed; never reveal API keys.
  const checks=[
    {key:"WAHA_BASE_URL",label:"Endereço privado do WAHA",ok:configured("WAHA_BASE_URL")},
    {key:"WAHA_API_KEY",label:"Chave de acesso ao WAHA",ok:configured("WAHA_API_KEY")},
    {key:"CRM_WAHA_DEDICATED_INSTANCE",label:"Instância exclusiva confirmada",ok:process.env.CRM_WAHA_DEDICATED_INSTANCE==="true"},
    {key:"WHATSAPP_WEBHOOK_SECRET",label:"Assinatura do webhook",ok:configured("WHATSAPP_WEBHOOK_SECRET")},
    {key:"SUPABASE_SECRET_KEY",label:"Acesso seguro ao banco (somente servidor)",ok:configured("SUPABASE_SECRET_KEY")||configured("SUPABASE_SERVICE_ROLE_KEY")},
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
    const liveStatus=waha?.session?await liveSessionStatus(waha.session):null
    return Response.json({
      tenantConfigured:true,providers,checks,readyForPairing,liveStatus,
      connectedVerified:liveStatus==="WORKING",
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

export async function POST(request:Request){
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  const operator=await operatorFromCookie()
  if(!operator)return forbiddenResponse()
  if(!["owner","admin"].includes(operator.role))return Response.json({error:"role_not_allowed"},{status:403})
  const payload=await request.json().catch(()=>null)
  if(payload?.action!=="prepare")return Response.json({error:"unknown_action"},{status:400})
  try{
    const result=await registerOwnWahaChannel(operator)
    return Response.json({ok:true,...result},{status:result.alreadyExists?200:201,headers:{"Cache-Control":"no-store"}})
  }catch(err){
    const name=err instanceof Error?err.message:"connection_failed"
    const status=name==="channel_not_isolated"?409:name==="operator_access_denied"?403:503
    return Response.json({error:status===503?"channel_registration_unavailable":name},{status})
  }
}
