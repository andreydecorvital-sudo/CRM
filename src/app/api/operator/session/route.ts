import { forbiddenResponse, listOperatorTenants, operatorFromCookie, pilotConfigured, safeMutationOrigin, selectOperatorTenant, signInOperator, signOutOperator } from "@/lib/server/operator/session"

export const dynamic="force-dynamic"
export async function GET() {
  try {
    const operator=await operatorFromCookie()
    const tenants=operator?await listOperatorTenants(operator):[]
    return Response.json({
      authenticated:Boolean(operator),role:operator?.role??null,
      tenantId:operator?.tenantId??null,tenants,configured:pilotConfigured(),
      sendEnabled:Boolean(operator&&process.env.CRM_OPERATOR_SEND_ENABLED==="true"
        &&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)),
    },{headers:{"Cache-Control":"no-store"}})
  }catch{return Response.json({authenticated:false,configured:pilotConfigured()},{headers:{"Cache-Control":"no-store"}})}
}
export async function POST(request:Request) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  if(!pilotConfigured())return Response.json({error:"pilot_not_configured"},{status:503})
  const body=await request.json().catch(()=>null)
  const email=typeof body?.email==="string"?body.email.trim():""
  const password=typeof body?.password==="string"?body.password:""
  if(!email||!password)return Response.json({error:"invalid_credentials"},{status:401})
  try {
    const result=await signInOperator(email,password)
    if(!result.ok){
      const status=result.reason==="email_not_confirmed"?403:
        result.reason==="too_many_attempts"?429:
        result.reason==="auth_unavailable"?503:401
      return Response.json({error:result.reason},{status,headers:{"Cache-Control":"no-store"}})
    }
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
  }catch{return Response.json({error:"authentication_unavailable"},{status:503})}
}
export async function PATCH(request:Request) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  try {
    const operator=await operatorFromCookie()
    if(!operator)return forbiddenResponse()
    const payload=await request.json().catch(()=>null)
    const tenantId=typeof payload?.tenantId==="string"?payload.tenantId:""
    if(!await selectOperatorTenant(operator,tenantId))return Response.json({error:"tenant_not_allowed"},{status:403})
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
  }catch{return Response.json({error:"tenant_selection_unavailable"},{status:503})}
}
export async function DELETE(request:Request) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  await signOutOperator()
  return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
}
