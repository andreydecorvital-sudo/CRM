import { supabaseRest } from "@/lib/server/supabase/rest"
import type { DealHealthInput } from "./types"

type DealRow = {
  id: string
  tenant_id: string
  contact_id: string
  pipeline_id: string
  stage_id: string
  title: string
  value_cents: number | null
  owner_user_id: string | null
  next_followup_at: string | null
  won_at: string | null
  lost_at: string | null
  created_at: string
  updated_at: string
}

type HistoryRow = {
  deal_id: string
  stage_id: string
  entered_at: string
}

type VelocityRow = {
  stage_id: string
  passages: number
  median_duration_seconds: number | null
}

type ProposalRow = {
  id: string
  deal_id: string | null
  status: string
  total_cents: number
  sent_at: string | null
  viewed_at: string | null
  updated_at: string
}

type TaskRow = {
  id: string
  deal_id: string | null
  due_at: string
  priority: string
  kind: string
}

type ConversationRow = {
  id: string
  contact_id: string
  status: string
  last_message_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  sla_first_response_due_at: string | null
  sla_resolution_due_at: string | null
  first_response_at: string | null
  updated_at: string
}

function latestBy<T>(
  rows: T[],
  key: (row: T) => string | null,
  timestamp: (row: T) => string | null,
) {
  const result = new Map<string,T>()
  for (const row of rows) {
    const id = key(row)
    if (!id) continue
    const current = result.get(id)
    if (!current || Date.parse(timestamp(row) || "1970-01-01") > Date.parse(timestamp(current) || "1970-01-01")) {
      result.set(id,row)
    }
  }
  return result
}

export async function loadOpenDealHealthInputs(input: {
  tenantId: string
  dealId?: string | null
  contactId?: string | null
  limit?: number
  now?: string
}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 250),1),1000)
  const now = input.now || new Date().toISOString()

  const dealFilters = [
    `tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
    "won_at=is.null",
    "lost_at=is.null",
    input.dealId ? `id=eq.${encodeURIComponent(input.dealId)}` : "",
    input.contactId ? `contact_id=eq.${encodeURIComponent(input.contactId)}` : "",
  ].filter(Boolean).join("&")

  const deals = await supabaseRest<DealRow[]>(
    "GET",
    `/deals?${dealFilters}&select=id,tenant_id,contact_id,pipeline_id,stage_id,title,value_cents,owner_user_id,next_followup_at,won_at,lost_at,created_at,updated_at&order=updated_at.asc&limit=${limit}`,
  )

  const openDeals = Array.isArray(deals) ? deals : []
  if (!openDeals.length) return []

  const [history,velocity,proposals,tasks,conversations] = await Promise.all([
    supabaseRest<HistoryRow[]>(
      "GET",
      `/deal_stage_history?tenant_id=eq.${encodeURIComponent(input.tenantId)}&left_at=is.null&select=deal_id,stage_id,entered_at&limit=${Math.max(limit,1000)}`,
    ),
    supabaseRest<VelocityRow[]>(
      "GET",
      `/deal_velocity?tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=stage_id,passages,median_duration_seconds&limit=1000`,
    ),
    supabaseRest<ProposalRow[]>(
      "GET",
      `/proposals?tenant_id=eq.${encodeURIComponent(input.tenantId)}&deal_id=not.is.null&status=in.(draft,sent,viewed,accepted)&select=id,deal_id,status,total_cents,sent_at,viewed_at,updated_at&order=updated_at.desc&limit=3000`,
    ),
    supabaseRest<TaskRow[]>(
      "GET",
      `/tasks?tenant_id=eq.${encodeURIComponent(input.tenantId)}&deal_id=not.is.null&status=eq.open&select=id,deal_id,due_at,priority,kind&order=due_at.asc&limit=5000`,
    ),
    supabaseRest<ConversationRow[]>(
      "GET",
      `/conversations?tenant_id=eq.${encodeURIComponent(input.tenantId)}&select=id,contact_id,status,last_message_at,last_inbound_at,last_outbound_at,sla_first_response_due_at,sla_resolution_due_at,first_response_at,updated_at&order=updated_at.desc&limit=5000`,
    ),
  ])

  const historyByDeal = new Map(
    (Array.isArray(history) ? history : []).map(row => [row.deal_id,row]),
  )
  const velocityByStage = new Map(
    (Array.isArray(velocity) ? velocity : []).map(row => [row.stage_id,row]),
  )
  const proposalByDeal = latestBy(
    Array.isArray(proposals) ? proposals : [],
    row => row.deal_id,
    row => row.updated_at,
  )
  const conversationByContact = latestBy(
    Array.isArray(conversations) ? conversations : [],
    row => row.contact_id,
    row => row.last_message_at || row.updated_at,
  )

  const tasksByDeal = new Map<string,TaskRow[]>()
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task.deal_id) continue
    const current = tasksByDeal.get(task.deal_id) || []
    current.push(task)
    tasksByDeal.set(task.deal_id,current)
  }

  return openDeals.map((deal): DealHealthInput => {
    const stageHistory = historyByDeal.get(deal.id)
    const stageVelocity = velocityByStage.get(deal.stage_id)
    const proposal = proposalByDeal.get(deal.id)
    const conversation = conversationByContact.get(deal.contact_id)

    return {
      dealId:deal.id,
      tenantId:deal.tenant_id,
      contactId:deal.contact_id,
      title:deal.title,
      valueCents:Number(deal.value_cents || 0),
      ownerUserId:deal.owner_user_id,
      nextFollowupAt:deal.next_followup_at,
      createdAt:deal.created_at,
      updatedAt:deal.updated_at,
      stageEnteredAt:stageHistory?.entered_at || null,
      stageMedianDurationSeconds:stageVelocity?.median_duration_seconds == null
        ? null
        : Number(stageVelocity.median_duration_seconds),
      stagePassages:Number(stageVelocity?.passages || 0),
      conversation:conversation ? {
        id:conversation.id,
        status:conversation.status,
        lastMessageAt:conversation.last_message_at,
        lastInboundAt:conversation.last_inbound_at,
        lastOutboundAt:conversation.last_outbound_at,
        slaFirstResponseDueAt:conversation.sla_first_response_due_at,
        slaResolutionDueAt:conversation.sla_resolution_due_at,
        firstResponseAt:conversation.first_response_at,
      } : null,
      proposal:proposal ? {
        id:proposal.id,
        status:proposal.status,
        totalCents:Number(proposal.total_cents || 0),
        sentAt:proposal.sent_at,
        viewedAt:proposal.viewed_at,
        updatedAt:proposal.updated_at,
      } : null,
      openTasks:(tasksByDeal.get(deal.id) || []).map(task => ({
        id:task.id,
        dueAt:task.due_at,
        priority:task.priority,
        kind:task.kind,
      })),
      now,
    }
  })
}
