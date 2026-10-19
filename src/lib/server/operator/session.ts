import { cookies } from "next/headers"
import { operatorAuthRequest, operatorRest, operatorSupabaseConfig } from "./auth-rest"

const COOKIE_TOKEN="crm_operator_token"
const COOKIE_TENANT="crm_operator_tenant"
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Role="owner"|"admin"|"manager"|"agent"|"viewer"
type Member={tenant_id:string;role:Role}
export type Operator={userId:string;tenantId:string;role:Role;accessToken:string}

export function pilotConfigured(){return Boolean(operatorSupabaseConfig())}
function cookieOptions(maxAge:number) {
  return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,
    path:"/",maxAge}
}
async function memberships(token:string,userId:string):Promise<Member[]>{
  const rows=await operatorRest<Member[]>(
    token,"GET",`/tenant_members?user_id=eq.${userId}&select=tenant_id,role&order=tenant_id.asc&limit=100`)
  return Array.isArray(rows)?rows.filter(m=>UUID.test(m.tenant_id)
    && ["owner","admin","manager","agent","viewer"].includes(m.role)):[]
}

async function verifiedUser(token:string):Promise<string|null> {
  if(!token || token.length>8192)return null
  const response=await operatorAuthRequest("/user",token)
  if(!response.ok)return null
  const user=await response.json() as {id?:string}
  return typeof user.id==="string"&&UUID.test(user.id)?user.id:null
}

export async function operatorFromCookie():Promise<Operator|null>{
  if(!pilotConfigured())return null
  const store=await cookies()
  const token=store.get(COOKIE_TOKEN)?.value||""
  if(!token)return null
  try{
    const userId=await verifiedUser(token)
    if(!userId)return null
    const memberList=await memberships(token,userId)
    const requested=store.get(COOKIE_TENANT)?.value
    // The tenant cookie is NOT an authorization grant; membership is checked again.
    const member=memberList.find(m=>m.tenant_id===requested)??memberList[0]
    if(!member)return null
    const tenants=await operatorRest<Array<{id:string;status:string}>>(token,"GET",
      `/tenants?id=eq.${member.tenant_id}&select=id,status&limit=1`)
    if(!tenants?.[0]||!["active","trial"].includes(tenants[0].status))return null
    return {userId,tenantId:member.tenant_id,role:member.role,accessToken:token}
  }catch{return null}
}

export async function signInOperator(email:string,password:string):Promise<boolean>{
  if(!pilotConfigured()||!email.includes("@")||email.length>320||!password||password.length>1024)return false
  const res=await operatorAuthRequest("/token?grant_type=password",undefined,{email,password})
  if(!res.ok)return false
  const result=await res.json() as {access_token?:string;expires_in?:number;user?:{id?:string}}
  if(!result.access_token||typeof result.user?.id!=="string"||!UUID.test(result.user.id))return false
  const token=result.access_token
  const memberList=await memberships(token,result.user.id)
  const first=memberList[0]
  if(!first)return false
  const tenants=await operatorRest<Array<{id:string;status:string}>>(token,"GET",
    `/tenants?id=eq.${first.tenant_id}&select=id,status&limit=1`)
  if(!tenants?.[0]||!["active","trial"].includes(tenants[0].status))return false
  const seconds=Math.max(1,Math.min(3600,Math.floor(result.expires_in||3600)-30))
  const store=await cookies()
  store.set(COOKIE_TOKEN,token,cookieOptions(seconds))
  store.set(COOKIE_TENANT,first.tenant_id,cookieOptions(seconds))
  return true
}

export async function listOperatorTenants(operator:Operator){
  const memberList=await memberships(operator.accessToken,operator.userId)
  const rows=await operatorRest<Array<{id:string;name:string;status:string}>>(
    operator.accessToken,"GET","/tenants?select=id,name,status&order=name.asc&limit=100")
  return rows.filter(t=>memberList.some(m=>m.tenant_id===t.id)&&["active","trial"].includes(t.status))
    .map(t=>({...t,selected:t.id===operator.tenantId}))
}

export async function selectOperatorTenant(operator:Operator,tenantId:string){
  if(!UUID.test(tenantId))return false
  const allowed=await listOperatorTenants(operator)
  if(!allowed.some(t=>t.id===tenantId))return false
  const store=await cookies()
  store.set(COOKIE_TENANT,tenantId,cookieOptions(1800))
  return true
}

export async function signOutOperator(){
  const store=await cookies()
  store.delete(COOKIE_TOKEN)
  store.delete(COOKIE_TENANT)
}
export function safeMutationOrigin(request:Request):boolean{
  const origin=request.headers.get("origin")
  if(!origin)return false
  try{return new URL(origin).origin===new URL(request.url).origin}
  catch{return false}
}
export function forbiddenResponse(){
  return Response.json({error:"not_authenticated"},{status:401,headers:{"Cache-Control":"no-store"}})
}
