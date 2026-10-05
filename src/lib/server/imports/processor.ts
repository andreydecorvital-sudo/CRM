import { supabaseRest } from "@/lib/server/supabase/rest"

type ImportRow = {
  id: string
  tenant_id: string
  import_id: string
  row_number: number
  raw_data: Record<string, unknown>
  status: string
}

type ImportConfig = {
  id: string
  tenant_id: string
  status: string
  mapping: Record<string, unknown>
}

function mapped(record: Record<string, unknown>, mapping: Record<string, unknown>, key: string) {
  const column = typeof mapping[key] === "string" ? String(mapping[key]) : ""
  return column ? String(record[column] ?? "").trim() : ""
}

function externalId(record: Record<string, unknown>, mapping: Record<string, unknown>) {
  return mapped(record,mapping,"externalId")
    || mapped(record,mapping,"phoneE164")
    || mapped(record,mapping,"email").toLowerCase()
}

export async function processContactImportChunk(input: {
  importId: string
  firstRow: number
  lastRow: number
}) {
  const imports = await supabaseRest<ImportConfig[]>(
    "GET",
    `/contact_imports?id=eq.${encodeURIComponent(input.importId)}&select=id,tenant_id,status,mapping&limit=1`,
  )
  const config = Array.isArray(imports) ? imports[0] : null
  if (!config) throw new Error("Importação não encontrada.")
  if (["failed","cancelled","completed"].includes(config.status)) return { skipped: true, status: config.status }

  await supabaseRest("PATCH", `/contact_imports?id=eq.${encodeURIComponent(config.id)}&status=in.(queued,staging)`, {
    status: "processing",
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  const rows = await supabaseRest<ImportRow[]>(
    "GET",
    `/contact_import_rows?import_id=eq.${encodeURIComponent(config.id)}&row_number=gte.${input.firstRow}&row_number=lte.${input.lastRow}&status=in.(pending,processing)&select=*&order=row_number.asc`,
  )

  let succeeded = 0
  let failed = 0

  for (const row of Array.isArray(rows) ? rows : []) {
    await supabaseRest("PATCH", `/contact_import_rows?id=eq.${encodeURIComponent(row.id)}&status=eq.pending`, {
      status: "processing",
      updated_at: new Date().toISOString(),
    }).catch(() => null)

    try {
      const id = externalId(row.raw_data, config.mapping)
      if (!id) throw new Error("Sem identificador: mapeie externalId, telefone ou e-mail.")

      const contact = await supabaseRest<{ id?: string }>("POST", "/rpc/crm_upsert_contact", {
        p_tenant_id: config.tenant_id,
        p_external_contact_id: id.slice(0,240),
        p_display_name: mapped(row.raw_data,config.mapping,"displayName").slice(0,240) || null,
        p_phone_e164: mapped(row.raw_data,config.mapping,"phoneE164").slice(0,32) || null,
        p_email: mapped(row.raw_data,config.mapping,"email").slice(0,320) || null,
        p_city: mapped(row.raw_data,config.mapping,"city").slice(0,160) || null,
        p_metadata: { importId: config.id, importRow: row.row_number },
      })

      await supabaseRest("PATCH", `/contact_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
        status: "succeeded",
        contact_id: contact?.id || null,
        error: null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      succeeded += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await supabaseRest("PATCH", `/contact_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
        status: "failed",
        error: message.slice(0,2000),
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      failed += 1
    }
  }

  const stats = await supabaseRest<Record<string, unknown>>("POST", "/rpc/crm_refresh_contact_import_stats", {
    p_import_id: config.id,
  })
  return { importId: config.id, succeeded, failed, stats }
}
