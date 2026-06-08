import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '../../../lib/auth'
import type { Database } from '../../../lib/database.types'

export const dynamic = 'force-dynamic'

type Admin = SupabaseClient<Database>

// The shared mailbox whose calendar the app reads (the manager running the 1:1s).
// Anyone whose stored Microsoft token has Calendars.Read.Shared on it can read it.
const CALENDAR_MAILBOX = process.env.MANAGER_CALENDAR_EMAIL

async function refreshAccessToken(supabaseAdmin: Admin, userId: string, refreshToken: string): Promise<string | null> {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'User.Read Calendars.Read Calendars.Read.Shared Notes.Read Notes.Read.All offline_access',
      }),
    }
  )

  if (!tokenRes.ok) return null

  const tokens = await tokenRes.json()
  await supabaseAdmin.from('microsoft_tokens').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq('user_id', userId)

  return tokens.access_token
}

async function fetchCalendarEvents(accessToken: string, startDateTime: string, endDateTime: string): Promise<Response> {
  return fetch(
    `https://graph.microsoft.com/v1.0/users/${CALENDAR_MAILBOX}/calendarview?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,isAllDay,isCancelled,showAs,organizer,webLink`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // make Graph return times in UTC (the string still has no Z suffix, but we
        // know to treat it as UTC and append Z below)
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: 'no-store',
    }
  )
}

// With Prefer=UTC, Graph returns dateTime like "2026-05-05T16:00:00.0000000"
// (UTC, no Z). Append Z so JS parses it as UTC; client formatters show local.
function normalizeEvent(e: any) {
  const fix = (dt?: string) => {
    if (!dt) return dt
    // already has Z or a +00:00 / -05:00 style offset
    if (/Z$/.test(dt) || /[+-]\d{2}:?\d{2}$/.test(dt)) return dt
    return dt + 'Z'
  }
  return {
    ...e,
    start: e.start ? { ...e.start, dateTime: fix(e.start.dateTime) } : e.start,
    end: e.end ? { ...e.end, dateTime: fix(e.end.dateTime) } : e.end,
  }
}

export async function GET(request: Request) {
  // logged-in users only
  const auth = await getAuthenticatedUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const date = searchParams.get('date')      // a specific date to query
  const search = searchParams.get('search')  // filter by subject substring
  // Clamp the numeric params so a caller can't ask for a huge window or page.
  const clampInt = (raw: string | null, fallback: number, min: number, max: number) => {
    const n = parseInt(raw ?? '', 10)
    return Math.min(Math.max(Number.isNaN(n) ? fallback : n, min), max)
  }
  const days = clampInt(searchParams.get('days'), 0, 0, 60)    // days to look ahead
  const limit = clampInt(searchParams.get('limit'), 20, 1, 100) // max events

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  if (!CALENDAR_MAILBOX) {
    return NextResponse.json({ error: 'Calendar integration not configured' }, { status: 501 })
  }

  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tokenData, error: tokenError } = await supabaseAdmin
    .from('microsoft_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: 'Not connected', needsAuth: true }, { status: 401 })
  }

  let accessToken: string | null = tokenData.access_token

  if (new Date(tokenData.expires_at) <= new Date()) {
    accessToken = await refreshAccessToken(supabaseAdmin, userId, tokenData.refresh_token)
    if (!accessToken) {
      return NextResponse.json({ error: 'Token refresh failed', needsAuth: true }, { status: 401 })
    }
  }

  try {
    const now = new Date()
    const startDateTime = date ? `${date}T00:00:00` : now.toISOString()
    const endDate = new Date(date ? new Date(date) : now)
    endDate.setDate(endDate.getDate() + (days || 0))
    if (!days && !date) {
      // default to just today
      endDate.setHours(23, 59, 59)
    }
    const endDateTime = days ? endDate.toISOString() : `${(date || now.toISOString().split('T')[0])}T23:59:59`

    let calRes = await fetchCalendarEvents(accessToken, startDateTime, endDateTime)

    if (!calRes.ok) {
      const errText = await calRes.text()
      console.error('Calendar API error:', errText)
      if (calRes.status === 401) {
        accessToken = await refreshAccessToken(supabaseAdmin, userId, tokenData.refresh_token)
        if (!accessToken) {
          return NextResponse.json({ error: 'Auth expired', needsAuth: true }, { status: 401 })
        }
        calRes = await fetchCalendarEvents(accessToken, startDateTime, endDateTime)
        if (!calRes.ok) {
          return NextResponse.json({ error: 'Calendar fetch failed', needsAuth: true }, { status: 401 })
        }
      } else {
        return NextResponse.json({ error: 'Calendar fetch failed' }, { status: 500 })
      }
    }

    const calData = await calRes.json()
    let events = calData.value || []

    // Graph keeps returning cancelled events, drop them
    events = events.filter((e: any) => !e.isCancelled)

    if (search) {
      const searchLower = search.toLowerCase()
      events = events.filter((e: any) => e.subject?.toLowerCase().includes(searchLower))
    }

    // cap the list, then normalize datetimes so the client parses them as UTC
    events = events.slice(0, limit).map(normalizeEvent)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Calendar error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
