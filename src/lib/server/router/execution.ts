import { supabaseRest } from "@/lib/server/supabase/rest"
import { getActionAdapter } from "./registry"
import type {
  ActionExecutionStatus,
  AuthorizedIntent,
} from "./contracts"

type ClaimResult = {
  claimed: boolean
  reason?: string
  receiptId?: string
  receiptStatus?: string
  intent?: AuthorizedIntent
}

async function finish(input: {
  receiptId: string
  workerId: string
  status: Exclude<ActionExecutionStatus,"executing">
  adapterKey?: string | null
  factsBefore?: Record<string, unknown> | null
  executionResult?: Record<string, unknown> | null
  verification?: Record<string, unknown> | null
  rollbackResult?: Record<string, unknown> | null
  error?: string | null
}) {
  const completed = await supabaseRest<boolean>("POST","/rpc/crm_finish_action_execution",{
    p_receipt_id: input.receiptId,
    p_worker_id: input.workerId,
    p_status: input.status,
    p_adapter_key: input.adapterKey || null,
    p_facts_before: input.factsBefore ?? null,
    p_execution_result: input.executionResult ?? null,
    p_verification: input.verification ?? null,
    p_rollback_result: input.rollbackResult ?? null,
    p_error: input.error || null,
  })

  if (!completed) throw new Error("Execution receipt não pertence mais a este worker.")
}

export async function executeAuthorizedIntent(input: {
  tenantId: string
  intentId: string
  workerId: string
}) {
  const claim = await supabaseRest<ClaimResult>("POST","/rpc/crm_claim_action_execution",{
    p_tenant_id: input.tenantId,
    p_intent_id: input.intentId,
    p_worker_id: input.workerId,
  })

  if (!claim?.claimed) {
    return {
      skipped: true,
      reason: claim?.reason || "not-claimed",
      receiptId: claim?.receiptId || null,
      receiptStatus: claim?.receiptStatus || null,
    }
  }

  const receiptId = String(claim.receiptId || "")
  const intent = claim.intent
  if (!receiptId || !intent) throw new Error("Claim de execução retornou contrato incompleto.")

  const adapter = getActionAdapter(intent.action_type)
  if (!adapter) {
    await finish({
      receiptId,
      workerId: input.workerId,
      status: "adapter_missing",
      error: `Nenhum adapter registrado para ${intent.action_type}.`,
    })
    return {
      executed: false,
      status: "adapter_missing",
      actionType: intent.action_type,
      receiptId,
    }
  }

  let facts: Record<string, unknown>
  try {
    facts = await adapter.rehydrate(intent)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finish({
      receiptId,
      workerId: input.workerId,
      status: "blocked",
      adapterKey: adapter.key,
      error: message,
    })
    return {
      executed: false,
      status: "blocked",
      adapter: adapter.key,
      reason: message,
      receiptId,
    }
  }

  let result: Record<string, unknown>
  try {
    result = await adapter.execute(intent,facts)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (adapter.semantics === "uncertain") {
      await finish({
        receiptId,
        workerId: input.workerId,
        status: "unknown",
        adapterKey: adapter.key,
        factsBefore: facts,
        error: message,
      })
      return {
        executed: false,
        status: "unknown",
        adapter: adapter.key,
        reason: message,
        receiptId,
      }
    }

    await finish({
      receiptId,
      workerId: input.workerId,
      status: "failed",
      adapterKey: adapter.key,
      factsBefore: facts,
      error: message,
    })
    throw error
  }

  try {
    const verification = await adapter.verify(intent,facts,result)
    if (!verification.verified) {
      await finish({
        receiptId,
        workerId: input.workerId,
        status: "unknown",
        adapterKey: adapter.key,
        factsBefore: facts,
        executionResult: result,
        verification: verification.details,
        error: "Post-read verification não confirmou a mutação.",
      })
      return {
        executed: true,
        status: "unknown",
        adapter: adapter.key,
        receiptId,
        verification,
      }
    }

    await finish({
      receiptId,
      workerId: input.workerId,
      status: "verified",
      adapterKey: adapter.key,
      factsBefore: facts,
      executionResult: result,
      verification: verification.details,
    })

    return {
      executed: true,
      status: "verified",
      adapter: adapter.key,
      receiptId,
      verification,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finish({
      receiptId,
      workerId: input.workerId,
      status: "unknown",
      adapterKey: adapter.key,
      factsBefore: facts,
      executionResult: result,
      error: `Falha de verificação: ${message}`,
    })
    return {
      executed: true,
      status: "unknown",
      adapter: adapter.key,
      receiptId,
      reason: message,
    }
  }
}
