import { changeConversation, readThread } from "@/lib/server/operator/inbox"
import { forbiddenResponse, operatorFromCookie, safeMutationOrigin } from "@/lib/server/operator/session"

export const dynamic="force-dynamic"
type Context={params:Promise<{conversationId:string}>}
export async function GET(_request:Request,{params}:Context) {
  try {
    const operator=await operatorFromCookie()
    if(!operator)return forbiddenResponse()
    const {conversationId}=await params
    const thread=await readThread(operator,conversationId)
    if(!thread)return Response.json({error:"not_found"},{status:404})
    return Response.json(thread,{headers:{"Cache-Control":"no-store"}})
  }catch{return Response.json({error:"thread_unavailable"},{status:503})}
}
export async function PATCH(request:Request,{params}:Context) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  try {
    const operator=await operatorFromCookie()
    if(!operator)return forbiddenResponse()
    const {conversationId}=await params
    const payload=await request.json().catch(()=>null)
    const action=typeof payload?.action==="string"?payload.action:""
    await changeConversation(operator,conversationId,action)
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
  }catch(error){
    const code=error instanceof Error?error.message:"operation_failed"
    if(code==="conversation_not_found")return Response.json({error:code},{status:404})
    if(["claim_before_resolving","conversation_assigned_to_other","not_conversation_owner","operator_read_only"].includes(code))return Response.json({error:code},{status:403})
    if(["conversation_not_resolved","unknown_action"].includes(code))return Response.json({error:code},{status:400})
    return Response.json({error:"operation_failed"},{status:503})
  }
}
