import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '../../../lib/auth'
import { startOfWeek, format } from 'date-fns'
import type { Database } from '../../../lib/database.types'

export const dynamic = 'force-dynamic'

type SmartsheetRow = {
  id: string | number
  topic: string
  description: string
  status: string
  latestUpdate: string
  previousStatus: string
}

function getCurrentWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )
}

export async function GET(request: Request) {
  // logged-in users only
  const auth = await getAuthenticatedUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const requestedWeek = searchParams.get('week')
  const userId = searchParams.get('userId')
  const currentWeek = getCurrentWeekStart()
  const isHistorical = requestedWeek && requestedWeek < currentWeek

  // Snapshots are keyed by user_id. A caller may read/write their own; a manager
  // or admin may do so only for a real direct report they're viewing in the 1:1
  // page. Any other id -- another manager/admin, or a non-existent user -- is
  // rejected, so a privileged caller can't file or read a snapshot under an
  // arbitrary id. (The session client also runs under RLS; this is the app guard.)
  const isManager = auth.profile.role === 'manager' || auth.profile.role === 'admin'
  if (userId && userId !== auth.user.id) {
    if (!isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const supabase = await getSupabase()
    const { data: target } = await supabase.from('users').select('role').eq('id', userId).single()
    if (!target || target.role !== 'direct_report') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // historical week: read the DB snapshot instead of hitting Smartsheet
  if (isHistorical && userId) {
    const supabase = await getSupabase()
    const { data: snaps, error } = await supabase
      .from('smartsheet_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', requestedWeek)
      .order('latest_update', { ascending: false })

    if (error) {
      console.error('Snapshot read error:', error)
      return NextResponse.json({ error: 'Failed to read snapshot' }, { status: 500 })
    }

    const rows = (snaps || []).map(s => ({
      id: s.external_id,
      topic: s.topic || '',
      description: s.description || '',
      status: s.status || '',
      latestUpdate: s.latest_update || '',
      previousStatus: s.previous_status || '',
    }))
    return NextResponse.json({ rows, sheetName: 'Smartsheet (snapshot)', historical: true })
  }

  // live fetch for the current week, or any request without a week
  const token = process.env.SMARTSHEET_API_TOKEN
  const sheetId = process.env.SMARTSHEET_SHEET_ID

  if (!token || !sheetId) {
    return NextResponse.json({ error: 'Smartsheet not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!res.ok) {
      console.error('Smartsheet fetch failed:', res.status)
      return NextResponse.json({ error: 'Failed to fetch sheet' }, { status: 502 })
    }

    const sheet = await res.json()

    // column ID -> title map
    const colMap: Record<number, string> = {}
    for (const col of sheet.columns) {
      colMap[col.id] = col.title
    }

    // only keep rows updated in the last 2 weeks
    const rows: SmartsheetRow[] = []
    for (const row of sheet.rows) {
      const cellMap: Record<string, string> = {}
      for (const cell of row.cells) {
        const colName = colMap[cell.columnId]
        if (colName) {
          cellMap[colName] = cell.displayValue || cell.value || ''
        }
      }

      if (cellMap['Topic']?.trim()) {
        const updateDate = cellMap['Latest Update'] ? new Date(cellMap['Latest Update']) : null
        const twoWeeksAgo = new Date()
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

        if (updateDate && updateDate >= twoWeeksAgo) {
          rows.push({
            id: row.id,
            topic: cellMap['Topic'] || '',
            description: cellMap['Description'] || '',
            status: cellMap['Status'] || '',
            latestUpdate: cellMap['Latest Update'] || '',
            previousStatus: cellMap['Previous Status'] || '',
          })
        }
      }
    }

    // snapshot the live data for this week so historical views have something to read
    if (userId && rows.length > 0) {
      const supabase = await getSupabase()
      const records = rows.map(r => ({
        user_id: userId,
        week_start: currentWeek,
        external_id: String(r.id),
        topic: r.topic,
        description: r.description,
        status: r.status,
        previous_status: r.previousStatus,
        latest_update: r.latestUpdate ? new Date(r.latestUpdate).toISOString() : null,
      }))
      const { error: upsertErr } = await supabase
        .from('smartsheet_snapshots')
        .upsert(records, { onConflict: 'user_id,week_start,external_id' })
      if (upsertErr) console.error('Snapshot write error:', upsertErr)
    }

    return NextResponse.json({ rows, sheetName: sheet.name })
  } catch (err) {
    console.error('Smartsheet API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
