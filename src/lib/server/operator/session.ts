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

export type OperatorIdentity = {userId:string;accessToken:string}

export async function authenticatedIdentity():Promise<OperatorIdentity|null> {
  if(!pilotConfigured())return null
  const store=await cookies()
  const accessToken=store.get(COOKIE_TOKEN)?.value||""
  try{
    const userId=await verifiedUser(accessToken)
    return userId?{userId,accessToken}:null
  }catch{return null}
}

export async function registerOperator(email:string,password:string):Promise<boolean> {
  if(!pilotConfigured()||!email.includes("@")||email.length>320||password.length<12||password.length>1024)return false
  const result=await operatorAuthRequest("/signup",undefined,{email,password})
  // Supabase may protect user enumeration by returning a placeholder user.
  // Never infer email ownership from returned account metadata.
  return result.ok
}

export async function createFirstWorkspace(identity:OperatorIdentity,name:string):Promise<boolean> {
  const trimmed=name.trim()
  if(trimmed.length<2||trimmed.length>100)return false
  const result=await operatorRest<string>(identity.accessToken,"POST","/rpc/crm_create_first_workspace",{p_name:trimmed})
  if(typeof result!=="string"||!UUID.test(result))throw new Error("workspace_create_unavailable")
  const memberList=await memberships(identity.accessToken,identity.userId)
  if(!memberList.some(m=>m.tenant_id===result&&m.role==="owner"))throw new Error("workspace_membership_not_verified")
  const store=await cookies()
  store.set(COOKIE_TENANT,result,cookieOptions(1800))
  return true
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

export type SignInResult = {ok:true}|{ok:false;reason:"invalid_credentials"|"email_not_confirmed"|"too_many_attempts"|"auth_unavailable"}
export async function signInOperator(email:string,password:string):Promise<SignInResult>{
  if(!pilotConfigured())return {ok:false,reason:"auth_unavailable"}
  if(!email.includes("@")||email.length>320||!password||password.length>1024)return {ok:false,reason:"invalid_credentials"}
  let res:Response
  try{res=await operatorAuthRequest("/token?grant_type=password",undefined,{email,password})}
  catch{return {ok:false,reason:"auth_unavailable"}}
  if(!res.ok){
    const response=await res.json().catch(()=>({})) as {code?:string;error_code?:string;msg?:string;error_description?:string}
    const code=String(response.code||response.error_code||"").toLowerCase()
    const message=String(response.msg||response.error_description||"").toLowerCase()
    if(code==="email_not_confirmed"||message.includes("email not confirmed"))return {ok:false,reason:"email_not_confirmed"}
    if(res.status===429||code.includes("rate_limit"))return {ok:false,reason:"too_many_attempts"}
    if(res.status>=500)return {ok:false,reason:"auth_unavailable"}
    return {ok:false,reason:"invalid_credentials"}
  }
  const result=await res.json() as {access_token?:string;expires_in?:number;user?:{id?:string}}
  if(!result.access_token||typeof result.user?.id!=="string"||!UUID.test(result.user.id))
    return {ok:false,reason:"auth_unavailable"}
  const token=result.access_token
  let first:Member|undefined
  try{
    // Database provisioning may not be complete, but a valid Auth identity can still
    // reach the onboarding screen. Never issue a tenant cookie without verified membership.
    first=(await memberships(token,result.user.id))[0]
    if(first){
      const tenants=await operatorRest<Array<{id:string;status:string}>>(token,"GET",
        `/tenants?id=eq.${first.tenant_id}&select=id,status&limit=1`)
      if(!tenants?.[0]||!["active","trial"].includes(tenants[0].status))first=undefined
    }
  }catch{first=undefined}
  const seconds=Math.max(1,Math.min(3600,Math.floor(result.expires_in||3600)-30))
  const store=await cookies()
  store.set(COOKIE_TOKEN,token,cookieOptions(seconds))
  if(first)store.set(COOKIE_TENANT,first.tenant_id,cookieOptions(seconds))
  else store.delete(COOKIE_TENANT)
  return {ok:true}
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
