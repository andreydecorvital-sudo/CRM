import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const dir = join(process.cwd(), "supabase", "migrations")
const files = readdirSync(dir).filter(name => name.endsWith(".sql")).sort()
const contents = files.map(name => ({ name, text: readFileSync(join(dir, name), "utf8") }))
const combined = contents.map(item => item.text).join("\n\n")
const errors = []

for (const { name, text } of contents) {
  if (/set\s+search_path\s*=\s*public/i.test(text)) {
    errors.push(`${name}: SECURITY DEFINER/search_path não pode usar public.`)
  }

  const functionStarts = [...text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+/gi)]
  for (const match of functionStarts) {
    const start = match.index ?? 0
    const end = text.indexOf("$$;", start)
    if (end < 0) {
      errors.push(`${name}: função iniciada na posição ${start} sem fechamento $$;.`)
      continue
    }
    const block = text.slice(start, end + 3)
    if (/security\s+definer/i.test(block) && !/set\s+search_path\s*=\s*''/i.test(block)) {
      errors.push(`${name}: SECURITY DEFINER sem search_path vazio na função iniciada em ${start}.`)
    }
  }

  const publicDefiners = [...text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)[\s\S]{0,900}?security\s+definer/gi)]
  for (const match of publicDefiners) {
    const fn = match[1]
    const revokePattern = new RegExp(`revoke\\s+(?:all|execute)\\s+on\\s+function\\s+public\\.${fn}\\s*\\(`, "i")
    if (!revokePattern.test(text)) {
      errors.push(`${name}: public.${fn} é SECURITY DEFINER sem REVOKE explícito no mesmo arquivo.`)
    }
  }

  const views = [...text.matchAll(/create\s+or\s+replace\s+view\s+public\.([a-zA-Z0-9_]+)/gi)]
  for (const match of views) {
    const start = match.index ?? 0
    const window = text.slice(start, start + 260).toLowerCase()
    if (!window.includes("security_invoker = true")) {
      errors.push(`${name}: view public.${match[1]} sem security_invoker = true.`)
    }
  }
}

const tables = [...combined.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z0-9_]+)/gi)]
  .map(match => match[1])

for (const table of [...new Set(tables)]) {
  const rlsPattern = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i")
  if (!rlsPattern.test(combined)) {
    errors.push(`Tabela public.${table} criada sem ENABLE ROW LEVEL SECURITY em nenhuma migration.`)
  }
}

if (/grant\s+execute\s+on\s+function[\s\S]{0,300}\s+to\s+anon\b/i.test(combined)) {
  errors.push("Existe função com GRANT EXECUTE para anon; revisar superfície pública.")
}

if (errors.length) {
  console.error("Migration security validation failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Validated ${files.length} migrations: RLS, views and privileged functions OK.`)
