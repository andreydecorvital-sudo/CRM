import type { RouterCapability } from "./contracts"

export type CapabilityOwner = {
  capability: RouterCapability
  owner: string
  codePath: string
  purpose: string
  mayProposeActions: boolean
}

export const capabilityOwners: Record<RouterCapability,CapabilityOwner> = {
  acquisition: {
    capability:"acquisition",
    owner:"Acquisition",
    codePath:"src/lib/server/attribution",
    purpose:"Origem, entrada de lead e recuperação de aquisição.",
    mayProposeActions:true,
  },
  customer: {
    capability:"customer",
    owner:"Customer 360",
    codePath:"src/lib/server/customers",
    purpose:"Identidade, histórico e contexto do cliente.",
    mayProposeActions:false,
  },
  inbox: {
    capability:"inbox",
    owner:"Inbox",
    codePath:"src/lib/server/whatsapp + src/lib/server/departments",
    purpose:"Conversas, SLA, fila, handoff e atendimento.",
    mayProposeActions:true,
  },
  sales: {
    capability:"sales",
    owner:"Sales",
    codePath:"src/lib/server/tasks + domain/deals",
    purpose:"Deals, pipeline e execução comercial.",
    mayProposeActions:true,
  },
  tasks: {
    capability:"tasks",
    owner:"Next Action",
    codePath:"src/lib/server/tasks",
    purpose:"Próxima ação, follow-up e execução humana.",
    mayProposeActions:true,
  },
  proposals: {
    capability:"proposals",
    owner:"Proposals",
    codePath:"src/lib/server/proposals",
    purpose:"Orçamentos/propostas, visualização e aceite.",
    mayProposeActions:true,
  },
  lifecycle: {
    capability:"lifecycle",
    owner:"Customer Lifecycle",
    codePath:"src/lib/server/reviews + domain/customer-lifecycle",
    purpose:"Pós-venda, LTV, avaliação, recompra e reativação.",
    mayProposeActions:true,
  },
  opportunities: {
    capability:"opportunities",
    owner:"Opportunities",
    codePath:"src/lib/server/opportunities",
    purpose:"Oportunidades comunicáveis com consentimento.",
    mayProposeActions:true,
  },
  automation: {
    capability:"automation",
    owner:"Automation Engine",
    codePath:"src/lib/server/automation",
    purpose:"Workflows determinísticos explicitamente configurados.",
    mayProposeActions:false,
  },
  integrations: {
    capability:"integrations",
    owner:"Integrations",
    codePath:"src/lib/server/whatsapp + src/lib/server/email + src/lib/server/webhooks",
    purpose:"Providers, webhooks e conectividade externa.",
    mayProposeActions:true,
  },
  ai: {
    capability:"ai",
    owner:"AI Engine",
    codePath:"src/lib/server/ai",
    purpose:"Assistência e análise. Não executa writes diretamente.",
    mayProposeActions:true,
  },
  billing: {
    capability:"billing",
    owner:"SaaS Billing",
    codePath:"src/lib/server/billing",
    purpose:"Plano, limites, consumo e futura cobrança.",
    mayProposeActions:false,
  },
  privacy: {
    capability:"privacy",
    owner:"Privacy",
    codePath:"src/lib/server/privacy",
    purpose:"Preferências, exportação e direitos do titular.",
    mayProposeActions:false,
  },
  analytics: {
    capability:"analytics",
    owner:"Analytics",
    codePath:"src/lib/server/analytics",
    purpose:"Métricas, velocity, risco e observabilidade comercial.",
    mayProposeActions:false,
  },
  operations: {
    capability:"operations",
    owner:"Operations",
    codePath:"src/lib/server/router",
    purpose:"Fallback de eventos ainda sem owner especializado.",
    mayProposeActions:false,
  },
}

export function ownerForCapability(capability: RouterCapability) {
  return capabilityOwners[capability]
}
