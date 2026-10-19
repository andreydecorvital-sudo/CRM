import { operatorRest } from "./auth-rest"
import type { Operator } from "./session"

export type Channel = {id:string;provider:string;status:string;config:Record<string,unknown>|null;phone_e164:string|null}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function crmWahaSession(tenantId:string) {
  if(!uuid.test(tenantId))throw new Error("invalid_tenant")
  return `crm_${tenantId.replace(/-/g,"").toLowerCase()}`
}
export async function channelFor(operator:Operator):Promise<Channel|null> {
  const data=await operatorRest<Channel[]>(operator.accessToken,"GET",
    `/whatsapp_connections?tenant_id=eq.${operator.tenantId}&provider=eq.waha&select=id,provider,status,config,phone_e164&limit=1`)
  return data?.[0]||null
}
export function validateChannelSession(operator:Operator, channel:Channel) {
  if(channel.provider!=="waha" || channel.config?.session!==crmWahaSession(operator.tenantId)){
    throw new Error("channel_not_isolated")
  }
}
export async function registerOwnWahaChannel(operator:Operator) {
  if(!["owner","admin"].includes(operator.role))throw new Error("role_not_allowed")
  const existing=await channelFor(operator)
  if(existing){validateChannelSession(operator,existing);return {alreadyExists:true,session:existing.config?.session}}
  const session=crmWahaSession(operator.tenantId)
  try{
    await operatorRest(operator.accessToken,"POST","/whatsapp_connections",[
      {tenant_id:operator.tenantId,provider:"waha",status:"disconnected",config:{session}}
    ])
  }catch(error){
    // A concurrent request may have inserted the same tenant/provider.
    // Verify instead of blindly retrying and risking a second association.
    const after=await channelFor(operator)
    if(!after)throw error
    validateChannelSession(operator,after)
    return {alreadyExists:true,session}
  }
  const persisted=await channelFor(operator)
  if(!persisted)throw new Error("connection_write_not_verified")
  validateChannelSession(operator,persisted)
  return {alreadyExists:false,session}
}
export function wahaDedicatedConfig(){
  const raw=process.env.WAHA_BASE_URL?.trim().replace(/\/+$/,"")||""
  const key=process.env.WAHA_API_KEY?.trim()||""
  if(!raw||!key)throw new Error("waha_env_missing")
  const url=new URL(raw)
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||
    url.hostname==="localhost"||url.hostname.endsWith(".internal")||url.hostname.includes("argoplace-waha"))
    throw new Error("waha_dedicated_instance_required")
  // Opt-in protects the already-running Argoplace provider from accidental mutation.
  if(process.env.CRM_WAHA_DEDICATED_INSTANCE!=="true")throw new Error("waha_dedicated_instance_required")
  return {base:url.origin,key}
}
export async function wahaApi<T>(path:string, method:"GET"|"POST"="GET",body?:unknown):Promise<T>{
  const {base,key}=wahaDedicatedConfig()
  const r=await fetch(base+path,{
    method,cache:"no-store",signal:AbortSignal.timeout(12000),
    headers:{"X-Api-Key":key,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
  })
  if(r.status===404)throw new Error("waha_session_not_found")
  if(!r.ok)throw new Error("waha_provider_unavailable")
  return await r.json() as T
}
export async function getRemoteSession(operator:Operator){
  const connection=await channelFor(operator)
  if(!connection)throw new Error("channel_not_registered")
  validateChannelSession(operator,connection)
  return {session:crmWahaSession(operator.tenantId),connection}
}
