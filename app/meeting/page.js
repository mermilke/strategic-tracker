'use client'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Navbar from '../../components/Navbar'
import { getCurrentWeekStart, formatWeekLabel, STATUS_CONFIG } from '../../lib/utils'
import { startOfWeek, format, subWeeks, addWeeks } from 'date-fns'

function MeetingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialUserId = searchParams.get('userId')

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // direct reports (manager only)
  const [directReports, setDirectReports] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(initialUserId || '')
  const [selectedUserName, setSelectedUserName] = useState('')

  const currentWeek = getCurrentWeekStart()
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)

  // left panel check-in data
  const [objectives, setObjectives] = useState([])
  const [checkins, setCheckins] = useState({})
  const [lastWeekCheckins, setLastWeekCheckins] = useState({})
  const [attachments, setAttachments] = useState([])
  const [agendaCollapsed, setAgendaCollapsed] = useState(true)
  const [smartsheetData, setSmartsheetData] = useState([])
  const [smartsheetExpanded, setSmartsheetExpanded] = useState({})
  const [calendarEvents, setCalendarEvents] = useState([])
  const [calendarConnected, setCalendarConnected] = useState(null) // null=loading, true/false
  const [nextMeeting, setNextMeeting] = useState(null) // next 1:1 for selected user

  // right panel notes
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [otherTyping, setOtherTyping] = useState(false)
  const [otherTypingName, setOtherTypingName] = useState('')

  const saveTimeoutRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const channelRef = useRef(null)
  const notesRef = useRef(notes)
  notesRef.current = notes

  // build the week dropdown from the user's check-in history (oldest to current)
  const weekOptions = (() => {
    const opts = []
    let earliest = null
    for (const obj of (objectives || [])) {
      for (const s of (obj.sub_objectives || [])) {
        for (const c of (s.weekly_checkins || [])) {
          if (c.week_start && (!earliest || c.week_start < earliest)) earliest = c.week_start
        }
      }
    }
    const cur = new Date(currentWeek + 'T00:00:00')
    const start = earliest ? new Date(earliest + 'T00:00:00') : cur
    const list = []
    let w = start
    while (w <= cur) {
      list.push(format(w, 'yyyy-MM-dd'))
      w = new Date(w.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    // newest first so the current week sits at the top
    for (let i = list.length - 1; i >= 0; i--) {
      const val = list[i]
      opts.push({ value: val, label: formatWeekLabel(val) + (val === currentWeek ? ' (current)' : '') })
    }
    return opts
  })()

  // auth + first load
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      setUser(session.user)

      const { data: prof } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()

      setProfile(prof)

      const isManager = prof?.role === 'manager' || prof?.role === 'admin'

      if (isManager) {
        const { data: reports } = await supabase
          .from('users')
          .select('id, full_name, email')
          .eq('role', 'direct_report')
          .order('full_name')

        setDirectReports(reports || [])

        if (initialUserId && (reports || []).find(r => r.id === initialUserId)) {
          setSelectedUserId(initialUserId)
          const found = reports.find(r => r.id === initialUserId)
          setSelectedUserName(found?.full_name || '')
          const url = new URL(window.location)
          url.searchParams.set('userId', initialUserId)
          window.history.replaceState({}, '', url)
        } else if (reports?.length > 0) {
          setSelectedUserId(reports[0].id)
          setSelectedUserName(reports[0].full_name)
          // keep the default selection in the URL so a refresh stays on them
          const url = new URL(window.location)
          url.searchParams.set('userId', reports[0].id)
          window.history.replaceState({}, '', url)
        }
      } else {
        // a DR only ever sees themselves
        setSelectedUserId(prof.id)
        setSelectedUserName(prof.full_name)
      }

      setLoading(false)
    }
    load()
  }, [router, initialUserId])

  // reload check-ins when the user or week changes
  useEffect(() => {
    if (!selectedUserId) return

    async function loadCheckins() {
      const { data: objs } = await supabase
        .from('strategic_objectives')
        .select('*, sub_objectives(*, weekly_checkins(*))')
        .eq('owner_id', selectedUserId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      setObjectives(objs || [])

      // map check-ins for this week and last week
      const map = {}
      const lastMap = {}
      const lastWeek = format(subWeeks(new Date(selectedWeek + 'T00:00:00'), 1), 'yyyy-MM-dd')
      ;(objs || []).forEach(obj => {
        (obj.sub_objectives || []).forEach(sub => {
          const c = (sub.weekly_checkins || []).find(w => w.week_start === selectedWeek)
          if (c) map[sub.id] = c
          const lc = (sub.weekly_checkins || []).find(w => w.week_start === lastWeek)
          if (lc) lastMap[sub.id] = lc
        })
      })
      setCheckins(map)
      setLastWeekCheckins(lastMap)

      const { data: atts } = await supabase
        .from('meeting_attachments')
        .select('*')
        .eq('user_id', selectedUserId)
        .eq('week_start', selectedWeek)
        .order('created_at', { ascending: true })
      setAttachments(atts || [])
    }
    loadCheckins()
  }, [selectedUserId, selectedWeek])

  // Optional Smartsheet "Other Topics" feed (snapshot for past weeks, live for the
  // current week). Enabled for one DR via NEXT_PUBLIC_SMARTSHEET_USER_EMAIL. Usually
  // left empty, so this does nothing in most deployments.
  useEffect(() => {
    if (!selectedUserId || !directReports.length) return
    const smartsheetEmail = (process.env.NEXT_PUBLIC_SMARTSHEET_USER_EMAIL || '').toLowerCase()
    const selectedUser = directReports.find(r => r.id === selectedUserId)
    if (!smartsheetEmail || !selectedUser || !selectedUser.email?.toLowerCase().includes(smartsheetEmail)) {
      setSmartsheetData([])
      return
    }
    async function loadSmartsheet() {
      try {
        const params = new URLSearchParams({ week: selectedWeek, userId: selectedUserId })
        const res = await fetch(`/api/smartsheet?${params}`)
        if (!res.ok) return
        const data = await res.json()
        setSmartsheetData(data.rows || [])
      } catch (err) {
        console.error('Smartsheet fetch error:', err)
      }
    }
    loadSmartsheet()
  }, [selectedUserId, selectedWeek, directReports])

  // manager calendar events
  useEffect(() => {
    if (!user || !profile) return
    const isManagerUser = profile.role === 'manager' || profile.role === 'admin'
    if (!isManagerUser) { setCalendarConnected(false); return }

    async function loadCalendar() {
      try {
        const res = await fetch(`/api/calendar?userId=${user.id}`)
        if (res.status === 401) {
          setCalendarConnected(false)
          return
        }
        if (!res.ok) return
        const data = await res.json()
        setCalendarEvents(data.events || [])
        setCalendarConnected(true)
      } catch (err) {
        console.error('Calendar fetch error:', err)
        setCalendarConnected(false)
      }
    }
    loadCalendar()
  }, [user, profile])

  // next 1:1 for the selected user
  useEffect(() => {
    // clear stale data right away so the previous person's meeting doesn't linger
    // while the new fetch is in flight
    setNextMeeting(null)

    if (!user || !calendarConnected || !selectedUserId) return

    const selectedUser = directReports.find(r => r.id === selectedUserId)
    if (!selectedUser) return

    // search the calendar by the DR's first name to find their recurring 1:1
    const firstName = selectedUser.full_name?.split(' ')[0]?.toLowerCase()
    if (!firstName) return

    const searchTerm = firstName

    // race guard: if the user switches again before this resolves, drop the result
    // so an older request can't clobber a newer one
    let cancelled = false

    async function loadNextMeeting() {
      try {
        const res = await fetch(`/api/calendar?userId=${user.id}&search=${encodeURIComponent(searchTerm)}&days=30&limit=1`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setNextMeeting(data.events?.[0] || null)
      } catch (err) {
        if (!cancelled) console.error('Next meeting fetch error:', err)
      }
    }
    loadNextMeeting()

    return () => { cancelled = true }
  }, [user, calendarConnected, selectedUserId, directReports])

  // load notes + wire up the Realtime channel
  useEffect(() => {
    if (!selectedUserId || !profile) return

    async function loadNotes() {
      const { data } = await supabase
        .from('meeting_notes')
        .select('*')
        .eq('user_id', selectedUserId)
        .eq('week_start', selectedWeek)
        .single()

      setNotes(data?.notes || '')
      setLastSaved(data?.updated_at ? new Date(data.updated_at) : null)
    }
    loadNotes()

    const channelName = `meeting:${selectedUserId}:${selectedWeek}`
    const channel = supabase.channel(channelName)

    channel
      .on('broadcast', { event: 'notes-update' }, ({ payload }) => {
        if (payload.senderId !== profile.id) {
          setNotes(payload.notes)
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.senderId !== profile.id) {
          setOtherTyping(true)
          setOtherTypingName(payload.senderName || 'Someone')
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2000)
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      clearTimeout(saveTimeoutRef.current)
      clearTimeout(typingTimeoutRef.current)
    }
  }, [selectedUserId, selectedWeek, profile])

  // debounced save
  const saveNotes = useCallback(async (value) => {
    setSaving(true)
    await supabase
      .from('meeting_notes')
      .upsert({
        user_id: selectedUserId,
        week_start: selectedWeek,
        notes: value,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id,
      }, { onConflict: 'user_id,week_start' })

    setSaving(false)
    setLastSaved(new Date())
  }, [selectedUserId, selectedWeek, profile])

  function handleNotesChange(e) {
    const value = e.target.value
    setNotes(value)

    // broadcast to the other person on the call
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'notes-update',
        payload: { notes: value, senderId: profile.id }
      })
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: profile.id, senderName: profile.full_name }
      })
    }

    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveNotes(value), 1000)
  }

  function handleUserChange(e) {
    const id = e.target.value
    setSelectedUserId(id)
    const found = directReports.find(r => r.id === id)
    setSelectedUserName(found?.full_name || '')
    setNotes('')
    setLastSaved(null)
    // keep the selection in the URL so a refresh stays on them
    const url = new URL(window.location)
    url.searchParams.set('userId', id)
    window.history.replaceState({}, '', url.toString())
  }

  function navigateWeek(dir) {
    const d = dir === 'prev'
      ? subWeeks(new Date(selectedWeek + 'T00:00:00'), 1)
      : addWeeks(new Date(selectedWeek + 'T00:00:00'), 1)
    const val = format(d, 'yyyy-MM-dd')
    if (val <= currentWeek && val >= weekOptions[weekOptions.length - 1].value) {
      setSelectedWeek(val)
    }
  }

  const isManager = profile?.role === 'manager' || profile?.role === 'admin'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const toLetter = i => String.fromCharCode(65 + i)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {selectedUserName
                ? `1:1 · ${selectedUserName.split(' ')[0].toUpperCase()} MEETING NOTES`
                : '1:1 MEETING NOTES'
              }
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* user picker, manager only */}
            {isManager && (
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={handleUserChange}
                  className="appearance-none pr-8 pl-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    minWidth: 200,
                  }}
                >
                  {directReports.map(r => (
                    <option key={r.id} value={r.id}>{r.full_name}</option>
                  ))}
                </select>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            )}

            {/* week selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Week:</span>
              <div className="relative">
                <select
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(e.target.value)}
                  className="appearance-none pr-8 pl-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    minWidth: 220,
                  }}
                >
                  {weekOptions.map(w => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              <button onClick={() => navigateWeek('prev')} className="p-1.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button onClick={() => navigateWeek('next')} className="p-1.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', opacity: selectedWeek >= currentWeek ? 0.3 : 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* calendar bar, manager only */}
        {isManager && calendarConnected === false && (
          <div className="rounded-xl px-5 py-3 mb-4 flex items-center justify-between" style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 16 }}>📅</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Connect your Outlook calendar to see today&apos;s schedule</span>
            </div>
            <button
              onClick={() => window.location.href = `/api/auth/microsoft?userId=${user.id}`}
              className="text-xs px-4 py-2 rounded-lg font-semibold"
              style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Connect Calendar
            </button>
          </div>
        )}

        {/* next 1:1 indicator */}
        {isManager && calendarConnected && nextMeeting && (
          <div className="rounded-xl px-5 py-3 mb-4 flex items-center gap-3" style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Next 1:1 with <strong style={{ color: 'var(--text-primary)' }}>{selectedUserName?.split(' ')[0]}</strong>:
            </span>
            <span className="text-sm font-semibold" style={{ color: '#2563EB' }}>
              {(() => {
                const start = new Date(nextMeeting.start?.dateTime || nextMeeting.start?.date)
                const today = new Date()
                const tomorrow = new Date(today)
                tomorrow.setDate(tomorrow.getDate() + 1)
                const isToday = start.toDateString() === today.toDateString()
                const isTomorrow = start.toDateString() === tomorrow.toDateString()
                const dateStr = isToday ? 'Today' : isTomorrow ? 'Tomorrow' :
                  start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                return `${dateStr} at ${timeStr}`
              })()}
            </span>
            {nextMeeting.location?.displayName && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                📍 {nextMeeting.location.displayName}
              </span>
            )}
          </div>
        )}

        {/* split view */}
        {selectedUserId ? (
          <div className="flex gap-6" style={{ height: 'calc(100vh - 200px)' }}>
            {/* left: check-in summary */}
            <div className="rounded-xl p-5 overflow-y-auto" style={{
              width: '45%', flexShrink: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
                Check-in Summary -- {formatWeekLabel(selectedWeek)}
              </h2>

              {(() => {
                if (objectives.length === 0) {
                  return <p className="text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No active objectives</p>
                }

                // precompute letter maps and discuss/non-discuss splits up front
                const allObjData = objectives.map((obj, objIdx) => {
                  const sorted = (obj.sub_objectives || [])
                    .filter(s => s.is_active)
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at || '').localeCompare(b.created_at || ''))
                  const letterMap = {}
                  sorted.forEach((s, i) => { letterMap[s.id] = i })
                  const withDiscuss = sorted.filter(s => checkins[s.id]?.discuss_in_meeting)
                  const withoutDiscuss = sorted.filter(s => !checkins[s.id]?.discuss_in_meeting)
                  return { obj, objIdx, sorted, letterMap, withDiscuss, withoutDiscuss }
                })

                const hasAnyDiscuss = allObjData.some(d => d.withDiscuss.length > 0)
                const hasAnyNonDiscuss = allObjData.some(d => d.withoutDiscuss.length > 0)

                const renderSubCard = (sub, subIdx, c, isDiscuss) => {
                  const statusCfg = c ? STATUS_CONFIG[c.status] : null
                  const lc = lastWeekCheckins[sub.id]
                  const lastCfg = c && lc && lc.status !== c.status ? STATUS_CONFIG[lc.status] : null
                  return (
                    <div key={sub.id} className="rounded-lg p-2.5" style={{
                      background: c ? `${statusCfg?.hex || '#94A3B8'}12` : 'var(--bg-base)',
                      border: `1px solid ${c ? `${statusCfg?.hex || '#94A3B8'}35` : 'var(--border)'}`,
                      opacity: isDiscuss ? 1 : 0.45,
                      transition: 'opacity 0.2s',
                    }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>📌</span>
                          <span className="text-xs font-medium" style={{ color: statusCfg?.hex || 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {toLetter(subIdx)}. {sub.title}
                          </span>
                        </div>
                        {c && statusCfg && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {c.discuss_in_meeting && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                padding: '1px 7px', borderRadius: 4,
                                background: 'rgba(167,139,250,0.12)',
                                border: '1px solid rgba(167,139,250,0.3)',
                                color: '#A78BFA', fontSize: 10,
                              }}>
                                💬 Discuss in 1:1
                              </span>
                            )}
                            {c.support_needed && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                padding: '1px 7px', borderRadius: 4,
                                background: 'rgba(56,189,248,0.12)',
                                border: '1px solid rgba(56,189,248,0.3)',
                                color: '#7DD3FC', fontSize: 10,
                              }}>
                                🙋 Support needed
                              </span>
                            )}
                            {lastCfg && (
                              <>
                                <span style={{ color: lastCfg.hex, fontSize: 9, opacity: 0.6 }}>{lastCfg.label}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>→</span>
                              </>
                            )}
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '1px 7px', borderRadius: 4,
                              background: `${statusCfg.hex}20`,
                              border: `1px solid ${statusCfg.hex}40`,
                              color: statusCfg.hex, fontSize: 10,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusCfg.hex, display: 'inline-block' }} />
                              {statusCfg.label}
                            </span>
                          </div>
                        )}
                      </div>
                      {c ? (
                        <div className="flex justify-between items-end ml-6 mt-1">
                          <div className="space-y-1 flex-1 min-w-0">
                          {c.comments && (
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              💬 {c.comments}
                            </div>
                          )}
                          </div>
                          <span className="flex-shrink-0 ml-2" style={{ color: c.progress_this_week ? '#34D399' : '#F87171', fontSize: 10 }}>
                            {c.progress_this_week ? '✓ Progress' : '✗ No progress'}
                          </span>
                        </div>
                      ) : (
                        <div className="ml-6 text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No submission
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <>
                    {/* "To Discuss" always shows */}
                    <h3 className="text-lg font-bold uppercase tracking-wider mb-1" style={{ color: '#2563EB', letterSpacing: '0.08em' }}>
                      To Discuss
                    </h3>

                    <h4 className="text-base font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                      Strategic Objectives
                    </h4>

                    {hasAnyDiscuss ? (
                      <div className="space-y-5">
                        {allObjData.filter(d => d.withDiscuss.length > 0).map(({ obj, objIdx, letterMap, withDiscuss }) => (
                          <div key={obj.id}>
                            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                              🎯 {objIdx + 1}. {obj.title}
                            </h3>
                            <div className="space-y-2 ml-4">
                              {withDiscuss.map(sub => renderSubCard(sub, letterMap[sub.id], checkins[sub.id], true))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs ml-1 mb-2" style={{ color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.6 }}>
                        No strategic objectives marked to discuss this week
                      </p>
                    )}

                    {/* Other Topics: Smartsheet feed if enabled for this DR, otherwise a placeholder */}
                    <div className="mt-5">
                      <h4 className="text-base font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                        Other Topics
                      </h4>
                      {smartsheetData.length > 0 ? (
                        <div className="space-y-2">
                          {smartsheetData.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg"
                              style={{
                                background: 'var(--bg-base)',
                                border: '1px solid var(--border)',
                                overflow: 'hidden',
                              }}
                            >
                              <button
                                onClick={() => setSmartsheetExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                style={{
                                  width: '100%',
                                  padding: '10px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  gap: '8px',
                                }}
                              >
                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', flex: 1 }}>
                                  {item.topic}
                                </span>
                                {item.latestUpdate && (
                                  <span className="text-xs" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    Updated: {new Date(item.latestUpdate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
                                  </span>
                                )}
                                <svg
                                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                  style={{ transition: 'transform 0.2s', transform: smartsheetExpanded[item.id] ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                              {smartsheetExpanded[item.id] && (
                                <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border)' }}>
                                  {item.description && (
                                    <div className="mt-2">
                                      <span className="text-xs font-semibold uppercase" style={{ color: '#2563EB', letterSpacing: '0.04em' }}>Description</span>
                                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.description}</p>
                                    </div>
                                  )}
                                  {item.status && (
                                    <div className="mt-2">
                                      <span className="text-xs font-semibold uppercase" style={{ color: '#2563EB', letterSpacing: '0.04em' }}>Current Status</span>
                                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{item.status}</p>
                                    </div>
                                  )}
                                  {item.previousStatus && (
                                    <div className="mt-2">
                                      <span className="text-xs font-semibold uppercase" style={{ color: '#2563EB', letterSpacing: '0.04em' }}>Previous Status</span>
                                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', lineHeight: 1.5, opacity: 0.7 }}>{item.previousStatus}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs ml-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.6 }}>
                          No other topics submitted this week
                        </p>
                      )}
                    </div>

                    {/* attachments sit between the discuss and non-discuss blocks */}
                    {attachments.length > 0 && (
                      <div className="mt-5 pt-4 mb-1" style={{ borderTop: hasAnyDiscuss ? '1px solid var(--border)' : 'none' }}>
                        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                          📎 Attachments ({attachments.length})
                        </h3>
                        <div className="space-y-1.5">
                          {attachments.map(att => (
                            <button
                              key={att.id}
                              onClick={async () => {
                                if (att.type === 'link') {
                                  window.open(att.url, '_blank')
                                } else if (att.file_path) {
                                  const { data } = await supabase.storage
                                    .from('meeting-files')
                                    .createSignedUrl(att.file_path, 7200)
                                  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                                }
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left"
                              style={{
                                background: 'var(--bg-base)',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                              onMouseOver={e => { e.currentTarget.style.background = 'rgba(37, 99, 235,0.06)'; e.currentTarget.style.borderColor = 'rgba(37, 99, 235,0.3)' }}
                              onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-base)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                            >
                              <span style={{ fontSize: 13, flexShrink: 0 }}>
                                {att.type === 'file' ? '📄' : '🔗'}
                              </span>
                              <span className="flex-1 min-w-0 text-xs truncate" style={{ color: '#2563EB' }}>
                                {att.file_name}
                              </span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* divider before the non-discuss items */}
                    {hasAnyNonDiscuss && (
                      <div style={{ borderTop: '1px dashed var(--border)', margin: '16px 0 12px', opacity: 0.5 }} />
                    )}

                    {/* collapsible non-discuss items */}
                    {hasAnyNonDiscuss && (
                      <>
                        <button
                          onClick={() => setAgendaCollapsed(!agendaCollapsed)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            textAlign: 'left',
                            marginBottom: agendaCollapsed ? '0' : '4px',
                          }}
                        >
                          <h3 className="text-lg font-bold uppercase tracking-wider" style={{ color: '#2563EB', letterSpacing: '0.08em', margin: 0 }}>
                            Not on Today&#39;s Agenda
                          </h3>
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transition: 'transform 0.2s', transform: agendaCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', flexShrink: 0 }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        {!agendaCollapsed && (
                          <>
                            <h4 className="text-base font-semibold uppercase tracking-wider mb-3 mt-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                              Strategic Objectives
                            </h4>
                            <div className="space-y-5">
                              {allObjData.filter(d => d.withoutDiscuss.length > 0).map(({ obj, objIdx, letterMap, withoutDiscuss }) => (
                                <div key={obj.id}>
                                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)', opacity: 0.45 }}>
                                    🎯 {objIdx + 1}. {obj.title}
                                  </h3>
                                  <div className="space-y-2 ml-4">
                                    {withoutDiscuss.map(sub => renderSubCard(sub, letterMap[sub.id], checkins[sub.id], false))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )
              })()}
            </div>

            {/* right: collaborative notes */}
            <div className="flex-1 flex flex-col rounded-xl" style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Meeting Notes
                </h2>
                <div className="flex items-center gap-3">
                  {otherTyping && (
                    <span className="text-xs animate-pulse" style={{ color: '#2563EB' }}>
                      ✏️ {otherTypingName} is typing...
                    </span>
                  )}
                  <span className="text-xs" style={{ color: saving ? '#F59E0B' : lastSaved ? '#34D399' : 'var(--text-muted)' }}>
                    {saving ? 'Saving...' : lastSaved
                      ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Not saved yet'
                    }
                  </span>
                </div>
              </div>

              <textarea
                value={notes}
                onChange={handleNotesChange}
                placeholder={`Type your 1:1 meeting notes here...\n\nBoth you and ${isManager ? (selectedUserName?.split(' ')[0] || 'your team member') : 'your manager'} can edit this in real time.`}
                className="flex-1 w-full p-5 resize-none text-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  outline: 'none',
                  lineHeight: 1.7,
                  minHeight: 400,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a team member to start</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default function MeetingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MeetingContent />
    </Suspense>
  )
}
