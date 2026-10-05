import { assertInternalRequest } from "@/lib/server/internal-auth"
import { runGoldenScenarios } from "@/lib/server/intelligence/scenarios"
import { simulateDeal, simulateRouter } from "@/lib/server/intelligence/simulator"
import type { DealHealthInput } from "@/lib/server/intelligence/types"

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "unauthorized") {
    return Response.json({ error:"unauthorized" },{ status:401 })
  }
  return Response.json({ error:"simulation_error",message },{ status:400 })
}

function requiredString(value: unknown,key: string) {
  const text = String(value || "").trim()
  if (!text) throw new Error(`${key} obrigatório.`)
  return text
}

function normalizeDeal(value: unknown): DealHealthInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("deal inválido.")
  }

  const deal = value as Record<string,unknown>
  const normalized = {
    ...deal,
    dealId:requiredString(deal.dealId,"dealId"),
    tenantId:requiredString(deal.tenantId,"tenantId"),
    contactId:requiredString(deal.contactId,"contactId"),
    title:requiredString(deal.title,"title").slice(0,500),
    valueCents:Math.max(0,Math.trunc(Number(deal.valueCents || 0))),
    ownerUserId:deal.ownerUserId ? String(deal.ownerUserId) : null,
    nextFollowupAt:deal.nextFollowupAt ? String(deal.nextFollowupAt) : null,
    createdAt:requiredString(deal.createdAt,"createdAt"),
    updatedAt:requiredString(deal.updatedAt,"updatedAt"),
    stageEnteredAt:deal.stageEnteredAt ? String(deal.stageEnteredAt) : null,
    stageMedianDurationSeconds:deal.stageMedianDurationSeconds == null
      ? null
      : Number(deal.stageMedianDurationSeconds),
    stagePassages:Math.max(0,Math.trunc(Number(deal.stagePassages || 0))),
    conversation:deal.conversation ?? null,
    proposal:deal.proposal ?? null,
    openTasks:Array.isArray(deal.openTasks) ? deal.openTasks.slice(0,100) : [],
    now:requiredString(deal.now,"now"),
  }

  return normalized as DealHealthInput
}

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    const scenarios = runGoldenScenarios()
    return Response.json({
      ok:scenarios.every(item => item.passed),
      scenarios,
    },{
      headers:{ "Cache-Control":"no-store" },
    })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    assertInternalRequest(request)
    const body = await request.json().catch(() => null) as Record<string,unknown> | null
    if (!body) throw new Error("payload inválido.")

    const kind = String(body.kind || "deal")

    if (kind === "deal") {
      return Response.json({
        ok:true,
        kind,
        result:simulateDeal(normalizeDeal(body.deal)),
      },{
        headers:{ "Cache-Control":"no-store" },
      })
    }

    if (kind === "router") {
      const events = Array.isArray(body.events)
        ? body.events.map(item => String(item)).slice(0,100)
        : []
      if (!events.length) throw new Error("events obrigatório.")
      return Response.json({
        ok:true,
        kind,
        result:simulateRouter(events),
      },{
        headers:{ "Cache-Control":"no-store" },
      })
    }

    if (kind === "suite") {
      const scenarios = runGoldenScenarios()
      return Response.json({
        ok:scenarios.every(item => item.passed),
        kind,
        scenarios,
      },{
        headers:{ "Cache-Control":"no-store" },
      })
    }

    throw new Error("kind inválido. Use deal, router ou suite.")
  } catch (error) {
    return failure(error)
  }
}
