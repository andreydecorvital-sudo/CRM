import { parseCsv } from "./csv"
import { supabaseRest } from "@/lib/server/supabase/rest"

export type ContactImportMapping = {
  externalId?: string
  displayName?: string
  phoneE164?: string
  email?: string
  city?: string
}

export async function stageContactCsvImport(input: {
  tenantId: string
  csv: string
  filename?: string | null
  delimiter?: string
  mapping: ContactImportMapping
  createdBy?: string | null
}) {
  const parsed = parseCsv(input.csv, input.delimiter ?? ",")
  const externalKey = input.mapping.externalId || input.mapping.phoneE164 || input.mapping.email
  if (!externalKey) throw new Error("Mapeie externalId, telefone ou e-mail.")
  if (!parsed.headers.includes(externalKey)) throw new Error(`Coluna mapeada não existe: ${externalKey}`)

  const imports = await supabaseRest<Array<{ id: string }>>("POST", "/contact_imports", [{
    tenant_id: input.tenantId,
    status: "staging",
    source_filename: String(input.filename || "").trim().slice(0, 255) || null,
    delimiter: input.delimiter ?? ",",
    mapping: input.mapping,
    total_rows: parsed.rows.length,
    created_by: input.createdBy || null,
    metadata: { headers: parsed.headers },
  }])

  const importId = Array.isArray(imports) ? imports[0]?.id : null
  if (!importId) throw new Error("Não foi possível criar importação.")

  try {
    const chunkSize = 250
    for (let start = 0; start < parsed.rows.length; start += chunkSize) {
      const chunk = parsed.rows.slice(start, start + chunkSize)
      await supabaseRest("POST", "/contact_import_rows", chunk.map(row => ({
        tenant_id: input.tenantId,
        import_id: importId,
        row_number: row.rowNumber,
        raw_data: row.data,
        status: "pending",
      })))
    }

    await supabaseRest("PATCH", `/contact_imports?id=eq.${encodeURIComponent(importId)}`, {
      status: "queued",
      updated_at: new Date().toISOString(),
    })

    const jobSize = 200
    for (let offset = 0; offset < parsed.rows.length; offset += jobSize) {
      const firstRow = parsed.rows[offset].rowNumber
      const lastRow = parsed.rows[Math.min(offset + jobSize - 1, parsed.rows.length - 1)].rowNumber
      await supabaseRest("POST", "/rpc/crm_enqueue_job", {
        p_tenant_id: input.tenantId,
        p_kind: "contact_import",
        p_payload: { importId, firstRow, lastRow },
        p_dedupe_key: `contact-import:${importId}:${firstRow}-${lastRow}`,
        p_priority: 70,
        p_max_attempts: 5,
      })
    }

    return { importId, totalRows: parsed.rows.length, headers: parsed.headers }
  } catch (error) {
    await supabaseRest("PATCH", `/contact_imports?id=eq.${encodeURIComponent(importId)}`, {
      status: "failed",
      last_error: error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000),
      updated_at: new Date().toISOString(),
    }).catch(() => null)
    throw error
  }
}
