import { beforeEach, describe, expect, it, vi } from "vitest"
import { operatorFromCookie, safeMutationOrigin } from "../src/lib/server/operator/session"
import { getRemoteSession, wahaApi } from "../src/lib/server/operator/whatsapp-setup"
import { POST } from "../src/app/api/operator/whatsapp/pairing/route"

vi.mock("../src/lib/server/operator/session",()=>({
  operatorFromCookie:vi.fn(),safeMutationOrigin:vi.fn(),forbiddenResponse:vi.fn(),
}))
vi.mock("../src/lib/server/operator/whatsapp-setup",()=>({
  getRemoteSession:vi.fn(),wahaApi:vi.fn(),
}))

const tenant="11111111-1111-4111-8111-111111111111"
const session="crm_11111111111141118111111111111111"
const remote=vi.mocked(wahaApi)
function req(){
  return new Request("https://crm.example.com/api/operator/whatsapp/pairing",{
    method:"POST",headers:{"origin":"https://crm.example.com","content-type":"application/json"},
    body:JSON.stringify({action:"start",confirmed:true}),
  })
}

beforeEach(()=>{
  vi.resetAllMocks()
  vi.mocked(safeMutationOrigin).mockReturnValue(true)
  vi.mocked(operatorFromCookie).mockResolvedValue({userId:"22222222-2222-4222-8222-222222222222",tenantId:tenant,role:"owner",accessToken:"mock-token"})
  vi.mocked(getRemoteSession).mockResolvedValue({session,connection:{id:"conn",provider:"waha",status:"disconnected",config:{session},phone_e164:null}})
  process.env.WHATSAPP_WEBHOOK_SECRET="test-webhook-secret-longer-than-32-chars"
  process.env.NEXT_PUBLIC_APP_URL="https://crm.example.com"
})

describe("WAHA pairing starts only tenant-owned sessions",()=>{
  it("creates and starts a new tenant session so QR can appear",async()=>{
    remote.mockRejectedValueOnce(new Error("waha_session_not_found"))
      .mockResolvedValueOnce({status:"STOPPED"})
      .mockResolvedValueOnce({status:"STARTING"})
    const res=await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ok:true,alreadyExists:false,status:"STARTING"})
    expect(remote).toHaveBeenNthCalledWith(2,"/api/sessions","POST",expect.objectContaining({name:session}))
    expect(remote).toHaveBeenNthCalledWith(3,`/api/sessions/${session}/start`,"POST")
  })
  it("may start its own stopped session without creating a duplicate",async()=>{
    remote.mockResolvedValueOnce({status:"STOPPED",config:{metadata:{"crm.tenant_id":tenant}}})
      .mockResolvedValueOnce({status:"STARTING"})
    const res=await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ok:true,alreadyExists:true})
    expect(remote).toHaveBeenCalledTimes(2)
    expect(remote).toHaveBeenLastCalledWith(`/api/sessions/${session}/start`,"POST")
  })
  it("does not touch an active session when already working",async()=>{
    remote.mockResolvedValueOnce({status:"WORKING",config:{metadata:{"crm.tenant_id":tenant}}})
    const res=await POST(req())
    expect((await res.json()).status).toBe("WORKING")
    expect(remote).toHaveBeenCalledTimes(1)
  })
  it("rejects an existing session without matching tenant metadata",async()=>{
    remote.mockResolvedValueOnce({status:"STOPPED",config:{metadata:{"crm.tenant_id":"another-tenant"}}})
    const res=await POST(req())
    expect(res.status).toBe(409)
    expect(remote).toHaveBeenCalledTimes(1)
  })
  it("denies operation for an unauthenticated user",async()=>{
    vi.mocked(operatorFromCookie).mockResolvedValue(null)
    vi.mocked(operatorFromCookie).mockResolvedValue(null)
    const {forbiddenResponse}=await import("../src/lib/server/operator/session")
    vi.mocked(forbiddenResponse).mockReturnValue(Response.json({error:"not_authenticated"},{status:401}))
    const res=await POST(req())
    expect(res.status).toBe(401)
    expect(remote).not.toHaveBeenCalled()
  })
})
