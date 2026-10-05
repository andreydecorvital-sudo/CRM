import { supabaseRest } from "@/lib/server/supabase/rest"

type SummaryRow = {
  tenant_id: string
  active_cases: number
  critical_cases: number
  at_risk_cases: number
  pipeline_value_cents: number
  exposed_value_cents: number
  latest_detection_at: string | null
}

type RecoveryCase = {
  id: string
  deal_id: string
  contact_id: string
  reason_code: string
  severity: string
  pipeline_value_cents: number
  exposed_value_cents: number
  days_stalled: number
  summary: string
  status: string
  next_action_id: string | null
  detected_at: string
  updated_at: string
}

type NextAction = {
  id: string
  deal_id: string
  contact_id: string
  title: string
  reason: string
  due_at: string | null
  confidence: number
  risk_level: string
  priority: string
  status: string
  action_proposal_id: string | null
  updated_at: string
}

type HealthCurrent = {
  deal_id: string
  score: number
  band: string
  pipeline_value_cents: number
  exposed_value_cents: number
  reasons: unknown[]
  signals: Record<string, unknown>
  calculated_at: string
}

export async function commercialIntelligenceSummary(input: {
  tenantId: string
  limit?: number
}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50),1),200)

  const [summaryRows,cases,health,nextActions] = await Promise.all([
    supabaseRest<SummaryRow[]>(
      "GET",
      `/revenue_recovery_summary?tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=*&limit=1`,
    ),
    supabaseRest<RecoveryCase[]>(
      "GET",
      `/revenue_recovery_cases?tenant_id=eq.${encodeURIComponent(input.tenantId)}&status=in.(open,proposed,authorized)&select=id,deal_id,contact_id,reason_code,severity,pipeline_value_cents,exposed_value_cents,days_stalled,summary,status,next_action_id,detected_at,updated_at&order=exposed_value_cents.desc,detected_at.desc&limit=${limit}`,
    ),
    supabaseRest<HealthCurrent[]>(
      "GET",
      `/deal_health_current?tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=deal_id,score,band,pipeline_value_cents,exposed_value_cents,reasons,signals,calculated_at&order=score.asc&limit=${limit}`,
    ),
    supabaseRest<NextAction[]>(
      "GET",
      `/next_action_recommendations?tenant_id=eq.${encodeURIComponent(input.tenantId)}&status=in.(active,proposed,authorized)&select=id,deal_id,contact_id,title,reason,due_at,confidence,risk_level,priority,status,action_proposal_id,updated_at&order=priority.desc,due_at.asc.nullslast&limit=${limit}`,
    ),
  ])

  return {
    summary:Array.isArray(summaryRows) ? summaryRows[0] ?? {
      tenant_id:input.tenantId,
      active_cases:0,
      critical_cases:0,
      at_risk_cases:0,
      pipeline_value_cents:0,
      exposed_value_cents:0,
      latest_detection_at:null,
    } : null,
    recoveryCases:Array.isArray(cases) ? cases : [],
    weakestDeals:Array.isArray(health) ? health : [],
    nextActions:Array.isArray(nextActions) ? nextActions : [],
  }
}
