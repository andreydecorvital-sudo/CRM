import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { supabaseRest } from "../src/lib/server/supabase/rest"
import { changeConversation, listInbox, queueOperatorReply, readThread } from "../src/lib/server/operator/inbox"
import type { Operator } from "../src/lib/server/operator/session"

vi.mock("../src/lib/server/supabase/rest",()=>({supabaseRest:vi.fn()}))

const tenant="11111111-1111-4111-8111-111111111111"
const otherTenant="22222222-2222-4222-8222-222222222222"
const user="33333333-3333-4333-8333-333333333333"
const contact="44444444-4444-4444-8444-444444444444"
const conversation="55555555-5555-4555-8555-555555555555"
const actor:Operator={tenantId:tenant,userId:user,role:"agent"}
const mock=vi.mocked(supabaseRest)

function row(overrides:Record<string,unknown>={}) {
 return {
   id:conversation,tenant_id:tenant,contact_id:contact,channel:"whatsapp",status:"open",category:"sales",
   priority:"normal",ai_mode:"assist",summary:"Pedido de orçamento",unread_count:2,
   assigned_to:null,department_id:null,last_message_at:"2026-10-19T12:30:00Z",
   last_inbound_at:"2026-10-19T12:30:00Z",last_outbound_at:null,...overrides,
 }
}
beforeEach(()=>{mock.mockReset();delete process.env.CRM_OPERATOR_SEND_ENABLED})
afterEach(()=>{delete process.env.CRM_OPERATOR_SEND_ENABLED})

describe("CRM internal Inbox",()=>{
 it("requires server tenant filter for list and contact lookup",async()=>{
   mock.mockImplementation(async (_method,path)=>{
     if(path.startsWith("/conversations?"))return [row()] as never
     if(path.startsWith("/contacts?"))return [{id:contact,display_name:"Maria",phone_e164:"+5511999999999",email:null,city:"SP",temperature:"hot"}] as never
     return [] as never
   })
   const result=await listInbox(actor)
   expect(result[0].name).toBe("Maria")
   expect(mock.mock.calls.every(call=>String(call[1]).includes(`tenant_id=eq.${tenant}`))).toBe(true)
   expect(mock.mock.calls.some(call=>String(call[1]).includes(otherTenant))).toBe(false)
 })
 it("rejects invalid conversation ID before reading the database",async()=>{
   expect(await readThread(actor,"../../../api")).toBeNull()
   expect(mock).not.toHaveBeenCalled()
 })
 it("claims conversation, disables AI and verifies persisted status",async()=>{
   let updated=false
   mock.mockImplementation(async (method,path)=>{
     if(method==="GET"&&path.startsWith("/conversations?"))return [row(updated?{assigned_to:user,ai_mode:"off",status:"open"}:{})] as never
     if(method==="PATCH"){updated=true;return null as never}
     return [] as never
   })
   await changeConversation(actor,conversation,"claim")
   const patch=mock.mock.calls.find(call=>call[0]==="PATCH")
   expect(patch?.[2]).toMatchObject({assigned_to:user,ai_mode:"off"})
 })
 it("prevents an ordinary operator taking conversation owned by another person",async()=>{
   mock.mockResolvedValueOnce([row({assigned_to:otherTenant})] as never)
   await expect(changeConversation(actor,conversation,"claim")).rejects.toThrow("conversation_assigned_to_other")
   expect(mock).toHaveBeenCalledTimes(1)
 })
 it("blocks all outbound unless pilot explicitly authorizes it",async()=>{
   await expect(queueOperatorReply(actor,conversation,"Olá","66666666-6666-4666-8666-666666666666",true))
     .rejects.toThrow("outbound_not_enabled")
   expect(mock).not.toHaveBeenCalled()
 })
 it("revoking write privileges blocks outbound even if the session is still present",async()=>{
   process.env.CRM_OPERATOR_SEND_ENABLED="true"
   await expect(queueOperatorReply({...actor,role:"viewer"},conversation,"Olá","77777777-7777-4777-8777-777777777777",true))
     .rejects.toThrow("operator_read_only")
   expect(mock).not.toHaveBeenCalled()
 })
 it("does not queue without deliberate confirmation",async()=>{
   process.env.CRM_OPERATOR_SEND_ENABLED="true"
   await expect(queueOperatorReply(actor,conversation,"Olá","66666666-6666-4666-8666-666666666666",false))
     .rejects.toThrow("confirmation_required")
   expect(mock).not.toHaveBeenCalled()
 })
})
