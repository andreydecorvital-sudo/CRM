import { queueOperatorReply } from "@/lib/server/operator/inbox"
import { forbiddenResponse, operatorFromCookie, safeMutationOrigin } from "@/lib/server/operator/session"

export const dynamic="force-dynamic"
export async function POST(request:Request,{params}:{params:Promise<{conversationId:string}>}) {
  if(!safeMutationOrigin(request))return Response.json({error:"origin_rejected"},{status:403})
  try{
    const operator=await operatorFromCookie()
    if(!operator)return forbiddenResponse()
    const {conversationId}=await params
    const payload=await request.json().catch(()=>null)
    const reply=await queueOperatorReply(operator,conversationId,
      typeof payload?.body==="string"?payload.body:"",
      typeof payload?.operationId==="string"?payload.operationId:"",
      payload?.confirmed===true,
    )
    return Response.json({ok:true,queued:true,reply},{status:202,headers:{"Cache-Control":"no-store"}})
  }catch(error){
    const code=error instanceof Error?error.message:"reply_failed"
    const status=code==="outbound_not_enabled"?503:
      ["claim_before_sending","human_takeover_required"].includes(code)?403:
      ["invalid_message","invalid_operation_id","confirmation_required","outside_customer_service_window","conversation_unavailable","whatsapp_not_connected"].includes(code)?409:
      code==="conversation_not_found"?404:503
    return Response.json({error:status===503?"reply_unavailable":code},{status})
  }
}
