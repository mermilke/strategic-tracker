import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import type { Database } from '../../../../lib/database.types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Minimal shape of a Microsoft Graph calendar event, just the fields we read.
type GraphEvent = {
  subject?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  isCancelled?: boolean
}

// A calendar event tagged with its date/week in the DR's timezone.
type TaggedMeeting = {
  meeting: GraphEvent
  date: string
  week: string
  isCancelled: boolean
  isPast: boolean
}

// Each direct report carries their own IANA timezone on users.timezone so the
// email lands at 4pm in their local clock. This default covers anyone who
// hasn't had one set yet.
const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || 'UTC'

// Manager running the 1:1s and the mailbox whose calendar we read. Both come
// from env so the app isn't tied to one organization.
const MANAGER_NAME = process.env.MANAGER_NAME || 'the manager'
const MANAGER_FIRST = MANAGER_NAME.split(' ')[0].toLowerCase()
const CALENDAR_MAILBOX = process.env.MANAGER_CALENDAR_EMAIL

// Candidate calendar-subject patterns for a DR's 1:1, built from their first
// name and the manager's. Covers the common ways people title recurring 1:1s
// ("Dana 121", "Sam - Dana", "Dana / Sam"). Calendars that don't follow any of
// these still match on a bare first-name check in isOneOnOneFor().
function meetingPatternsFor(firstName: string) {
  const dr = firstName.toLowerCase()
  return [
    `${dr} 121`, `${dr} 1:1`, `${dr} 1-1`,
    `${MANAGER_FIRST} - ${dr}`, `${dr} - ${MANAGER_FIRST}`,
    `${MANAGER_FIRST} / ${dr}`, `${dr} / ${MANAGER_FIRST}`,
  ]
}

function escapeHtml(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isTargetHour(timezone: string, targetHour: number) {
  // Only fire when the DR's local hour is exactly the target. Multiple UTC cron
  // firings (one per timezone x DST combo) line up so each DR gets the email at
  // 4pm in their own clock.
  const now = new Date()
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  return localTime.getHours() === targetHour
}

function getTomorrowDateInTimezone(timezone: string) {
  const now = new Date()
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const tomorrow = new Date(localNow)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split('T')[0]
}

function getTodayDateInTimezone(timezone: string) {
  const now = new Date()
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  return localNow.toISOString().split('T')[0]
}

function verifyCronAuth(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: with no secret configured the endpoint stays locked rather
  // than open to anyone, since it can send email.
  if (!cronSecret) return false
  return authHeader === `Bearer ${cronSecret}`
}

async function getAccessToken(supabaseAdmin: SupabaseClient<Database>) {
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id')
    .in('role', ['manager', 'admin'])

  if (!users?.length) return null

  for (const user of users) {
    const { data: tokenData } = await supabaseAdmin
      .from('microsoft_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!tokenData) continue

    let accessToken = tokenData.access_token

    if (new Date(tokenData.expires_at) <= new Date()) {
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID!,
            client_secret: process.env.AZURE_CLIENT_SECRET!,
            refresh_token: tokenData.refresh_token,
            grant_type: 'refresh_token',
            scope: 'User.Read Calendars.Read Calendars.Read.Shared offline_access',
          }),
        }
      )
      if (!tokenRes.ok) continue
      const tokens = await tokenRes.json()
      accessToken = tokens.access_token
      await supabaseAdmin.from('microsoft_tokens').update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      }).eq('user_id', user.id)
    }

    return accessToken
  }
  return null
}

// Does this event look like the DR's 1:1? Either it matches a name-based
// pattern, or it mentions the DR by first name and reads like a 1:1.
function isOneOnOneFor(event: GraphEvent, firstName: string) {
  const subject = event.subject?.toLowerCase() || ''
  const patterns = meetingPatternsFor(firstName)
  if (patterns.some(p => subject.includes(p))) return true
  const looksLike11 = subject.includes('121') || subject.includes('1:1') || subject.includes('1-1')
  return looksLike11 && subject.includes(firstName)
}

function findAllMeetingsForDR(events: GraphEvent[], drName: string) {
  const firstName = drName.split(' ')[0].toLowerCase()
  return events.filter(e => isOneOnOneFor(e, firstName))
}

// Monday of the current week as YYYY-MM-DD in the given timezone
function getMondayOfWeekInTz(timezone: string) {
  const now = new Date()
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const dayOfWeek = localNow.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(localNow)
  monday.setDate(monday.getDate() + daysToMonday)
  return monday.toISOString().split('T')[0]
}

// Convert Graph dateTime (UTC, possibly without Z suffix) to a YYYY-MM-DD date
// in the given timezone, i.e. what the DR sees on their wall calendar.
function meetingDateInTz(meetingStartDateTime: string | null | undefined, timezone: string): string | null {
  if (!meetingStartDateTime) return null
  // all-day events come back as YYYY-MM-DD with no time, use as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(meetingStartDateTime)) return meetingStartDateTime
  // append Z if missing so JS parses as UTC, not local
  const iso = /Z$/.test(meetingStartDateTime) || /[+-]\d{2}:?\d{2}$/.test(meetingStartDateTime)
    ? meetingStartDateTime
    : meetingStartDateTime + 'Z'
  // en-CA formats as YYYY-MM-DD
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone })
}

// Returns YYYY-MM-DD of the most recent weekday at-or-before (date - 1 day).
// e.g. dayBefore('2026-05-13' (Wed)) === '2026-05-12' (Tue)
//      dayBefore('2026-05-11' (Mon)) === '2026-05-08' (Fri, skipping weekend)
function getDayBeforeWeekday(yyyymmdd: string) {
  const d = new Date(yyyymmdd + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1)
  }
  return d.toISOString().split('T')[0]
}

// Returns YYYY-MM-DD of the Monday of the week containing the given date.
function getMondayOfDate(yyyymmdd: string) {
  const d = new Date(yyyymmdd + 'T00:00:00')
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

// Meeting start as a unix ms timestamp (UTC). Lets us tell whether the meeting
// has actually started yet rather than just comparing dates, which matters when
// the meeting is later today than the 4pm cron.
function meetingStartMs(meetingStartDateTime: string | null | undefined): number | null {
  if (!meetingStartDateTime) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(meetingStartDateTime)) {
    return new Date(meetingStartDateTime + 'T00:00:00Z').getTime()
  }
  const iso = /Z$/.test(meetingStartDateTime) || /[+-]\d{2}:?\d{2}$/.test(meetingStartDateTime)
    ? meetingStartDateTime
    : meetingStartDateTime + 'Z'
  return new Date(iso).getTime()
}

function buildReminderEmail(firstName: string, meetingSubject: string, meetingDate: string, meetingTime: string, siteUrl: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="display: inline-block; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: #0F172A;">Strategic Execution Platform</span>
      </div>
      <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #1a1a2e;">Hi ${firstName},</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
        This is a friendly reminder that your <strong>1:1 meeting with ${MANAGER_NAME}</strong> is tomorrow and your weekly check-in has not been completed yet.
      </p>
      <div style="background: #f0fafb; border: 2px solid #2563EB; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #2563EB; font-weight: 700; margin-bottom: 10px;">
          Upcoming Meeting
        </div>
        <div style="font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 6px;">
          ${meetingSubject}
        </div>
        <div style="font-size: 15px; color: #333; font-weight: 500;">
          ${meetingDate} at ${meetingTime}
        </div>
      </div>
      <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
        Please take a few minutes to update your objectives and status before the meeting so ${MANAGER_NAME} can review them ahead of time.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${siteUrl}/checkin" style="height:54px;v-text-anchor:middle;width:300px;" arcsize="50%" fillcolor="#D62027">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Complete Check-in</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #D62027; border-radius: 25px; text-align: center;">
              <a href="${siteUrl}/checkin"
                 style="display: inline-block; color: #ffffff; text-decoration: none; padding: 16px 48px; font-size: 16px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Complete Check-in
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
        This is an automated reminder from Strategic Execution Platform.<br />
        Please do not reply to this email.
      </p>
    </div>
  `
}

function buildOverdueEmail(firstName: string, meetingSubject: string, meetingDate: string, meetingTime: string, siteUrl: string) {
  const dateLine = meetingTime ? `${meetingDate} at ${meetingTime}` : meetingDate
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="display: inline-block; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: #0F172A;">Strategic Execution Platform</span>
      </div>
      <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #1a1a2e;">Hi ${firstName},</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
        Your weekly check-in is <strong>overdue</strong>. Your <strong>1:1 meeting with ${MANAGER_NAME}</strong> this week was on <strong>${dateLine}</strong>, and your check-in still hasn't been submitted.
      </p>
      <div style="background: #FEF2F2; border: 2px solid #D62027; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #D62027; font-weight: 700; margin-bottom: 10px;">
          Check-in Overdue
        </div>
        <div style="font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 6px;">
          ${meetingSubject}
        </div>
        <div style="font-size: 15px; color: #333; font-weight: 500;">
          ${dateLine}
        </div>
      </div>
      <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
        Please take a few minutes to update your objectives and status now so ${MANAGER_NAME} can review your progress.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${siteUrl}/checkin" style="height:54px;v-text-anchor:middle;width:300px;" arcsize="50%" fillcolor="#D62027">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Complete Check-in</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #D62027; border-radius: 25px; text-align: center;">
              <a href="${siteUrl}/checkin"
                 style="display: inline-block; color: #ffffff; text-decoration: none; padding: 16px 48px; font-size: 16px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Complete Check-in
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
        This is an automated reminder from Strategic Execution Platform.<br />
        Please do not reply to this email.
      </p>
    </div>
  `
}

function buildCancelledEmail(firstName: string, siteUrl: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="display: inline-block; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: #0F172A;">Strategic Execution Platform</span>
      </div>
      <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #1a1a2e;">Hi ${firstName},</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
        It looks like your <strong>1:1 meeting with ${MANAGER_NAME}</strong> may have been cancelled or moved this week. However, your weekly check-in has not been completed yet.
      </p>
      <div style="background: #FFF7ED; border: 2px solid #F59E0B; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #F59E0B; font-weight: 700; margin-bottom: 10px;">
          Meeting Status
        </div>
        <div style="font-size: 16px; font-weight: 600; color: #1a1a2e;">
          Your 1:1 does not appear on the calendar this week
        </div>
      </div>
      <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
        Even though the meeting may not take place, ${MANAGER_NAME} may reach out separately to coordinate a touch-base or quick call. In the meantime, please update your objectives and status so they stay informed when they review the tracker.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${siteUrl}/checkin" style="height:54px;v-text-anchor:middle;width:300px;" arcsize="50%" fillcolor="#D62027">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Complete Check-in</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #D62027; border-radius: 25px; text-align: center;">
              <a href="${siteUrl}/checkin"
                 style="display: inline-block; color: #ffffff; text-decoration: none; padding: 16px 48px; font-size: 16px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Complete Check-in
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
        This is an automated reminder from Strategic Execution Platform.<br />
        Please do not reply to this email.
      </p>
    </div>
  `
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Test-mode flags, handy for manual one-off sends from the GitHub Actions
  // workflow_dispatch UI: ?test=1 skips the time-of-day and dedupe checks,
  // ?email= filters to a single DR so we don't accidentally hit production users.
  const url = new URL(request.url)
  const testMode = url.searchParams.get('test') === '1'
  const filterEmail = (url.searchParams.get('email') || '').toLowerCase().trim()

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Resend not configured' }, { status: 500 })
  }

  const resend = new Resend(resendKey)
  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  if (!CALENDAR_MAILBOX) {
    return NextResponse.json({ error: 'Calendar integration not configured' }, { status: 501 })
  }

  try {
    const accessToken = await getAccessToken(supabaseAdmin)
    if (!accessToken) {
      return NextResponse.json({ error: 'No calendar access token available' }, { status: 500 })
    }

    // all direct reports (no users.is_active column; is_active lives on objectives)
    let drQuery = supabaseAdmin
      .from('users')
      .select('id, full_name, email, timezone')
      .eq('role', 'direct_report')
    if (filterEmail) drQuery = drQuery.ilike('email', filterEmail)
    const { data: directReports } = await drQuery

    if (!directReports?.length) {
      return NextResponse.json({ message: filterEmail ? `No DR matched email ${filterEmail}` : 'No active direct reports', sent: 0 })
    }

    const nowUTC = new Date()
    const tempDate = new Date(nowUTC.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE }))
    const dayOfWeek = tempDate.getDay()
    const monday = new Date(tempDate)
    monday.setDate(tempDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const weekStart = monday.toISOString().split('T')[0]

    const results: any[] = []

    for (const dr of directReports) {
      const tz = dr.timezone || DEFAULT_TIMEZONE
      const firstName = dr.full_name?.split(' ')[0]
      if (!firstName) continue

      // only process at 4pm (16:00) in this DR's timezone, skipped in test mode
      if (!testMode && !isTargetHour(tz, 16)) {
        results.push({ user: dr.full_name, status: 'not_4pm_yet', timezone: tz })
        continue
      }

      // Skip if we already sent a reminder in the last 23 hours (not in test mode).
      // Dedupe is daily (used to be per-week) so DRs get nagged each day until they
      // submit. The already_submitted check below stops the nag the moment they do.
      if (!testMode) {
        const dedupeCutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
        const { data: existingLog } = await supabaseAdmin
          .from('reminder_log')
          .select('id')
          .eq('user_id', dr.id)
          .gte('sent_at', dedupeCutoff)
          .limit(1)

        if ((existingLog?.length ?? 0) > 0) {
          results.push({ user: dr.full_name, status: 'already_sent_today' })
          continue
        }
      }

      // skip DRs who aren't onboarded yet (no objectives configured)
      const { data: subObjs } = await supabaseAdmin
        .from('sub_objectives')
        .select('id, strategic_objectives!inner(owner_id, is_active)')
        .eq('strategic_objectives.owner_id', dr.id)
        .eq('strategic_objectives.is_active', true)
        .eq('is_active', true)

      const subIds = subObjs?.map(s => s.id) || []

      if (subIds.length === 0) {
        results.push({ user: dr.full_name, status: 'no_objectives_yet' })
        continue
      }

      // Pull the manager's calendar across last/this/next week to handle cross-week
      // cases: a Friday reminder for Monday's meeting, or an overdue that carries
      // over until next week's day-before.
      const todayDate = getTodayDateInTimezone(tz)
      const todayObj = new Date(todayDate + 'T00:00:00')
      const lookbackObj = new Date(todayObj); lookbackObj.setDate(lookbackObj.getDate() - 7)
      const lookaheadObj = new Date(todayObj); lookaheadObj.setDate(lookaheadObj.getDate() + 14)
      const lookbackStr = lookbackObj.toISOString().split('T')[0]
      const lookaheadStr = lookaheadObj.toISOString().split('T')[0]

      const calRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${CALENDAR_MAILBOX}/calendarview?startDateTime=${lookbackStr}T00:00:00&endDateTime=${lookaheadStr}T23:59:59&$orderby=start/dateTime&$top=100&$select=subject,start,end,isCancelled`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'outlook.timezone="UTC"',
          },
          cache: 'no-store',
        }
      )

      let allDrMeetings: GraphEvent[] = []
      if (calRes.ok) {
        const calData = await calRes.json()
        // keep cancelled events, they trigger reminders too: a cancelled future
        // one on its day-before, or a cancelled past one with no same-week
        // replacement, both fire the CANCELLED/MOVED email
        allDrMeetings = findAllMeetingsForDR(calData.value || [], dr.full_name)
      }

      // Tag every meeting with its date in the DR's TZ and past/future status by
      // TIME. Past = startTime <= now, so a 6pm meeting with a 4pm cron is still future.
      const nowMs = Date.now()
      const meetings = allDrMeetings
        .map(m => {
          const startMs = meetingStartMs(m.start?.dateTime || m.start?.date)
          return {
            meeting: m,
            date: meetingDateInTz(m.start?.dateTime || m.start?.date, tz),
            week: '', // computed below
            isCancelled: !!m.isCancelled,
            isPast: startMs !== null && startMs <= nowMs,
          }
        })
        .filter((x): x is TaggedMeeting => !!x.date)
      meetings.forEach(x => { x.week = getMondayOfDate(x.date) })
      meetings.sort((a, b) => a.date.localeCompare(b.date))

      if (meetings.length === 0) {
        // no 1:1 in the window at all, treat the DR as inactive and don't nag (Q3)
        results.push({ user: dr.full_name, status: 'no_meeting_cycle' })
        continue
      }

      // Pick nextIntended, the upcoming meeting we care about. For each future
      // week the intended meeting is the earliest LIVE one, or the earliest
      // cancelled if none are live. nextIntended is then the intended meeting of
      // the earliest such week, so Wed-cancelled + Fri-live resolves to Fri.
      const futureByWeek: Record<string, TaggedMeeting[]> = {}
      for (const m of meetings) {
        if (!m.isPast) {
          if (!futureByWeek[m.week]) futureByWeek[m.week] = []
          futureByWeek[m.week].push(m)
        }
      }
      const futureWeeks = Object.keys(futureByWeek).sort()
      let nextIntended: TaggedMeeting | null = null
      for (const week of futureWeeks) {
        const wkMeetings = futureByWeek[week]
        const live = wkMeetings.find(x => !x.isCancelled)
        const cancelled = wkMeetings.find(x => x.isCancelled)
        nextIntended = live || cancelled || null
        if (nextIntended) break
      }

      // Pick lastPast, the most recent past meeting (live or cancelled). A
      // cancelled past one still counts: the Wed->Mon-week-1 move means Wed was a
      // missed cycle we should still email about (Q5A). Suppressed later if a
      // future LIVE replacement exists in the same week (QB same-week move).
      const pastMeetings = meetings.filter(x => x.isPast)
      const lastPast = pastMeetings[pastMeetings.length - 1] || null

      // decide email type and target
      let targetMeeting: GraphEvent | null = null
      let targetIsCancelled = false
      let emailType: 'reminder' | 'overdue' | 'cancelled' | null = null

      if (nextIntended) {
        const dayBefore = getDayBeforeWeekday(nextIntended.date)
        if (todayDate >= dayBefore) {
          // day-before window has opened
          targetMeeting = nextIntended.meeting
          targetIsCancelled = nextIntended.isCancelled
          emailType = nextIntended.isCancelled ? 'cancelled' : 'reminder'
        }
      }

      if (!targetMeeting && lastPast) {
        // No upcoming day-before reminder applies, so consider a past-meeting
        // follow-up. Suppress if the same week has a future LIVE meeting (Wed
        // cancelled + Fri live waits for Thursday's reminder; Mon+Thu waits for Wed's).
        const liveFutureSameWeek = meetings.find(x =>
          !x.isPast && !x.isCancelled && x.week === lastPast.week
        )
        if (!liveFutureSameWeek) {
          targetMeeting = lastPast.meeting
          targetIsCancelled = lastPast.isCancelled
          emailType = lastPast.isCancelled ? 'cancelled' : 'overdue'
        }
      }

      if (!targetMeeting) {
        // either too early for next-intended's day-before, or the past meeting is
        // suppressed because a live replacement is coming up this week
        results.push({ user: dr.full_name, status: 'no_action_needed' })
        continue
      }

      // Work out the target week and check for submissions. Target week is the
      // meeting's week, but if the target is in a PAST week, a check-in submitted
      // for the CURRENT week also buys peace (Q4B).
      const targetDate = meetingDateInTz(targetMeeting.start?.dateTime || targetMeeting.start?.date, tz) || todayDate
      const targetWeekStart = getMondayOfDate(targetDate)
      const currentWeekStart = getMondayOfDate(todayDate)

      const weeksToCheck = [targetWeekStart]
      if (targetWeekStart < currentWeekStart) weeksToCheck.push(currentWeekStart)

      const { data: checkins } = await supabaseAdmin
        .from('weekly_checkins')
        .select('week_start')
        .in('week_start', weeksToCheck)
        .in('sub_objective_id', subIds)
        .limit(weeksToCheck.length * subIds.length)

      if (checkins && checkins.length > 0) {
        results.push({
          user: dr.full_name,
          status: 'already_submitted',
          target_week: targetWeekStart,
          satisfied_by: checkins.map(c => c.week_start),
        })
        continue
      }

      // build email
      const dtRaw = targetMeeting.start?.dateTime || targetMeeting.start?.date || ''
      const dtIso = /^\d{4}-\d{2}-\d{2}$/.test(dtRaw)
        ? dtRaw + 'T00:00:00Z'
        : (/Z$/.test(dtRaw) || /[+-]\d{2}:?\d{2}$/.test(dtRaw) ? dtRaw : dtRaw + 'Z')
      const meetingStart = new Date(dtIso)
      const dateStr = meetingStart.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: tz,
      })
      // include the tz abbreviation so DRs in different regions know which clock
      // the time refers to (e.g. "11:00 AM CST")
      const timeStr = meetingStart.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short',
      })

      let emailSubject, emailHtml
      // Escape anything that lands in the HTML body. firstName and the meeting
      // subject come from user data and the calendar, so a stray "<" shouldn't
      // break the layout.
      const safeName = escapeHtml(firstName)
      const safeSubject = escapeHtml(targetMeeting.subject || '')
      if (emailType === 'reminder') {
        emailSubject = `Reminder: Please complete your check-in before your 1:1 with ${MANAGER_NAME}`
        emailHtml = buildReminderEmail(safeName, safeSubject, dateStr, timeStr, siteUrl)
      } else if (emailType === 'overdue') {
        emailSubject = `Overdue: Your check-in for this week's 1:1 with ${MANAGER_NAME}`
        emailHtml = buildOverdueEmail(safeName, safeSubject, dateStr, timeStr, siteUrl)
      } else {
        // cancelled / moved meeting, ask them to fill it out anyway
        emailSubject = `Reminder: Please update your check-in for ${MANAGER_NAME} this week`
        emailHtml = buildCancelledEmail(safeName, siteUrl)
      }

      try {
        await resend.emails.send({
          from: process.env.REMINDER_FROM_EMAIL || 'Strategic Execution Platform <onboarding@resend.dev>',
          to: [dr.email],
          subject: emailSubject,
          html: emailHtml,
        })

        // log the send, feeds the 23-hour dedupe check above
        await supabaseAdmin.from('reminder_log').insert({
          user_id: dr.id,
          week_start: targetWeekStart,
          email_type: emailType!,
          meeting_subject: targetMeeting.subject || null,
        })

        results.push({ user: dr.full_name, status: `${emailType}_sent`, meeting: targetMeeting.subject })
      } catch (emailErr: any) {
        console.error(`Failed to send reminder to ${dr.email}:`, emailErr)
        results.push({ user: dr.full_name, status: 'send_failed', error: emailErr.message })
      }
    }

    return NextResponse.json({
      message: 'Reminder check complete',
      timestamp: new Date().toISOString(),
      results,
      sent: results.filter(r => r.status?.includes('_sent')).length,
    })
  } catch (err) {
    console.error('Cron reminder error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
