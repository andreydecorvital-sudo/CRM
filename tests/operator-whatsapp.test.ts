import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { operatorRest } from "../src/lib/server/operator/auth-rest"
import { crmWahaSession, registerOwnWahaChannel, validateChannelSession, wahaDedicatedConfig } from "../src/lib/server/operator/whatsapp-setup"
import type { Operator } from "../src/lib/server/operator/session"

vi.mock("../src/lib/server/operator/auth-rest",()=>({operatorRest:vi.fn()}))
const mock=vi.mocked(operatorRest)
const tenant="11111111-1111-4111-8111-111111111111"
const operator:Operator={userId:"22222222-2222-4222-8222-222222222222",tenantId:tenant,role:"owner",accessToken:"valid-user-jwt"}

beforeEach(()=>{mock.mockReset();delete process.env.CRM_WAHA_DEDICATED_INSTANCE;delete process.env.WAHA_BASE_URL;delete process.env.WAHA_API_KEY})
afterEach(()=>{delete process.env.CRM_WAHA_DEDICATED_INSTANCE;delete process.env.WAHA_BASE_URL;delete process.env.WAHA_API_KEY})

describe("Isolated WhatsApp onboarding",()=>{
 it("derives its session from the current tenant, never from browser input",()=>{
   expect(crmWahaSession(tenant)).toBe("crm_11111111111141118111111111111111")
   expect(()=>crmWahaSession("default")).toThrow("invalid_tenant")
 })
 it("blocks a shared Argoplace WAHA even when dedicated flag is mistakenly enabled",()=>{
   process.env.CRM_WAHA_DEDICATED_INSTANCE="true"
   process.env.WAHA_BASE_URL="https://argoplace-waha-production.up.railway.app"
   process.env.WAHA_API_KEY="example-key"
   expect(()=>wahaDedicatedConfig()).toThrow("waha_dedicated_instance_required")
 })
 it("requires explicit dedicated provider approval before any external API action",()=>{
   process.env.WAHA_BASE_URL="https://example.com"
   process.env.WAHA_API_KEY="example-key"
   expect(()=>wahaDedicatedConfig()).toThrow("waha_dedicated_instance_required")
 })
 it("only a tenant owner or admin can prepare a connection",async()=>{
   await expect(registerOwnWahaChannel({...operator,role:"manager"})).rejects.toThrow("role_not_allowed")
   expect(mock).not.toHaveBeenCalled()
 })
 it("creates and reads back a deterministic disconnected channel",async()=>{
   let exists=false
   mock.mockImplementation(async (_token,method,path)=>{
     if(method==="GET"&&path.includes("/whatsapp_connections?"))return (exists?[{id:"3",provider:"waha",status:"disconnected",config:{session:crmWahaSession(tenant)},phone_e164:null}]:[]) as never
     if(method==="POST"){exists=true;return [] as never}
     return [] as never
   })
   expect(await registerOwnWahaChannel(operator)).toEqual({alreadyExists:false,session:crmWahaSession(tenant)})
   const insert=mock.mock.calls.find(c=>c[1]==="POST")
   expect(insert?.[3]).toMatchObject([{tenant_id:tenant,provider:"waha",status:"disconnected",config:{session:crmWahaSession(tenant)}}])
 })
 it("never adopts another session even when stored in the same tenant",async()=>{
   mock.mockResolvedValue([{id:"3",provider:"waha",status:"connected",config:{session:"default"},phone_e164:null}] as never)
   await expect(registerOwnWahaChannel(operator)).rejects.toThrow("channel_not_isolated")
   expect(mock).toHaveBeenCalledTimes(1)
 })
 it("verifies tenant binding on existing session",()=>{
   expect(()=>validateChannelSession(operator,{id:"x",provider:"waha",status:"connected",config:{session:"argoplace"},phone_e164:null}))
     .toThrow("channel_not_isolated")
 })
})
