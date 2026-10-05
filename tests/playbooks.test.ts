import { describe,expect,it } from "vitest"
import { compilePlaybook } from "../src/lib/server/playbooks/compiler"
import { getPlaybookTemplate } from "../src/lib/server/playbooks/templates"
import { simulatePlaybook } from "../src/lib/server/playbooks/simulator"
import type { DomainEvent } from "../src/lib/server/automation/types"
import { validatePlaybook } from "../src/lib/server/playbooks/validator"
import { parsePlaybookDraftFromModelText } from "../src/lib/server/playbooks/authoring"

function event(input: Partial<DomainEvent> & Pick<DomainEvent,"event_type">): DomainEvent {
  return {
    id:input.id || "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tenant_id:input.tenant_id || "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    event_type:input.event_type,
    aggregate_type:input.aggregate_type || "deal",
    aggregate_id:input.aggregate_id || "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    contact_id:input.contact_id === undefined
      ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
      : input.contact_id,
    payload:input.payload || {},
    occurred_at:input.occurred_at || "2026-10-05T18:00:00.000Z",
    status:input.status || "pending",
    attempts:input.attempts || 0,
  }
}

describe("Playbook Engine",() => {
  it("compiles shadow playbooks disabled and active playbooks enabled",() => {
    const template = getPlaybookTemplate("high_ticket_paid_lead")!
    const shadow = compilePlaybook({
      tenantId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      playbook:template,
    })

    expect(shadow.rule.enabled).toBe(false)

    const active = compilePlaybook({
      tenantId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      playbook:{ ...template,mode:"active" },
      simulationApproved:true,
    })

    expect(active.rule.enabled).toBe(true)
    expect(active.rule.trigger_event).toBe("deal.created")
  })

  it("blocks activation compile without explicit simulation approval",() => {
    const template = getPlaybookTemplate("high_ticket_paid_lead")!
    expect(() => compilePlaybook({
      tenantId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      playbook:{ ...template,mode:"active" },
    })).toThrow("simulationApproved=true")
  })

  it("simulates high-ticket paid lead impact without executing",() => {
    const template = getPlaybookTemplate("high_ticket_paid_lead")!
    const result = simulatePlaybook({
      playbook:template,
      events:[
        {
          event:event({
            event_type:"deal.created",
            payload:{
              valueCents:850_000,
              source:"meta_ads",
              ownerUserId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              title:"Projeto premium",
            },
          }),
        },
        {
          event:event({
            id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
            event_type:"deal.created",
            payload:{
              valueCents:200_000,
              source:"meta_ads",
              title:"Ticket baixo",
            },
          }),
        },
      ],
    })

    expect(result.summary.inputEvents).toBe(2)
    expect(result.summary.triggerEvents).toBe(2)
    expect(result.summary.matchedEvents).toBe(1)
    expect(result.summary.tasksWouldCreate).toBe(1)
    expect(result.summary.tagsWouldApply).toBe(1)
    expect(result.summary.followupsWouldSet).toBe(1)
    expect(result.summary.actionsWouldExecute).toBe(3)
  })

  it("suppresses opportunity messaging when customer did not opt in",() => {
    const template = getPlaybookTemplate("won_deal_opportunity_optin")!
    const result = simulatePlaybook({
      playbook:template,
      events:[{
        event:event({
          event_type:"deal.won",
          payload:{ valueCents:1_200_000,title:"Venda ganha" },
        }),
        consent:{
          channelPreferences:{ whatsapp:"opted_out" },
          opportunities:{ enabled:false,channels:[] },
        },
      }],
    })

    expect(result.summary.matchedEvents).toBe(1)
    expect(result.summary.messagesWouldQueue).toBe(0)
    expect(result.summary.messagesSuppressed).toBe(1)
    expect(result.summary.messageSuppressions["opportunities-disabled"]).toBe(1)
  })

  it("allows opportunity messaging only when opportunity and channel consent are compatible",() => {
    const template = getPlaybookTemplate("won_deal_opportunity_optin")!
    const result = simulatePlaybook({
      playbook:template,
      events:[{
        event:event({
          event_type:"deal.won",
          payload:{ valueCents:1_200_000,title:"Venda ganha" },
        }),
        consent:{
          channelPreferences:{ whatsapp:"opted_in" },
          opportunities:{ enabled:true,channels:["whatsapp"] },
        },
      }],
    })

    expect(result.summary.messagesWouldQueue).toBe(1)
    expect(result.summary.messagesSuppressed).toBe(0)
    expect(result.actions[0].status).toBe("would_execute")
  })

  it("uses the real automation condition semantics",() => {
    const template = getPlaybookTemplate("price_intent_inbound")!
    const result = simulatePlaybook({
      playbook:template,
      events:[
        {
          event:event({
            event_type:"message.received",
            aggregate_type:"message",
            payload:{
              text:"Qual o PREÇO desse produto?",
              conversationId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
            },
          }),
        },
      ],
    })

    expect(result.summary.matchedEvents).toBe(1)
    expect(result.summary.tagsWouldApply).toBe(1)
    expect(result.summary.tasksWouldCreate).toBe(1)
  })

  it("forces AI-authored playbooks to draft even if the model asks for active",() => {
    const raw = [
      "```json",
      "{",
      '  "key":"meta-high-ticket",',
      '  "name":"Meta high ticket",',
      '  "description":"draft",',
      '  "triggerEvent":"deal.created",',
      '  "conditions":{"all":[{"path":"payload.valueCents","op":"gte","value":500000}]},',
      '  "actions":[{"type":"contact.tag","params":{"tag":"high-ticket"}}],',
      '  "mode":"active",',
      '  "priority":10',
      "}",
      "```",
    ].join("\n")

    const draft = parsePlaybookDraftFromModelText(raw)
    expect(draft.mode).toBe("draft")
    expect(draft.version).toBe(1)
    expect(draft.triggerEvent).toBe("deal.created")
    expect(validatePlaybook(draft).valid).toBe(true)
  })

  it("rejects unsafe condition roots before compile",() => {
    const template = getPlaybookTemplate("proposal_sent_followup")!
    const invalid = {
      ...template,
      conditions:{
        all:[{ path:"database.secret",op:"eq" as const,value:"x" }],
      },
    }

    const validation = validatePlaybook(invalid)
    expect(validation.valid).toBe(false)
    expect(validation.errors.join(" ")).toContain("raiz não permitida")
  })
})
