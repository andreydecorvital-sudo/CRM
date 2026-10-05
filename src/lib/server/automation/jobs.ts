import { supabaseRest } from "@/lib/server/supabase/rest"
import type { JobRow } from "./types"

export async function claimJobs(workerId: string, limit = 20, kinds?: JobRow["kind"][]) {
  const id = String(workerId || "").trim().slice(0, 160)
  if (!id) throw new Error("workerId obrigatório.")

  const jobs = await supabaseRest<JobRow[]>("POST", "/rpc/crm_claim_jobs", {
    p_worker_id: id,
    p_limit: Math.min(Math.max(Math.trunc(limit), 1), 100),
    p_kinds: kinds?.length ? kinds : null,
  })
  return Array.isArray(jobs) ? jobs : []
}

export async function completeJob(jobId: string, workerId: string, result: Record<string, unknown> = {}) {
  return supabaseRest<boolean>("POST", "/rpc/crm_complete_job", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_result: result,
  })
}

export async function failJob(jobId: string, workerId: string, error: unknown, retryAfterSeconds?: number) {
  const message = error instanceof Error ? error.message : String(error || "unknown error")
  return supabaseRest<string>("POST", "/rpc/crm_fail_job", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_error: message.slice(0, 4000),
    p_retry_after_seconds: retryAfterSeconds ?? null,
  })
}

export async function releaseStaleJobs(olderThanMinutes = 10) {
  return supabaseRest<number>("POST", "/rpc/crm_release_stale_jobs", {
    p_older_than_minutes: Math.min(Math.max(Math.trunc(olderThanMinutes), 1), 1440),
  })
}
