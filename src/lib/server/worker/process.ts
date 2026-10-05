import { claimJobs, completeJob, failJob, releaseStaleJobs } from "@/lib/server/automation/jobs"
import { processAutomationEvent } from "@/lib/server/automation/engine"
import { processOutboundMessage } from "@/lib/server/outbound/processor"
import { processWebhookDelivery } from "@/lib/server/webhooks/processor"
import { processContactImportChunk } from "@/lib/server/imports/processor"
import { routeDomainEvent } from "@/lib/server/router/event-router"
import { executeAuthorizedIntent } from "@/lib/server/router/execution"
import { scanCommercialIntelligence } from "@/lib/server/intelligence/scanner"
import type { JobRow } from "@/lib/server/automation/types"

function payloadId(job: JobRow, key: string) {
  const value = job.payload?.[key]
  if (typeof value !== "string" || !value.trim()) throw new Error(`Job ${job.id} sem ${key}.`)
  return value.trim()
}

export async function processClaimedJob(job: JobRow) {
  switch (job.kind) {
    case "automation":
      return processAutomationEvent(payloadId(job, "eventId"))
    case "outbound_message":
      return processOutboundMessage(payloadId(job, "messageId"))
    case "webhook":
      return processWebhookDelivery(payloadId(job, "deliveryId"))
    case "event_router":
      return routeDomainEvent(payloadId(job, "eventId"))
    case "action_execution": {
      const workerId = String(job.locked_by || "").trim()
      if (!workerId) throw new Error(`Job ${job.id} sem worker owner.`)
      return executeAuthorizedIntent({
        tenantId: job.tenant_id,
        intentId: payloadId(job, "intentId"),
        workerId,
      })
    }
    case "commercial_intelligence":
      return scanCommercialIntelligence({
        tenantId: job.tenant_id,
        dealId: typeof job.payload?.dealId === "string" ? job.payload.dealId : null,
        contactId: typeof job.payload?.contactId === "string" ? job.payload.contactId : null,
        limit: Number.isFinite(Number(job.payload?.limit))
          ? Math.min(Math.max(Math.trunc(Number(job.payload?.limit)),1),1000)
          : 250,
      })
    case "notification":
      return { skipped: true, reason: "notification-jobs-not-used" }
    case "contact_import": {
      const importId = payloadId(job, "importId")
      const firstRow = Number(job.payload?.firstRow)
      const lastRow = Number(job.payload?.lastRow)
      if (!Number.isInteger(firstRow) || !Number.isInteger(lastRow) || firstRow < 1 || lastRow < firstRow) {
        throw new Error(`Job ${job.id} com faixa de importação inválida.`)
      }
      return processContactImportChunk({ importId, firstRow, lastRow })
    }
    case "maintenance":
      return { skipped: true, reason: "maintenance-dispatched-elsewhere" }
    default:
      throw new Error(`Tipo de job não suportado: ${String(job.kind)}`)
  }
}

export async function runWorkerTick(input: {
  workerId: string
  limit?: number
  kinds?: JobRow["kind"][]
}) {
  await releaseStaleJobs(10).catch(() => null)

  const jobs = await claimJobs(input.workerId, input.limit ?? 20, input.kinds)
  const summary = {
    claimed: jobs.length,
    succeeded: 0,
    failed: 0,
    dead: 0,
    jobs: [] as Array<{ id: string; kind: string; status: string; error?: string }>,
  }

  for (const job of jobs) {
    try {
      const result = await processClaimedJob(job)
      await completeJob(job.id, input.workerId, result && typeof result === "object" ? result as Record<string, unknown> : { result })
      summary.succeeded += 1
      summary.jobs.push({ id: job.id, kind: job.kind, status: "succeeded" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = await failJob(job.id, input.workerId, error)
      if (status === "dead") summary.dead += 1
      else summary.failed += 1
      summary.jobs.push({ id: job.id, kind: job.kind, status, error: message.slice(0, 500) })
    }
  }

  return summary
}
