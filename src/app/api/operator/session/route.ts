import { operatorFromCookie, pilotConfigured, safeMutationOrigin, signInOperator, signOutOperator } from "@/lib/server/operator/session"

export const dynamic = "force-dynamic"
export async function GET() {
  try {
    const operator=await operatorFromCookie()
    return Response.json({authenticated:Boolean(operator),role:operator?.role??null,configured:pilotConfigured()},{
      headers:{"Cache-Control":"no-store"},
    })
  } catch {
    return Response.json({authenticated:false,configured:pilotConfigured()},{
      headers:{"Cache-Control":"no-store"},
    })
  }
}
export async function POST(request:Request) {
  if (!safeMutationOrigin(request)) return Response.json({error:"origin_rejected"},{status:403})
  if (!pilotConfigured()) return Response.json({error:"pilot_not_configured"},{status:503})
  const body = await request.json().catch(()=>null)
  const email = typeof body?.email==="string" ? body.email.trim() : ""
  const password = typeof body?.password==="string" ? body.password : ""
  if (!email || !password) return Response.json({error:"invalid_credentials"},{status:401})
  try {
    const valid=await signInOperator(email,password)
    if (!valid) return Response.json({error:"invalid_credentials"},{status:401})
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
  } catch {
    return Response.json({error:"authentication_unavailable"},{status:503})
  }
}
export async function DELETE(request:Request) {
  if (!safeMutationOrigin(request)) return Response.json({error:"origin_rejected"},{status:403})
  await signOutOperator()
  return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
}
