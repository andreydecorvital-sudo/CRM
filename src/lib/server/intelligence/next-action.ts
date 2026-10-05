import type {
  DealHealthInput,
  DealHealthResult,
  NextActionRecommendation,
} from "./types"

function evidence(
  health: DealHealthResult,
  codes: string[],
): Array<Record<string, unknown>> {
  return health.reasons
    .filter(reason => codes.includes(reason.code))
    .map(reason => ({
      code:reason.code,
      points:reason.points,
      message:reason.message,
      evidence:reason.evidence ?? {},
    }))
}

export function recommendNextAction(
  input: DealHealthInput,
  health: DealHealthResult,
): NextActionRecommendation | null {
  const reasonCodes = new Set(health.reasons.map(reason => reason.code))

  if (!input.ownerUserId) {
    return {
      actionType:"task.create",
      title:"Definir responsável e retomar negociação",
      reason:"A oportunidade está ativa, possui valor comercial e não tem responsável.",
      confidence:0.99,
      riskLevel:"low",
      priority:"high",
      dueInMinutes:60,
      payload:{
        contactId:input.contactId,
        dealId:input.dealId,
        title:"Definir responsável e retomar negociação",
        description:`Deal “${input.title}” está sem responsável. Definir owner e registrar o próximo passo.`,
        kind:"internal",
        priority:"high",
        dueInMinutes:60,
        guard:{ ownerMissing:true },
      },
      evidence:evidence(health,["owner_missing"]),
    }
  }

  if (health.signals.customerWaiting || health.signals.slaBreached) {
    return {
      actionType:"task.create",
      title:"Responder cliente agora",
      reason:health.signals.slaBreached
        ? "O cliente aguarda retorno e o SLA já foi ultrapassado."
        : "O cliente enviou a última mensagem e ainda aguarda resposta.",
      confidence:0.99,
      riskLevel:"low",
      priority:"urgent",
      dueInMinutes:15,
      payload:{
        contactId:input.contactId,
        dealId:input.dealId,
        conversationId:input.conversation?.id || null,
        assignedTo:input.ownerUserId,
        title:"Responder cliente agora",
        description:`Retomar o atendimento do deal “${input.title}”.`,
        kind:"whatsapp",
        priority:"urgent",
        dueInMinutes:15,
        guard:{ customerWaiting:true },
      },
      evidence:evidence(health,["customer_waiting","sla_breached"]),
    }
  }

  if (reasonCodes.has("followup_overdue")) {
    return {
      actionType:"task.create",
      title:"Executar follow-up vencido",
      reason:"A negociação possui follow-up vencido e está perdendo cadência.",
      confidence:0.99,
      riskLevel:"low",
      priority:"high",
      dueInMinutes:30,
      payload:{
        contactId:input.contactId,
        dealId:input.dealId,
        assignedTo:input.ownerUserId,
        title:"Executar follow-up vencido",
        description:`Retomar o deal “${input.title}” e registrar o resultado.`,
        kind:"follow_up",
        priority:"high",
        dueInMinutes:30,
        guard:{ followupOverdue:true },
      },
      evidence:evidence(health,["followup_overdue","task_overdue"]),
    }
  }

  if (reasonCodes.has("proposal_unviewed")) {
    return {
      actionType:"task.create",
      title:"Confirmar recebimento da proposta",
      reason:"A proposta foi enviada e permanece sem visualização.",
      confidence:0.94,
      riskLevel:"low",
      priority:health.band === "critical" ? "high" : "normal",
      dueInMinutes:120,
      payload:{
        contactId:input.contactId,
        dealId:input.dealId,
        assignedTo:input.ownerUserId,
        title:"Confirmar recebimento da proposta",
        description:`Confirmar com o cliente se recebeu a proposta do deal “${input.title}”.`,
        kind:"whatsapp",
        priority:health.band === "critical" ? "high" : "normal",
        dueInMinutes:120,
        proposalId:input.proposal?.id || null,
        guard:{ proposalStatus:"sent" },
      },
      evidence:evidence(health,["proposal_unviewed"]),
    }
  }

  if (reasonCodes.has("proposal_stale_after_view")) {
    return {
      actionType:"task.create",
      title:"Retomar proposta visualizada",
      reason:"O cliente visualizou a proposta, mas a negociação não teve retomada recente.",
      confidence:0.95,
      riskLevel:"low",
      priority:"high",
      dueInMinutes:120,
      payload:{
        contactId:input.contactId,
        dealId:input.dealId,
        assignedTo:input.ownerUserId,
        title:"Retomar proposta visualizada",
        description:`Retomar a proposta visualizada do deal “${input.title}” e identificar objeção/próximo passo.`,
        kind:"whatsapp",
        priority:"high",
        dueInMinutes:120,
        proposalId:input.proposal?.id || null,
        guard:{ proposalStatus:"viewed" },
      },
      evidence:evidence(health,["proposal_stale_after_view"]),
    }
  }

  if (!input.nextFollowupAt) {
    return {
      actionType:"deal.follow_up",
      title:"Definir próximo follow-up",
      reason:"Toda negociação ativa precisa ter um próximo passo datado.",
      confidence:0.98,
      riskLevel:"low",
      priority:health.band === "critical" || health.band === "at_risk" ? "high" : "normal",
      dueInMinutes:1440,
      payload:{
        dealId:input.dealId,
        dueInMinutes:1440,
        guard:{ followupMissing:true },
      },
      evidence:evidence(health,["followup_missing","conversation_stale","stage_stalled"]),
    }
  }

  if (reasonCodes.has("conversation_stale") || reasonCodes.has("stage_stalled")) {
    return {
      actionType:"task.create",
      title:"Retomar negociação parada",
      reason:"A oportunidade está parada além do ritmo esperado e precisa de uma ação humana.",
      confidence:0.92,
      riskLevel:"low",
      priority:health.band === "critical" ? "high" : "normal",
      dueInMinutes:240,
      payload:{
        contactId:input.contactId,
        dealId:input.dealId,
        assignedTo:input.ownerUserId,
        title:"Retomar negociação parada",
        description:`Revisar o deal “${input.title}”, contatar o cliente e registrar próximo passo.`,
        kind:"follow_up",
        priority:health.band === "critical" ? "high" : "normal",
        dueInMinutes:240,
      },
      evidence:evidence(health,["conversation_stale","stage_stalled","deal_old"]),
    }
  }

  return null
}
