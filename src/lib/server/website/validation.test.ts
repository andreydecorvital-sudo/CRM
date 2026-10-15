import { describe, expect, it } from "vitest"
import { isAllowedWebsiteOrigin, normalizeWebsiteOrigin, parseWebsiteLead } from "./validation"

const requestId = "b560f4f8-76b9-4edb-b38e-ab6f8a9bba9a"

describe("website origins",() => {
  it("matches only an exact allowlisted origin",() => {
    expect(isAllowedWebsiteOrigin("https://cliente.com.br",["https://cliente.com.br"])).toBe(true)
    expect(isAllowedWebsiteOrigin("https://evil.cliente.com.br",["https://cliente.com.br"])).toBe(false)
    expect(isAllowedWebsiteOrigin("https://cliente.com.br.evil.com",["https://cliente.com.br"])).toBe(false)
    expect(isAllowedWebsiteOrigin("http://cliente.com.br",["https://cliente.com.br"])).toBe(false)
    expect(isAllowedWebsiteOrigin(null,["https://cliente.com.br"])).toBe(false)
  })
  it("rejects paths, credentials, queries and insecure external origins",() => {
    expect(normalizeWebsiteOrigin("https://cliente.com.br/path")).toBe(null)
    expect(normalizeWebsiteOrigin("https://cliente.com.br?x=1")).toBe(null)
    expect(normalizeWebsiteOrigin("https://user:pass@cliente.com.br")).toBe(null)
    expect(normalizeWebsiteOrigin("http://cliente.com.br")).toBe(null)
    expect(normalizeWebsiteOrigin("http://localhost:3000")).toBe("http://localhost:3000")
  })
})

describe("website lead payload",() => {
  const valid = {
    requestId,displayName:"Ana Silva",email:"ANA@EXAMPLE.COM",
    privacyConsent:true,pageUrl:"https://cliente.com.br/contato",
    utm:{ utm_source:"google",secret:"not-collected" },
  }
  it("accepts a consented website inquiry without inferring marketing consent",() => {
    expect(parseWebsiteLead(valid,"https://cliente.com.br")).toMatchObject({
      requestId,displayName:"Ana Silva",email:"ana@example.com",
      privacyConsent:true,utm:{utm_source:"google"},
    })
    expect("secret" in parseWebsiteLead(valid,"https://cliente.com.br").utm).toBe(false)
  })
  it("rejects no contact method, false consent and off-site URLs",() => {
    expect(() => parseWebsiteLead({...valid,email:""},"https://cliente.com.br")).toThrow("contact_method_required")
    expect(() => parseWebsiteLead({...valid,privacyConsent:false},"https://cliente.com.br")).toThrow("privacy_consent_required")
    expect(() => parseWebsiteLead({...valid,pageUrl:"https://evil.com"},"https://cliente.com.br")).toThrow("invalid_page_url")
  })
  it("rejects malformed email, phone and invalid request ID",() => {
    expect(() => parseWebsiteLead({...valid,email:"bad"},"https://cliente.com.br")).toThrow("invalid_email")
    expect(() => parseWebsiteLead({...valid,email:"",phone:"123"},"https://cliente.com.br")).toThrow("invalid_phone")
    expect(() => parseWebsiteLead({...valid,requestId:"not-a-uuid"},"https://cliente.com.br")).toThrow("invalid_request_id")
  })
})
