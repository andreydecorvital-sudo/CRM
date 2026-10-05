export function parseCsv(text: string, delimiter = ",") {
  if (delimiter.length !== 1) throw new Error("Delimiter deve ter 1 caractere.")
  if (text.length > 8_000_000) throw new Error("CSV acima do limite de 8 MB.")

  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell.trim())
      cell = ""
    } else if (char === "\n") {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") {
      cell += char
    }
  }

  if (quoted) throw new Error("CSV inválido: aspas não fechadas.")
  if (cell.length || row.length) {
    row.push(cell.trim())
    rows.push(row)
  }

  const nonEmpty = rows.filter(values => values.some(value => value !== ""))
  if (nonEmpty.length < 2) throw new Error("CSV precisa de cabeçalho e pelo menos uma linha.")

  const headers = nonEmpty[0].map((header, index) => {
    const normalized = header.replace(/^\uFEFF/, "").trim()
    return normalized || `column_${index + 1}`
  })

  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index)
  if (duplicates.length) throw new Error(`Cabeçalhos duplicados: ${[...new Set(duplicates)].join(", ")}`)

  const data = nonEmpty.slice(1).map((values, rowIndex) => {
    const record: Record<string, string> = {}
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = values[index] ?? ""
    }
    return { rowNumber: rowIndex + 2, data: record }
  })

  if (data.length > 20_000) throw new Error("CSV acima do limite de 20.000 contatos por importação.")
  return { headers, rows: data }
}
