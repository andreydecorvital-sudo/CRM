import { supabaseRest } from "@/lib/server/supabase/rest"

export type TimelineEntry = {
  tenant_id: string
  contact_id: string
  occurred_at: string
  event_type: string
  entity_id: string
  title: string
  body: string | null
  metadata: Record<string, unknown>
}

export async function loadContactTimeline(tenantId: string, contactId: string, limit = 100) {
  const rows = await supabaseRest<TimelineEntry[]>(
    "GET",
    `/contact_timeline?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(contactId)}&select=*&order=occurred_at.desc&limit=${Math.min(Math.max(Math.trunc(limit),1),500)}`,
  )
  return Array.isArray(rows) ? rows : []
}
