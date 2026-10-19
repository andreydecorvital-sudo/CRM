import { beforeEach, describe, expect, it, vi } from "vitest"
import { cookies } from "next/headers"
import { operatorAuthRequest, operatorRest, operatorSupabaseConfig } from "../src/lib/server/operator/auth-rest"
import { operatorFromCookie, signInOperator } from "../src/lib/server/operator/session"

vi.mock("next/headers",()=>({cookies:vi.fn()}))
vi.mock("../src/lib/server/operator/auth-rest",()=>({
  operatorAuthRequest:vi.fn(),operatorRest:vi.fn(),operatorSupabaseConfig:vi.fn(),
}))

const uid="22222222-2222-4222-8222-222222222222"
const tenant="11111111-1111-4111-8111-111111111111"
const mockAuth=vi.mocked(operatorAuthRequest)
const mockRest=vi.mocked(operatorRest)
const mockCookies=vi.mocked(cookies)
const authReply=(body:unknown)=>new Response(JSON.stringify(body),{status:200})

beforeEach(()=>{
  vi.clearAllMocks()
  vi.mocked(operatorSupabaseConfig).mockReturnValue({url:"https://test.supabase.co",key:"sb_publishable_test"})
  mockCookies.mockResolvedValue({
    get:(key:string)=>key==="crm_operator_token"?{value:"valid-user-jwt"}:
      key==="crm_operator_tenant"?{value:tenant}:undefined,
    set:vi.fn(),delete:vi.fn()
  } as never)
  mockAuth.mockResolvedValue(authReply({id:uid}))
})

describe("CRM authentication without sequential duplicate database queries",()=>{
  it("checks tenant status and membership through one JWT/RLS PostgREST request",async()=>{
    mockRest.mockResolvedValueOnce([{tenant_id:tenant,role:"owner",tenants:{id:tenant,status:"trial"}}] as never)
    const result=await operatorFromCookie()
    expect(result).toMatchObject({userId:uid,tenantId:tenant,role:"owner"})
    expect(mockAuth).toHaveBeenCalledTimes(1)
    expect(mockRest).toHaveBeenCalledTimes(1)
    expect(mockRest.mock.calls[0]?.[2]).toContain("tenants!inner(id,status)")
    expect(mockRest.mock.calls[0]?.[2]).toContain("tenants.status=in.(active,trial)")
    expect(mockRest.mock.calls[0]?.[2]).toContain(`user_id=eq.${uid}`)
  })
  it("does not authorize a disabled tenant",async()=>{
    mockRest.mockResolvedValueOnce([{tenant_id:tenant,role:"owner",tenants:{id:tenant,status:"suspended"}}] as never)
    expect(await operatorFromCookie()).toBeNull()
  })
  it("does not accept a join response belonging to another tenant",async()=>{
    mockRest.mockResolvedValueOnce([{tenant_id:tenant,role:"owner",tenants:{id:"99999999-9999-4999-8999-999999999999",status:"active"}}] as never)
    expect(await operatorFromCookie()).toBeNull()
  })
  it("does not authorize RLS-invisible tenant rows",async()=>{
    mockRest.mockResolvedValueOnce([] as never)
    expect(await operatorFromCookie()).toBeNull()
  })
  it("newly registered users still reach onboarding without an existing tenant",async()=>{
    mockAuth.mockResolvedValueOnce(authReply({access_token:"valid-new-user-token",user:{id:uid},expires_in:3600}))
    mockRest.mockResolvedValueOnce([] as never)
    expect(await signInOperator("user@example.com","password")).toEqual({ok:true})
    expect(mockRest).toHaveBeenCalledTimes(1)
  })
})
