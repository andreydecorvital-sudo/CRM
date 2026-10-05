import { supabaseRest } from "@/lib/server/supabase/rest"

type EntityType = "contact" | "deal" | "conversation" | "proposal"

export async function setCustomFieldValue(input: {
  tenantId: string
  definitionId: string
  entityType: EntityType
  entityId: string
  value: unknown
}) {
  const existing = await supabaseRest<Array<{ id: string }>>(
    "GET",
    `/custom_field_values?definition_id=eq.${encodeURIComponent(input.definitionId)}&entity_id=eq.${encodeURIComponent(input.entityId)}&select=id&limit=1`,
  )

  const body = {
    tenant_id: input.tenantId,
    definition_id: input.definitionId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    value: input.value,
    updated_at: new Date().toISOString(),
  }

  if (Array.isArray(existing) && existing[0]?.id) {
    await supabaseRest("PATCH", `/custom_field_values?id=eq.${encodeURIComponent(existing[0].id)}`, body)
    return { id: existing[0].id, updated: true }
  }

  const created = await supabaseRest<Array<{ id: string }>>("POST", "/custom_field_values", [body])
  return { id: Array.isArray(created) ? created[0]?.id ?? null : null, updated: false }
}
