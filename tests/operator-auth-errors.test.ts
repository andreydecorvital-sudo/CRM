import { beforeEach, describe, expect, it, vi } from "vitest"
import { cookies } from "next/headers"
import { operatorAuthRequest, operatorRest, operatorSupabaseConfig } from "../src/lib/server/operator/auth-rest"
import { signInOperator } from "../src/lib/server/operator/session"

vi.mock("next/headers",()=>({cookies:vi.fn()}))
vi.mock("../src/lib/server/operator/auth-rest",()=>({
  operatorAuthRequest:vi.fn(),operatorRest:vi.fn(),operatorSupabaseConfig:vi.fn(),
}))
const mockAuth=vi.mocked(operatorAuthRequest)
const mockRest=vi.mocked(operatorRest)
const mockCookies=vi.mocked(cookies)
const userId="22222222-2222-4222-8222-222222222222"

beforeEach(()=>{
  mockAuth.mockReset();mockRest.mockReset();mockCookies.mockReset()
  vi.mocked(operatorSupabaseConfig).mockReturnValue({url:"https://test.supabase.co",key:"sb_publishable_example"})
})

function authResponse(status:number,body:unknown):Response{
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})
}

describe("Operator login diagnostics",()=>{
  it("distinguishes unconfirmed email from bad password",async()=>{
    mockAuth.mockResolvedValueOnce(authResponse(400,{code:"email_not_confirmed",msg:"Email not confirmed"}))
    expect(await signInOperator("operator@example.com","valid-password")).toEqual({ok:false,reason:"email_not_confirmed"})
    expect(mockCookies).not.toHaveBeenCalled()
  })
  it("does not reveal account existence for incorrect credentials",async()=>{
    mockAuth.mockResolvedValueOnce(authResponse(400,{code:"invalid_credentials",msg:"Invalid login credentials"}))
    expect(await signInOperator("operator@example.com","wrong-password")).toEqual({ok:false,reason:"invalid_credentials"})
    expect(mockCookies).not.toHaveBeenCalled()
  })
  it("returns Supabase throttling as a separate recoverable state",async()=>{
    mockAuth.mockResolvedValueOnce(authResponse(429,{code:"over_request_rate_limit"}))
    expect(await signInOperator("operator@example.com","valid-password")).toEqual({ok:false,reason:"too_many_attempts"})
  })
  it("accepts genuine Auth login even before the first tenant migration is applied",async()=>{
    const set=vi.fn(),del=vi.fn()
    mockAuth.mockResolvedValueOnce(authResponse(200,{
      access_token:"real-test-jwt",user:{id:userId},expires_in:3600
    }))
    mockRest.mockRejectedValueOnce(new Error("operator_supabase_http_404"))
    mockCookies.mockResolvedValueOnce({set,delete:del} as never)
    expect(await signInOperator("operator@example.com","valid-password")).toEqual({ok:true})
    expect(set).toHaveBeenCalledWith("crm_operator_token","real-test-jwt",expect.objectContaining({httpOnly:true,sameSite:"strict"}))
    expect(del).toHaveBeenCalledWith("crm_operator_tenant")
  })
})
