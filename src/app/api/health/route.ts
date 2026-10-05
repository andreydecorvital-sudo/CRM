export async function GET() {
  return Response.json({ ok: true, service: "mira-crm", now: new Date().toISOString() })
}
