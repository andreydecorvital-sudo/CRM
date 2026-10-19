import { randomUUID } from "node:crypto"
import { supabaseRest } from "@/lib/server/supabase/rest"
import type { Operator } from "./session"

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const qs=(value:string)=>encodeURIComponent(value)
const limited=(value:string, max=12000)=>value.trim().slice(0,max)

type ConversationRow = {
  id:string; tenant_id:string; contact_id:string; channel:string; status:string; category:string;
  priority:string; ai_mode:string; summary:string|null; unread_count:number;
  assigned_to:string|null; department_id:string|null; last_message_at:string|null;
  last_inbound_at:string|null; last_outbound_at:string|null
}
type ContactRow={id:string;display_name:string;phone_e164:string|null;email:string|null;city:string|null;temperature:string}
type MessageRow={id:string;direction:"inbound"|"outbound";actor:string;text:string;status:string;created_at:string;sent_at:string|null}
type DepartmentRow={id:string;name:string}

export type InboxConversation={
  id:string;contactId:string;name:string;phone:string|null;city:string|null;temperature:string;
  channel:string; status:string;category:string;priority:string;aiMode:string;unread:number;
  assignedTo:string|null;department:string|null;summary:string|null;lastAt:string|null;lastInboundAt:string|null
}
export type InboxThread={conversation:InboxConversation;messages:MessageRow[];outbound:Array<{id:string;body:string;status:string;created_at:string}>}

async function contactMap(tenant:string,ids:string[]) {
  const unique=[...new Set(ids.filter(x=>UUID.test(x)))]
  if(!unique.length)return new Map<string,ContactRow>()
  const rows=await supabaseRest<ContactRow[]>("GET",`/contacts?tenant_id=eq.${tenant}&id=in.(${unique.join(",")})&select=id,display_name,phone_e164,email,city,temperature&limit=100`)
  return new Map((rows||[]).map(c=>[c.id,c]))
}
async function departmentMap(tenant:string,ids:string[]) {
  const unique=[...new Set(ids.filter(x=>UUID.test(x)))]
  if(!unique.length)return new Map<string,DepartmentRow>()
  const rows=await supabaseRest<DepartmentRow[]>("GET",`/departments?tenant_id=eq.${tenant}&id=in.(${unique.join(",")})&select=id,name&limit=100`)
  return new Map((rows||[]).map(d=>[d.id,d]))
}
function view(row:ConversationRow,contact?:ContactRow,dept?:DepartmentRow):InboxConversation {
  return {
    id:row.id,contactId:row.contact_id,name:contact?.display_name||"Contato",
    phone:contact?.phone_e164||null,city:contact?.city||null,temperature:contact?.temperature||"unknown",
    channel:row.channel,status:row.status,category:row.category,priority:row.priority,
    aiMode:row.ai_mode,unread:row.unread_count,assignedTo:row.assigned_to,
    department:dept?.name||null,summary:row.summary,lastAt:row.last_message_at,
    lastInboundAt:row.last_inbound_at,
  }
}

async function getRow(tenant:string,id:string) {
  if(!UUID.test(id))return null
  const rows=await supabaseRest<ConversationRow[]>("GET",
    `/conversations?tenant_id=eq.${tenant}&id=eq.${id}&select=id,tenant_id,contact_id,channel,status,category,priority,ai_mode,summary,unread_count,assigned_to,department_id,last_message_at,last_inbound_at,last_outbound_at&limit=1`)
  return rows?.[0]||null
}
export async function listInbox(operator:Operator) {
  const tenant=operator.tenantId
  const rows=await supabaseRest<ConversationRow[]>("GET",
    `/conversations?tenant_id=eq.${tenant}&select=id,tenant_id,contact_id,channel,status,category,priority,ai_mode,summary,unread_count,assigned_to,department_id,last_message_at,last_inbound_at,last_outbound_at&order=last_message_at.desc.nullslast&limit=80`)
  const [contacts,depts]=await Promise.all([contactMap(tenant,rows.map(x=>x.contact_id)),departmentMap(tenant,rows.map(x=>x.department_id||""))])
  return rows.map(row=>view(row,contacts.get(row.contact_id),depts.get(row.department_id||"")))
}
export async function readThread(operator:Operator,id:string):Promise<InboxThread|null> {
  const row=await getRow(operator.tenantId,id)
  if(!row)return null
  const tenant=operator.tenantId
  const [contacts,depts,messages,outbound]=await Promise.all([
    contactMap(tenant,[row.contact_id]),departmentMap(tenant,[row.department_id||""]),
    supabaseRest<MessageRow[]>("GET",`/messages?tenant_id=eq.${tenant}&conversation_id=eq.${id}&select=id,direction,actor,text,status,created_at,sent_at&order=created_at.desc&limit=150`),
    supabaseRest<Array<{id:string;body:string;status:string;created_at:string}>>("GET",`/outbound_messages?tenant_id=eq.${tenant}&conversation_id=eq.${id}&status=in.(pending,queued,sending,failed,suppressed)&select=id,body,status,created_at&order=created_at.desc&limit=20`),
  ])
  return {conversation:view(row,contacts.get(row.contact_id),depts.get(row.department_id||"")),messages:(messages||[]).reverse(),outbound:outbound||[]}
}
export async function changeConversation(operator:Operator,id:string,action:string) {
  if(operator.role==="viewer")throw new Error("operator_read_only")
  const row=await getRow(operator.tenantId,id)
  if(!row)throw new Error("conversation_not_found")
  const own= row.assigned_to === operator.userId
  const manager=["owner","admin","manager"].includes(operator.role)
  const now=new Date().toISOString()
  let change:Record<string,unknown>
  if(action==="claim"){
    if(row.assigned_to && !own && !manager)throw new Error("conversation_assigned_to_other")
    change={assigned_to:operator.userId,status:"open",ai_mode:"off",updated_at:now}
  }else if(action==="release"){
    if(!own && !manager)throw new Error("not_conversation_owner")
    change={assigned_to:null,updated_at:now}
  }else if(action==="resolve"){
    if(!own && !manager)throw new Error("claim_before_resolving")
    change={status:"resolved",resolved_at:now,updated_at:now}
  }else if(action==="reopen"){
    if(row.status!=="resolved")throw new Error("conversation_not_resolved")
    change={status:"open",resolved_at:null,updated_at:now}
  }else if(action==="mark_read"){
    change={unread_count:0,updated_at:now}
  }else throw new Error("unknown_action")
  await supabaseRest("PATCH",`/conversations?tenant_id=eq.${operator.tenantId}&id=eq.${id}`,change)
  const updated=await getRow(operator.tenantId,id)
  if(!updated)throw new Error("post_write_verification_failed")
  for(const [key,value] of Object.entries(change)) {
    if (key==="updated_at")continue
    if((updated as unknown as Record<string,unknown>)[key]!==value) {
      // resolved_at timestamps are persisted exactly by Supabase/Postgres.
      if(key!=="resolved_at")throw new Error("post_write_verification_failed")
    }
  }
  return updated
}
export async function queueOperatorReply(operator:Operator,id:string,bodyRaw:string,operationId:string,confirmed:boolean) {
  if(process.env.CRM_OPERATOR_SEND_ENABLED!=="true")throw new Error("outbound_not_enabled")
  if(!confirmed)throw new Error("confirmation_required")
  if(!UUID.test(operationId))throw new Error("invalid_operation_id")
  const body=limited(bodyRaw)
  if(!body||body.length>12000||bodyRaw.length>12000)throw new Error("invalid_message")
  const row=await getRow(operator.tenantId,id)
  if(!row)throw new Error("conversation_not_found")
  if(row.status==="resolved"||row.channel!=="whatsapp")throw new Error("conversation_unavailable")
  if(row.assigned_to!==operator.userId)throw new Error("claim_before_sending")
  if(row.ai_mode!=="off")throw new Error("human_takeover_required")
  if(!row.last_inbound_at || Date.now()-new Date(row.last_inbound_at).getTime()>24*60*60*1000) {
    throw new Error("outside_customer_service_window")
  }
  const connected=await supabaseRest<Array<{id:string}>>("GET",
    `/whatsapp_connections?tenant_id=eq.${operator.tenantId}&status=eq.connected&select=id&limit=1`)
  if(!connected?.length)throw new Error("whatsapp_not_connected")
  const dedupeKey=`operator:${id}:${operationId}`
  const existing=await supabaseRest<Array<{id:string;status:string}>>("GET",
    `/outbound_messages?tenant_id=eq.${operator.tenantId}&dedupe_key=eq.${qs(dedupeKey)}&select=id,status&limit=1`)
  if(existing?.[0])return existing[0]
  const payload=[{
    tenant_id:operator.tenantId,contact_id:row.contact_id,conversation_id:id,
    channel:"whatsapp",purpose:"support",body,status:"pending",scheduled_at:new Date().toISOString(),
    dedupe_key:dedupeKey,created_by:operator.userId,
    metadata:{actor:"human",source:"internal-inbox",operatorId:operator.userId},
  }]
  const sent=await supabaseRest<Array<{id:string;status:string}>>("POST","/outbound_messages",payload)
  if(!sent?.[0])throw new Error("queue_verification_failed")
  return sent[0]
}
