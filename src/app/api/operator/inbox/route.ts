import { listInbox } from "@/lib/server/operator/inbox"
import { forbiddenResponse, operatorFromCookie } from "@/lib/server/operator/session"

export const dynamic="force-dynamic"
export async function GET() {
  try {
    const operator=await operatorFromCookie()
    if(!operator)return forbiddenResponse()
    const conversations=await listInbox(operator)
    return Response.json({conversations},{headers:{"Cache-Control":"no-store"}})
  } catch {
    return Response.json({error:"inbox_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}})
  }
}
