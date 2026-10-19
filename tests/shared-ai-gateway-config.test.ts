import { describe,expect,it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const config=readFileSync(resolve(process.cwd(),"infra/litellm/config.example.yaml"),"utf8")

describe("Shared five-provider inference gateway blueprint",()=>{
  it("declares every requested provider as a dedicated routable group",()=>{
    for(const provider of ["gemini","openai","claude","groq","grok"]){
      expect(config).toContain(`model_name: provider-${provider}`)
    }
  })
  it("has separate application aliases without exposing credentials",()=>{
    for(const app of ["crm-default","mira-consultive","mira-fast","argoplace-analyst","orquestra-research"]){
      expect(config).toContain(`model_name: ${app}`)
    }
    for(const key of ["GEMINI_API_KEY","OPENAI_API_KEY","ANTHROPIC_API_KEY","GROQ_API_KEY","XAI_API_KEY"]){
      expect(config).toContain(`os.environ/${key}`)
    }
    expect(config).not.toMatch(/\b(?:sk-ant-|sk-proj-|gsk_|xai-)[A-Za-z0-9_-]{20,}/)
  })
  it("does not advertise enforceable spend budgets without database backing",()=>{
    expect(config).toContain("database_url: os.environ/DATABASE_URL")
    expect(config).toContain("master_key: os.environ/LITELLM_MASTER_KEY")
    expect(config).toContain("enforce_fallback_model_access: true")
    expect(config).toContain("num_retries: 0")
  })
})
