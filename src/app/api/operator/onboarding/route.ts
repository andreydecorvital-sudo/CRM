import { authenticatedIdentity, createFirstWorkspace, pilotConfigured, registerOperator, safeMutationOrigin } from "@/lib/server/operator/session"

export const dynamic="force-dynamic"
const noStore={"Cache-Control":"no-store"}

export async function POST(request:Request) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403,headers:noStore})
  if(!pilotConfigured())return Response.json({error:"auth_not_configured"},{status:503,headers:noStore})
  const body=await request.json().catch(()=>null)
  const email=typeof body?.email==="string"?body.email.trim().toLowerCase():""
  if(body?.action==="resend_confirmation"){
    if(email.length>320||!email.includes("@"))return Response.json({error:"invalid_email"},{status:400,headers:noStore})
    try {
      const { operatorAuthRequest } = await import("@/lib/server/operator/auth-rest")
      const reply=await operatorAuthRequest("/resend",undefined,{type:"signup",email})
      // Always respond generically: never confirm whether an email is registered.
      if(reply.status===429)return Response.json({error:"too_many_attempts"},{status:429,headers:noStore})
      if(reply.status>=500)return Response.json({error:"email_delivery_unavailable"},{status:503,headers:noStore})
      return Response.json({ok:true,message:"Se houver um cadastro pendente, enviaremos uma confirmação."},{status:202,headers:noStore})
    }catch{return Response.json({error:"email_delivery_unavailable"},{status:503,headers:noStore})}
  }
  const password=typeof body?.password==="string"?body.password:""
  if(email.length>320||!email.includes("@")||password.length<12||password.length>1024){
    return Response.json({error:"invalid_registration"},{status:400,headers:noStore})
  }
  try{
    const accepted=await registerOperator(email,password)
    if(!accepted)return Response.json({error:"signup_unavailable"},{status:503,headers:noStore})
    return Response.json({
      ok:true,
      message:"Confira seu email para confirmar o cadastro (se exigido pelo Supabase). Depois, entre com sua senha.",
    },{status:202,headers:noStore})
  }catch{return Response.json({error:"signup_unavailable"},{status:503,headers:noStore})}
}

export async function PATCH(request:Request) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403,headers:noStore})
  const identity=await authenticatedIdentity()
  if(!identity)return Response.json({error:"not_authenticated"},{status:401,headers:noStore})
  const body=await request.json().catch(()=>null)
  const name=typeof body?.workspaceName==="string"?body.workspaceName.trim():""
  if(name.length<2||name.length>100)return Response.json({error:"invalid_workspace_name"},{status:400,headers:noStore})
  try {
    const done=await createFirstWorkspace(identity,name)
    if(!done)return Response.json({error:"workspace_unavailable"},{status:503,headers:noStore})
    return Response.json({ok:true},{status:201,headers:noStore})
  } catch {
    // Typically the CRM database migration has not been applied, or Auth confirmation is pending.
    return Response.json({error:"workspace_activation_unavailable"},{status:503,headers:noStore})
  }
}
