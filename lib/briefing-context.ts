// Pulls all the raw data the Weekly Briefing model sees.
// Kept separate from the route so it's testable on its own.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { oauthExpiresAt } from './utils'
import { isOneOnOneSubject, type GraphEvent } from './calendar-match'

type Admin = SupabaseClient<Database>

// Shared mailbox the briefing reads upcoming 1:1s from (the manager running them).
const CALENDAR_MAILBOX = process.env.MANAGER_CALENDAR_EMAIL

// Manager running the 1:1s, used to recognize their 1:1s on the calendar.
const MANAGER_NAME = process.env.MANAGER_NAME || 'the manager'
const MANAGER_FIRST = MANAGER_NAME.split(' ')[0]

/** YYYY-MM-DD of the Monday before `weekStart`. */
export function previousMonday(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

function newAdminClient(): Admin {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type CalendarResult = { events: GraphEvent[]; error: string | null }

type TokenRefresh = { access_token: string; refresh_token?: string; expires_in: number }

// Fetch the manager's upcoming 14-day calendar. Returns [] if the integration
// isn't configured, there are no MS tokens, refresh fails, or Graph errors.
// Tries every stored MS token until one works (any token with
// Calendars.Read.Shared on the shared mailbox will do).
async function fetchManagerCalendar(admin: Admin, daysAhead = 14): Promise<CalendarResult> {
  if (!CALENDAR_MAILBOX) return { events: [], error: 'not_configured' }
  try {
    const { data: tokenRows } = await admin
      .from('microsoft_tokens')
      .select('user_id, access_token, refresh_token, expires_at')
    if (!tokenRows?.length) return { events: [], error: 'no_tokens' }

    const now = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + daysAhead)
    const startStr = now.toISOString()
    const endStr = endDate.toISOString()

    async function refresh(refreshToken: string): Promise<TokenRefresh | null> {
      const res = await fetch(
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID!,
            client_secret: process.env.AZURE_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'User.Read Calendars.Read Calendars.Read.Shared offline_access',
          }),
        }
      )
      if (!res.ok) return null
      return res.json() as Promise<TokenRefresh>
    }

    async function tryGraph(accessToken: string): Promise<GraphEvent[] | null> {
      const url = `https://graph.microsoft.com/v1.0/users/${CALENDAR_MAILBOX}/calendarview` +
        `?startDateTime=${startStr}&endDateTime=${endStr}` +
        `&$orderby=start/dateTime&$top=100` +
        `&$select=subject,start,end,isAllDay,isCancelled,organizer`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
        cache: 'no-store',
      })
      if (!res.ok) return null
      const data = (await res.json()) as { value?: GraphEvent[] }
      // Keep cancelled events, the caller needs to know about cancellations so
      // the briefing can frame "check-in not late, 1:1 was cancelled" correctly.
      return data.value || []
    }

    for (const row of tokenRows) {
      let token = row.access_token
      if (new Date(row.expires_at) <= new Date()) {
        const refreshed = await refresh(row.refresh_token)
        if (!refreshed) continue
        token = refreshed.access_token
        // save the refreshed token
        await admin.from('microsoft_tokens').update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || row.refresh_token,
          expires_at: oauthExpiresAt(refreshed.expires_in),
        }).eq('user_id', row.user_id)
      }
      const events = await tryGraph(token)
      if (events) return { events, error: null }
    }
    return { events: [], error: 'all_tokens_failed' }
  } catch (err) {
    console.error('Calendar fetch error:', err)
    return { events: [], error: 'exception' }
  }
}

// The clock the briefing is written in (the manager's local timezone).
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'UTC'

/** "Thu, Jun 4 at 10:00 AM CDT" in the app timezone. null if missing. */
function fmtMeetingLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  // iso is like "2026-05-26T16:00:00.0000000" (no Z), append Z so JS parses as UTC
  const safe = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z'
  const d = new Date(safe)
  if (isNaN(d.getTime())) return null
  // toLocaleString handles DST (CDT/CST etc.) for the zone.
  const date = d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: APP_TIMEZONE,
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: APP_TIMEZONE,
  })
  return `${date} at ${time}`
}

type Meeting = { label: string | null; subject?: string | null; is_cancelled: boolean }
type MeetingsForDR = { next_confirmed: Meeting | null; all_meetings: Meeting[] }

// This DR's 1:1s (live + cancelled) over the next 14 days, plus a derived "next
// confirmed" slot. Uses the same 1:1 matcher as the reminder cron so a plain
// meeting that merely mentions the name isn't mistaken for their 1:1.
//   {
//     next_confirmed: { label, subject } | null,    // first non-cancelled
//     all_meetings:   [{ label, is_cancelled }, …]  // ordered by start
//   }
function findMeetingsForDR(events: GraphEvent[] | null | undefined, drFullName: string | null | undefined): MeetingsForDR {
  if (!events?.length || !drFullName) {
    return { next_confirmed: null, all_meetings: [] }
  }
  const first = drFullName.split(/\s+/)[0]
  const matches: Meeting[] = events
    .filter(e => isOneOnOneSubject(e.subject, first, MANAGER_FIRST))
    .map(e => ({
      label: fmtMeetingLabel(e.start?.dateTime),
      subject: e.subject,
      is_cancelled: !!e.isCancelled,
    }))
  const next_confirmed = matches.find(m => !m.is_cancelled) || null
  return { next_confirmed, all_meetings: matches }
}

// Build the full briefing context for a given week: this week + previous week
// check-ins (for deltas), plus the calendar lookup.
export async function buildBriefingContext(weekStart: string) {
  const admin = newAdminClient()
  const lastWeek = previousMonday(weekStart)

  // Only the most recent note per direct report ends up in the briefing, and
  // meeting_notes grows by a row per person per week forever, so bound the pull
  // to the last year instead of reading the whole table into memory. A note
  // older than that isn't useful context anyway.
  const noteWindowStart = (() => {
    const d = new Date(weekStart + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 7 * 52)
    return d.toISOString().slice(0, 10)
  })()

  // none of these depend on each other, so fire them together
  const [
    { data: drs },
    { data: objectives },
    { data: checkins },
    { data: opportunities },
    { data: meetingNotes },
    calendar,
  ] = await Promise.all([
    admin.from('users')
      .select('id, full_name, email')
      .eq('role', 'direct_report')
      .order('full_name'),

    admin.from('strategic_objectives').select(`
      id, owner_id, title, short_title, target_date, opportunity_target, sort_order,
      sub_objectives ( id, title, short_title, sort_order, is_implicit, is_active )
    `).eq('is_active', true).order('sort_order'),

    admin.from('weekly_checkins').select(`
      id, sub_objective_id, submitted_by, week_start, status,
      progress_this_week, support_needed, comments, discuss_in_meeting
    `).in('week_start', [weekStart, lastWeek]),

    admin.from('objective_opportunities')
      .select('id, objective_id, customer, project_description, segment, estimated_value_text, estimated_value_number, status, created_at, updated_at')
      .order('created_at', { ascending: false }),

    admin.from('meeting_notes')
      .select('user_id, week_start, notes, updated_at')
      .gte('week_start', noteWindowStart)
      .order('week_start', { ascending: false }),

    fetchManagerCalendar(admin, 14),
  ])

  // Build per-DR rollup
  const drIds = new Set((drs || []).map(d => d.id))
  const objByOwner = new Map<string, NonNullable<typeof objectives>>()
  for (const o of (objectives || [])) {
    if (!drIds.has(o.owner_id)) continue
    if (!objByOwner.has(o.owner_id)) objByOwner.set(o.owner_id, [])
    objByOwner.get(o.owner_id)!.push(o)
  }

  // Group opportunities by objective once, rather than re-scanning the full list
  // for every objective in the rollup below.
  const oppsByObjective = new Map<string, NonNullable<typeof opportunities>>()
  for (const op of (opportunities || [])) {
    if (!oppsByObjective.has(op.objective_id)) oppsByObjective.set(op.objective_id, [])
    oppsByObjective.get(op.objective_id)!.push(op)
  }

  // Index check-ins by sub_objective_id and week
  type Checkin = NonNullable<typeof checkins>[number]
  const checkinIdx = new Map<string, Checkin>() // key = `${sub_id}|${week_start}`
  for (const c of (checkins || [])) {
    checkinIdx.set(`${c.sub_objective_id}|${c.week_start}`, c)
  }

  // Index latest meeting notes per DR
  type MeetingNote = NonNullable<typeof meetingNotes>[number]
  const latestNoteByDR = new Map<string, MeetingNote>()
  for (const n of (meetingNotes || [])) {
    if (!latestNoteByDR.has(n.user_id)) latestNoteByDR.set(n.user_id, n)
  }

  const drRollups = (drs || []).map(dr => {
    const drObjectives = (objByOwner.get(dr.id) || []).map(o => {
      const subs = (o.sub_objectives || [])
        .filter(s => s.is_active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(sub => ({
          id: sub.id,
          title: sub.is_implicit ? null : (sub.short_title || sub.title),
          this_week: checkinIdx.get(`${sub.id}|${weekStart}`) || null,
          last_week: checkinIdx.get(`${sub.id}|${lastWeek}`) || null,
        }))
      const oppList = oppsByObjective.get(o.id) || []
      return {
        title: o.short_title || o.title,
        target_date: o.target_date,
        opportunity_target: o.opportunity_target,
        opportunity_count: oppList.length,
        opportunities: o.opportunity_target ? oppList.map(op => ({
          customer: op.customer,
          desc: op.project_description,
          value: op.estimated_value_text,
          created_at: op.created_at,
        })) : undefined,
        sub_objectives: subs,
      }
    })

    const mtg = findMeetingsForDR(calendar.events, dr.full_name)
    const note = latestNoteByDR.get(dr.id)

    return {
      id: dr.id,
      name: dr.full_name,
      objectives: drObjectives,
      upcoming_meeting: mtg.next_confirmed,             // for the talking_points label
      meetings_next_14d: mtg.all_meetings,              // includes cancellations
      latest_meeting_note: note ? {
        week_start: note.week_start,
        excerpt: (note.notes || '').slice(0, 600),
        updated_at: note.updated_at,
      } : null,
    }
  })

  return {
    week_start: weekStart,
    previous_week_start: lastWeek,
    calendar_status: calendar.error || 'ok',
    direct_reports: drRollups,
  }
}
