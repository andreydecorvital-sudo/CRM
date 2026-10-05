import { supabaseRest } from "@/lib/server/supabase/rest"

export type DealVelocityRow = {
  tenant_id: string
  pipeline_id: string
  stage_id: string
  passages: number
  avg_duration_seconds: number
  median_duration_seconds: number
}

export async function loadDealVelocity(tenantId: string, pipelineId?: string) {
  const filter = pipelineId ? `&pipeline_id=eq.${encodeURIComponent(pipelineId)}` : ""
  const rows = await supabaseRest<DealVelocityRow[]>(
    "GET",
    `/deal_velocity?tenant_id=eq.${encodeURIComponent(tenantId)}${filter}&select=*&order=avg_duration_seconds.desc`,
  )
  return Array.isArray(rows) ? rows : []
}

export function secondsToHuman(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—"
  const hours = Math.round(seconds / 3600)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}
