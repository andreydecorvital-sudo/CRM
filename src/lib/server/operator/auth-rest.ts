/**
 * Operator-only Supabase Data API client.
 * Uses the validated end-user JWT and Postgres RLS, never a service-role key.
 */
type Method = "GET"|"POST"|"PATCH"|"DELETE"

export function operatorSupabaseConfig() {
  const server = String(process.env.SUPABASE_URL||"").replace(/\/+$/,"")
  const publicUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/+$/,"")
  const url = server || publicUrl
  const key=String(process.env.SUPABASE_PUBLISHABLE_KEY
    ||process.env.SUPABASE_ANON_KEY
    ||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"")
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) ||
     (server && publicUrl && server!==publicUrl) ||
     (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")))
    return null
  return {url,key}
}

export async function operatorAuthRequest(path:string,token?:string,body?:unknown) {
  const config=operatorSupabaseConfig()
  if(!config)throw new Error("operator_not_configured")
  return fetch(`${config.url}/auth/v1${path}`,{
    method:body===undefined?"GET":"POST",
    headers:{"apikey":config.key,"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},
    body:body===undefined?undefined:JSON.stringify(body),
    cache:"no-store",
    signal:AbortSignal.timeout(10000),
  })
}
export async function operatorRest<T>(accessToken:string,method:Method,path:string,body?:unknown):Promise<T>{
  const config=operatorSupabaseConfig()
  if(!config || !accessToken || accessToken.length>8192)throw new Error("operator_not_authenticated")
  const response=await fetch(`${config.url}/rest/v1${path}`,{
    method,
    headers:{
      apikey:config.key,Authorization:`Bearer ${accessToken}`,
      "Content-Type":"application/json",
      Prefer:method==="POST"?"return=representation":method==="PATCH"?"return=representation":"return=minimal",
    },
    body:body===undefined?undefined:JSON.stringify(body),
    cache:"no-store",signal:AbortSignal.timeout(12000),
  })
  if(!response.ok){
    // Never echo potentially sensitive upstream errors to the browser.
    if(response.status===401||response.status===403)throw new Error("operator_access_denied")
    throw new Error(`operator_supabase_http_${response.status}`)
  }
  const raw=await response.text()
  return (raw?JSON.parse(raw):null) as T
}
