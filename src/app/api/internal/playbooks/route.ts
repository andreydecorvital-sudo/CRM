import { assertInternalRequest } from "@/lib/server/internal-auth"
import { compilePlaybook } from "@/lib/server/playbooks/compiler"
import { draftPlaybookFromText } from "@/lib/server/playbooks/authoring"
import { getPlaybookTemplate, playbookTemplates } from "@/lib/server/playbooks/templates"
import { simulatePlaybook } from "@/lib/server/playbooks/simulator"
import type {
  PlaybookDefinition,
  PlaybookSimulationEvent,
} from "@/lib/server/playbooks/types"
import { validatePlaybook } from "@/lib/server/playbooks/validator"

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "unauthorized") {
    return Response.json({ error:"unauthorized" },{ status:401 })
  }
  return Response.json({ error:"playbook_error",message },{ status:400 })
}

function object(value: unknown,key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} inválido.`)
  }
  return value as Record<string,unknown>
}

function playbookFrom(value: unknown): PlaybookDefinition {
  return object(value,"playbook") as unknown as PlaybookDefinition
}

function eventsFrom(value: unknown) {
  if (!Array.isArray(value)) throw new Error("events deve ser array.")
  return value.slice(0,10_000) as PlaybookSimulationEvent[]
}

export async function GET(request: Request) {
  try {
    assertInternalRequest(request)
    const url = new URL(request.url)
    const key = String(url.searchParams.get("key") || "").trim()

    if (key) {
      const template = getPlaybookTemplate(key)
      if (!template) return Response.json({ error:"template_not_found" },{ status:404 })
      return Response.json({
        template,
        validation:validatePlaybook(template),
      },{
        headers:{ "Cache-Control":"no-store" },
      })
    }

    return Response.json({
      templates:playbookTemplates.map(template => ({
        ...template,
        validation:validatePlaybook(template),
      })),
    },{
      headers:{ "Cache-Control":"no-store" },
    })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  try {
    assertInternalRequest(request)
    const body = await request.json().catch(() => null) as Record<string,unknown> | null
    if (!body) throw new Error("payload inválido.")

    const operation = String(body.operation || "simulate")

    const templateKey = typeof body.templateKey === "string"
      ? body.templateKey.trim()
      : ""
    const template = templateKey ? getPlaybookTemplate(templateKey) : null
    const playbook = template || playbookFrom(body.playbook)

    if (operation === "draft_from_text") {
      const tenantId = String(body.tenantId || "").trim()
      const instruction = String(body.instruction || "").trim()
      if (!tenantId) throw new Error("tenantId obrigatório para draft_from_text.")
      if (!instruction) throw new Error("instruction obrigatória.")

      return Response.json({
        ok:true,
        operation,
        draft:await draftPlaybookFromText({ tenantId,instruction }),
      },{
        headers:{ "Cache-Control":"no-store" },
      })
    }

    if (operation === "validate") {
      return Response.json({
        ok:true,
        operation,
        validation:validatePlaybook(playbook),
      })
    }

    if (operation === "compile") {
      const tenantId = String(body.tenantId || "").trim()
      if (!tenantId) throw new Error("tenantId obrigatório para compile.")
      return Response.json({
        ok:true,
        operation,
        compiled:compilePlaybook({
          tenantId,
          playbook,
          simulationApproved:body.simulationApproved === true,
        }),
      })
    }

    if (operation === "simulate") {
      const result = simulatePlaybook({
        playbook,
        events:eventsFrom(body.events),
      })
      return Response.json({
        ok:true,
        operation,
        result,
      },{
        headers:{ "Cache-Control":"no-store" },
      })
    }

    throw new Error("operation inválida. Use draft_from_text, validate, compile ou simulate.")
  } catch (error) {
    return fail(error)
  }
}
