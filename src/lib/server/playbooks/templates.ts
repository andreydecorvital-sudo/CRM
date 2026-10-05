import type { PlaybookDefinition } from "./types"

export const playbookTemplates: PlaybookDefinition[] = [
  {
    key:"high_ticket_paid_lead",
    name:"Lead pago de ticket alto",
    description:"Prioriza deals novos de mídia paga acima de R$ 5 mil e garante próximo passo.",
    version:1,
    triggerEvent:"deal.created",
    conditions:{
      all:[
        { path:"payload.valueCents",op:"gte",value:500_000 },
      ],
      any:[
        { path:"payload.source",op:"contains",value:"meta" },
        { path:"payload.source",op:"contains",value:"facebook" },
        { path:"payload.source",op:"contains",value:"instagram" },
        { path:"payload.source",op:"contains",value:"google" },
      ],
    },
    actions:[
      {
        type:"contact.tag",
        params:{ tag:"lead-pago-alto-ticket",color:"#111827" },
      },
      {
        type:"task.create",
        params:{
          contactId:"{{event.contactId}}",
          dealId:"{{event.aggregateId}}",
          assignedTo:"{{event.payload.ownerUserId}}",
          title:"Priorizar lead de mídia paga",
          description:"Deal {{event.payload.title}} entrou com ticket alto. Fazer primeiro contato e registrar contexto.",
          kind:"follow_up",
          priority:"high",
          dueInMinutes:30,
        },
      },
      {
        type:"deal.follow_up",
        params:{
          dealId:"{{event.aggregateId}}",
          dueInMinutes:1440,
        },
      },
    ],
    mode:"shadow",
    priority:60,
    stopOnMatch:false,
    cooldownSeconds:0,
    tags:["sales","paid-media","high-ticket"],
  },
  {
    key:"proposal_sent_followup",
    name:"Proposta enviada com próximo passo",
    description:"Toda proposta enviada gera um follow-up comercial programado.",
    version:1,
    triggerEvent:"proposal.sent",
    conditions:{ all:[] },
    actions:[
      {
        type:"task.create",
        params:{
          contactId:"{{event.contactId}}",
          dealId:"{{event.payload.dealId}}",
          title:"Acompanhar proposta enviada",
          description:"Confirmar recebimento, entender objeções e registrar próximo passo.",
          kind:"follow_up",
          priority:"normal",
          dueInMinutes:1440,
        },
      },
    ],
    mode:"shadow",
    priority:80,
    stopOnMatch:false,
    cooldownSeconds:3600,
    tags:["proposal","follow-up"],
  },
  {
    key:"price_intent_inbound",
    name:"Intenção de preço no atendimento",
    description:"Marca e prioriza mensagens recebidas contendo intenção explícita de preço/orçamento.",
    version:1,
    triggerEvent:"message.received",
    conditions:{
      any:[
        { path:"payload.text",op:"contains",value:"preço" },
        { path:"payload.text",op:"contains",value:"valor" },
        { path:"payload.text",op:"contains",value:"orçamento" },
      ],
    },
    actions:[
      {
        type:"contact.tag",
        params:{ tag:"intencao-preco" },
      },
      {
        type:"task.create",
        params:{
          contactId:"{{event.contactId}}",
          conversationId:"{{event.payload.conversationId}}",
          title:"Responder intenção de preço",
          description:"Cliente demonstrou intenção comercial explícita. Responder e qualificar.",
          kind:"whatsapp",
          priority:"high",
          dueInMinutes:15,
        },
      },
    ],
    mode:"shadow",
    priority:50,
    stopOnMatch:false,
    cooldownSeconds:7200,
    tags:["inbox","intent","sales"],
  },
  {
    key:"won_deal_opportunity_optin",
    name:"Pós-venda com oportunidade consentida",
    description:"Exemplo seguro de mensagem de oportunidade após venda, respeitando preferência e canal do cliente.",
    version:1,
    triggerEvent:"deal.won",
    conditions:{ all:[] },
    actions:[
      {
        type:"message.queue",
        params:{
          contactId:"{{event.contactId}}",
          channel:"whatsapp",
          purpose:"opportunity",
          body:"Obrigado pela compra! Quando houver uma oportunidade realmente relevante para você, podemos avisar por aqui.",
        },
      },
    ],
    mode:"shadow",
    priority:150,
    stopOnMatch:false,
    cooldownSeconds:604800,
    tags:["post-sale","opportunity","consent"],
  },
]

export function getPlaybookTemplate(key: string) {
  return playbookTemplates.find(template => template.key === key) || null
}
