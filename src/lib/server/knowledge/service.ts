import { supabaseRest } from "@/lib/server/supabase/rest"

type KnowledgeHit = {
  id: string
  kind: string
  title: string
  content: string
  source_url: string | null
  tags: string[]
  rank: number
}

export async function searchKnowledge(tenantId: string, query: string, limit = 8) {
  const q = String(query || "").trim()
  if (!tenantId || !q) return []

  const result = await supabaseRest<KnowledgeHit[]>("POST", "/rpc/crm_search_knowledge", {
    p_tenant_id: tenantId,
    p_query: q.slice(0, 500),
    p_limit: Math.min(Math.max(Math.trunc(limit), 1), 20),
  })

  return Array.isArray(result) ? result : []
}

export function knowledgeContext(hits: KnowledgeHit[], maxChars = 8000) {
  let used = 0
  const blocks: string[] = []

  for (const hit of hits) {
    const block = `[${hit.kind}] ${hit.title}\n${hit.content}\nFonte: ${hit.source_url || "base interna"}`
    if (used + block.length > maxChars) break
    blocks.push(block)
    used += block.length
  }

  return blocks.join("\n\n---\n\n")
}
