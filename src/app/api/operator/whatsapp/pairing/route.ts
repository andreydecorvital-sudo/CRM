import { forbiddenResponse, operatorFromCookie, safeMutationOrigin } from "@/lib/server/operator/session"
import { getRemoteSession, wahaApi } from "@/lib/server/operator/whatsapp-setup"

export const dynamic="force-dynamic"
const noStore={"Cache-Control":"no-store, no-cache, max-age=0"}

export async function GET(){
  const operator=await operatorFromCookie()
  if(!operator)return forbiddenResponse()
  if(!["owner","admin"].includes(operator.role))return Response.json({error:"role_not_allowed"},{status:403})
  try{
    const {session}=await getRemoteSession(operator)
    const live=await wahaApi<{status?:string;me?:{id?:string}|null}>(`/api/sessions/${session}`)
    const status=String(live?.status||"UNKNOWN").toUpperCase()
    if(status!=="SCAN_QR_CODE"){
      return Response.json({connected:status==="WORKING",status,qr:null},{headers:noStore})
    }
    const result=await wahaApi<{mimetype?:string;data?:string}>(`/api/${session}/auth/qr?format=image`)
    if(result.mimetype!=="image/png"||typeof result.data!=="string"||result.data.length>150000
      ||!/^[a-zA-Z0-9+/=]+$/.test(result.data))throw new Error("waha_qr_invalid")
    return Response.json({
      status,connected:false,qr:`data:image/png;base64,${result.data}`
    },{headers:noStore})
  }catch(err){
    const name=err instanceof Error?err.message:"qr_unavailable"
    const status=["channel_not_registered","waha_session_not_found"].includes(name)?404:
      ["channel_not_isolated","waha_dedicated_instance_required"].includes(name)?409:503
    return Response.json({error:status===503?"qr_unavailable":name},{status,headers:noStore})
  }
}

export async function POST(request:Request){
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  const operator=await operatorFromCookie()
  if(!operator)return forbiddenResponse()
  if(!["owner","admin"].includes(operator.role))return Response.json({error:"role_not_allowed"},{status:403})
  const body=await request.json().catch(()=>null)
  if(body?.action!=="start"||body?.confirmed!==true)return Response.json({error:"confirmation_required"},{status:400})
  try{
    const {session}=await getRemoteSession(operator)
    const webhookSecret=process.env.WHATSAPP_WEBHOOK_SECRET?.trim()||""
    const appUrl=process.env.NEXT_PUBLIC_APP_URL?.trim()||""
    if(webhookSecret.length<32)throw new Error("webhook_not_configured")
    // Pairing without an enabled database-backed webhook would silently lose inbound messages.
    if(!process.env.SUPABASE_SECRET_KEY&&!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("inbound_backend_not_configured")
    let url:URL
    try{
      url=new URL(appUrl)
      if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search)throw new Error("invalid")
    }catch{throw new Error("webhook_url_invalid")}
    const webhook=`${url.origin}/api/webhooks/whatsapp/waha?tenant=${operator.tenantId}`
    let live:{status?:string;config?:Record<string,unknown>}|null=null
    try{live=await wahaApi(`/api/sessions/${session}`)}
    catch(err){if(!(err instanceof Error)||err.message!=="waha_session_not_found")throw err}
    if(live){
      const existingTenant=live.config?.metadata&&typeof live.config.metadata==="object"
        ? (live.config.metadata as Record<string,unknown>)["crm.tenant_id"] : null
      // Never take over an existing session if tenant ownership cannot be proven.
      if(existingTenant!==operator.tenantId)throw new Error("session_ownership_unknown")
      // Starting an OWNED, STOPPED session is safe; never stop/restart/log out an active session.
      const status=String(live.status||"UNKNOWN").toUpperCase()
      if(status==="STOPPED"){
        const started=await wahaApi<{status?:string}>(`/api/sessions/${session}/start`,"POST")
        return Response.json({ok:true,status:started.status||"STARTING",alreadyExists:true},{headers:noStore})
      }
      return Response.json({ok:true,status,alreadyExists:true},{headers:noStore})
    }
    // A new, tenant-derived session can be created only on the dedicated CRM provider.
    // This never alters another company session or calls stop/restart/logout.
    const created=await wahaApi<{status?:string}>(`/api/sessions`,"POST",{
      name:session,config:{
        metadata:{"crm.tenant_id":operator.tenantId},
        ignore:{status:true,groups:true,channels:true,broadcast:true},
        webhooks:[{
          url:webhook,events:["message","session.status"],
          customHeaders:[{name:"x-crm-webhook-secret",value:webhookSecret}],
          retries:{policy:"constant",delaySeconds:2,attempts:10},
        }],
      },
    })
    // WAHA session creation alone does not guarantee a QR. Start the new
    // tenant-scoped session so that the status can transition to SCAN_QR_CODE.
    const started=await wahaApi<{status?:string}>(`/api/sessions/${session}/start`,"POST")
    return Response.json({ok:true,status:started.status||created.status||"STARTING",alreadyExists:false},{headers:noStore})
  }catch(err){
    const name=err instanceof Error?err.message:"session_setup_unavailable"
    const status=["session_ownership_unknown","channel_not_isolated","waha_dedicated_instance_required"].includes(name)?409:
      name==="channel_not_registered"?404:503
    return Response.json({error:status===503?"session_setup_unavailable":name},{status,headers:noStore})
  }
}
