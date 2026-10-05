import { supabaseRest } from "@/lib/server/supabase/rest"

export type BusinessInterval = { start: string; end: string }
export type WeeklySchedule = Record<string, BusinessInterval[]>

export async function loadBusinessCalendar(tenantId: string, calendarId?: string | null) {
  const filter = calendarId
    ? `id=eq.${encodeURIComponent(calendarId)}`
    : "is_default=eq.true"

  const rows = await supabaseRest<Array<{
    id: string
    tenant_id: string
    name: string
    timezone: string
    weekly_schedule: WeeklySchedule
    active: boolean
  }>>(
    "GET",
    `/business_calendars?tenant_id=eq.${encodeURIComponent(tenantId)}&${filter}&active=eq.true&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function loadBusinessHolidays(tenantId: string, calendarId: string, from: string, to: string) {
  const rows = await supabaseRest<Array<{
    holiday_date: string
    name: string
    full_day: boolean
    intervals: BusinessInterval[]
  }>>(
    "GET",
    `/business_holidays?tenant_id=eq.${encodeURIComponent(tenantId)}&calendar_id=eq.${encodeURIComponent(calendarId)}&holiday_date=gte.${encodeURIComponent(from)}&holiday_date=lte.${encodeURIComponent(to)}&select=holiday_date,name,full_day,intervals&order=holiday_date.asc`,
  )
  return Array.isArray(rows) ? rows : []
}
