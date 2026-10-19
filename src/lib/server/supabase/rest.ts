type Method = "GET" | "POST" | "PATCH" | "DELETE"

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "")
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "")
  let parsed: URL
  try {
    parsed = new URL(url)
    const labels = parsed.hostname.split(".")
    if (parsed.protocol !== "https:" || labels.length !== 3 || labels[1] !== "supabase" ||
        labels[2] !== "co" || !/^[a-z0-9-]+$/i.test(labels[0]) ||
        parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port ||
        parsed.username || parsed.password) throw new Error("invalid_supabase_host")
  } catch { throw new Error("Supabase não configurado no servidor.") }
  if (!key) throw new Error("Supabase não configurado no servidor.")
  if (key.startsWith("sb_") && !key.startsWith("sb_secret_")) throw new Error("Chave Supabase de servidor inválida.")
  return { url, key, modern: key.startsWith("sb_secret_") }
}

export async function supabaseRest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const { url, key, modern } = config()
  const response = await fetch(`${url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      ...(modern ? {} : { Authorization: `Bearer ${key}` }),
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Supabase HTTP ${response.status}`)
  return (text ? JSON.parse(text) : null) as T
}
