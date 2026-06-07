'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import StatusBadge from './StatusBadge'
import Spinner from './Spinner'
import HistoryModal from './HistoryModal'
import { getCurrentWeekStart, formatWeekLabel, statusTint, toLetter } from '../lib/utils'
import { calcWeeksNoProgress, STATUS_PROGRESS, STATUS_BAR_COLOR } from '../lib/dashboard'
import { startOfWeek, format } from 'date-fns'
import AnalyticsCharts from './AnalyticsCharts'
import WeeklyBriefing from './WeeklyBriefing'

export default function ManagerDashboard({ currentUser }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeView = searchParams.get('view') || 'overview'
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekStart())
  const [expandedUsers, setExpandedUsers] = useState(new Set())
  const [filterStatus, setFilterStatus] = useState('all')
  const [historyModal, setHistoryModal] = useState(null)
  const [expandedModalSubs, setExpandedModalSubs] = useState(new Set())
  const [highlightedSub, setHighlightedSub] = useState(null)

  function applyFilter(val) {
    setFilterStatus(val)
    if (val !== 'all') {
      // expand everyone matching the filter
      const matching = data.filter(u => {
        if (val === 'not_submitted') return u.submitted < u.totalSubs
        if (val === 'at_risk') return u.atRisk > 0
        if (val === 'needs_support') return u.needsSupport > 0
        if (val === 'stale') return (u.objectives || []).flatMap(o => o.sub_objectives).some(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2)
        return true
      }).map(u => u.id)
      setExpandedUsers(new Set(matching))
    }
  }

  const thisWeek = getCurrentWeekStart()

  // earliest week comes from the check-in data so the range covers all real
  // history. Memoized so it only recomputes when the data changes.
  const weekOptions = useMemo(() => {
    const weeks = []
    const cur = startOfWeek(new Date(), { weekStartsOn: 1 })

    let earliest = null
    for (const u of data) {
      for (const o of (u.objectives || [])) {
        for (const s of (o.sub_objectives || [])) {
          for (const c of (s.weekly_checkins || [])) {
            if (c.week_start && (!earliest || c.week_start < earliest)) earliest = c.week_start
          }
        }
      }
    }

    const start = earliest ? new Date(earliest + 'T00:00:00') : cur
    let w = start
    while (w <= cur) {
      weeks.push(format(w, 'yyyy-MM-dd'))
      w = new Date(w.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    return weeks
  }, [data])
  const weekIdx = weekOptions.indexOf(selectedWeek)
  const goBack = () => { if (weekIdx > 0) setSelectedWeek(weekOptions[weekIdx - 1]) }
  const goForward = () => { if (weekIdx < weekOptions.length - 1) setSelectedWeek(weekOptions[weekIdx + 1]) }

  useEffect(() => {
    loadData()
    const interval = setInterval(() => { loadData(true) }, 60000)
    return () => clearInterval(interval)
  }, [selectedWeek])

  async function loadData(silent = false) {
    if (!silent) setLoading(true)

    const { data: users } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'direct_report')
      .order('full_name')

    if (!users) { setLoading(false); return }

    // pull objectives + subs + checkins per user for the selected week
    const enriched = await Promise.all(users.map(async (u) => {
      const { data: objectives } = await supabase
        .from('strategic_objectives')
        .select(`
          *,
          sub_objectives (
            *,
            weekly_checkins (*)
          ),
          objective_opportunities (*)
        `)
        .eq('owner_id', u.id)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')

      const objWithCheckins = (objectives || []).map(obj => ({
        ...obj,
        sub_objectives: (obj.sub_objectives || [])
          .filter(s => s.is_active)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
          .map(sub => ({
            ...sub,
            thisWeekCheckin: sub.weekly_checkins?.find(c => c.week_start === selectedWeek) || null,
          }))
      }))


      const allCheckins = objWithCheckins.flatMap(o => o.sub_objectives.map(s => s.thisWeekCheckin)).filter(Boolean)
      const totalSubs = objWithCheckins.flatMap(o => o.sub_objectives).length
      const submitted = allCheckins.length
      const atRisk = allCheckins.filter(c => c.status === 'at_risk').length
      const offTrack = allCheckins.filter(c => c.status === 'off_track').length
      const onHold = allCheckins.filter(c => c.status === 'on_hold').length
      const notStarted = allCheckins.filter(c => c.status === 'not_started').length
      const needsSupport = allCheckins.filter(c => c.support_needed && c.support_needed.trim()).length

      return { ...u, objectives: objWithCheckins, totalSubs, submitted, atRisk, offTrack, onHold, notStarted, needsSupport }
    }))

    setData(enriched)
    setLoading(false)
  }

  const filteredData = data.filter(u => {
    if (filterStatus === 'not_submitted') return u.submitted < u.totalSubs
    if (filterStatus === 'at_risk') return u.atRisk > 0
    if (filterStatus === 'needs_support') return u.needsSupport > 0
    if (filterStatus === 'stale') return (u.objectives || []).flatMap(o => o.sub_objectives).some(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2)
    return true
  })

  const totalAtRisk = data.reduce((sum, u) => sum + u.atRisk, 0)
  const totalNeedsSupport = data.reduce((sum, u) => sum + u.needsSupport, 0)
  const totalNotSubmitted = data.filter(u => u.submitted < u.totalSubs).length

  if (loading) return <Spinner />

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-3xl text-slate-800">
            {activeView === 'overview' ? 'Team Overview' : 'Analytics'}
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {activeView === 'overview' ? `${formatWeekLabel(selectedWeek)} · ${data.length} direct reports` : `Week 0 to present · ${data.length} direct reports`}
        </p>
      </div>

      {activeView === 'analytics' ? (
        <AnalyticsCharts data={data} weekOptions={weekOptions} />
      ) : (<>
      {/* weekly briefing */}
      <WeeklyBriefing selectedWeek={selectedWeek} currentUser={currentUser} />

      {/* snapshot tiles */}
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {data.map(u => {
          return (
            <div key={u.id} className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="font-semibold text-sm mb-2 truncate cursor-pointer" style={{ color: 'var(--text-primary)' }}
                onClick={() => {
                  setExpandedUsers(prev => { const n = new Set(prev); n.add(u.id); return n; })
                  setTimeout(() => {
                    const el = document.getElementById(`user-${u.id}`)
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 100)
                }}
                onMouseOver={e => e.currentTarget.style.color = '#2563EB'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-primary)'}
              >{u.full_name}</div>
              <div className="space-y-1.5">
                {u.objectives?.map((obj, oi) => {
                  return (
                    <div key={obj.id}>
                      <div className="truncate mt-1 mb-0.5" style={{ fontSize: 10, fontWeight: 600, color: '#D62027', letterSpacing: '0.02em' }}>
                        {oi + 1}. {obj.short_title || obj.title}
                      </div>
                      {(obj.sub_objectives || []).map((sub, si) => {
                        const c = sub.thisWeekCheckin
                        const status = c?.status || 'not_started'
                        const subWeeksStale = calcWeeksNoProgress(sub, weekOptions, selectedWeek)
                        const barColor = STATUS_BAR_COLOR[status] || '#94A3B8'
                        const subLabel = sub.is_implicit ? `${oi + 1}.` : `${oi + 1}${toLetter(si)}.`
                        // opportunity objective: one bar, length is % of opportunities filled, color is the check-in status
                        const isOpp = !!obj.opportunity_target
                        const oppFilled = isOpp
                          ? (obj.objective_opportunities || []).filter(r =>
                              r.customer || r.project_description || r.segment || r.estimated_value_text).length
                          : 0
                        const oppTarget = obj.opportunity_target || 0
                        const pct = isOpp
                          ? Math.min(100, Math.round((oppFilled / oppTarget) * 100))
                          : (STATUS_PROGRESS[status] || 5)
                        return (
                          <div key={sub.id} className="flex items-center gap-1.5 mb-0.5 cursor-pointer rounded px-1 transition-all"
                            style={{ cursor: 'pointer', marginLeft: 10 }}
                            title={sub.short_title || sub.title}
                            onClick={() => {
                              setExpandedUsers(prev => { const n = new Set(prev); n.add(u.id); return n; })
                              setHighlightedSub(sub.id)
                              setTimeout(() => {
                                const el = document.getElementById(`sub-${sub.id}`)
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              }, 100)
                              setTimeout(() => setHighlightedSub(null), 3000)
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#B4E4ED'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div className="flex-shrink-0" style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', width: 22 }}>
                              {subLabel}
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <span title={c?.discuss_in_meeting ? 'Wants to discuss in 1:1' : 'No discussion requested'} style={{ display: 'inline-flex' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill={c?.discuss_in_meeting ? '#2563EB' : '#CBD5E1'} stroke="none">
                                  <path d="M2 4a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H6l-4 4V4z"/>
                                </svg>
                              </span>
                              <span title={c?.progress_this_week ? 'Progress made this week' : 'No progress this week'} style={{ display: 'inline-flex' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c?.progress_this_week ? '#2563EB' : '#CBD5E1'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              </span>
                              <span title={c?.support_needed ? 'Support needed from manager' : 'No support needed'} style={{ display: 'inline-flex' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill={c?.support_needed ? '#2563EB' : '#CBD5E1'} stroke="none" style={{ marginTop: 1 }}>
                                  <path d="M12 2a6 6 0 00-6 6c0 3-1.5 5.5-3 7h18c-1.5-1.5-3-4-3-7a6 6 0 00-6-6z"/>
                                  <path d="M2 15.5h20v1.5H2z"/>
                                  <path d="M9.5 17.5a2.5 2.5 0 005 0z"/>
                                </svg>
                              </span>
                            </div>
                            <div className="flex-1 min-w-0" style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.3s' }} />
                            </div>
                            {isOpp && (
                              <div title={`${oppFilled} of ${oppTarget} opportunities`}
                                style={{ color: oppFilled >= oppTarget ? '#34D399' : 'var(--text-secondary)', fontSize: 9, fontWeight: 700, flexShrink: 0, lineHeight: '6px', display: 'flex', alignItems: 'center' }}>
                                {oppFilled}/{oppTarget}
                              </div>
                            )}
                            {!isOpp && subWeeksStale >= 2 && (
                              <div title={`${subWeeksStale} weeks since update`}
                                style={{ color: '#D62027', fontSize: 9, fontWeight: 700, flexShrink: 0, lineHeight: '6px', display: 'flex', alignItems: 'center' }}>
                                {subWeeksStale}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Week selector + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Week:</label>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', paddingRight: 36, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', cursor: 'pointer' }}
            >
              {weekOptions.map(w => (
                <option key={w} value={w}>{formatWeekLabel(w)}{w === thisWeek ? ' (current)' : ''}</option>
              ))}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button onClick={goBack} disabled={weekIdx <= 0} title='Previous week'
              style={{ width: 30, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-surface)', border: 'none', borderRight: '1px solid var(--border)',
                color: weekIdx <= 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                cursor: weekIdx <= 0 ? 'not-allowed' : 'pointer', opacity: weekIdx <= 0 ? 0.4 : 1 }}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='15 18 9 12 15 6'/></svg>
            </button>
            <button onClick={goForward} disabled={weekIdx >= weekOptions.length - 1} title='Next week'
              style={{ width: 30, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-surface)', border: 'none',
                color: weekIdx >= weekOptions.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                cursor: weekIdx >= weekOptions.length - 1 ? 'not-allowed' : 'pointer', opacity: weekIdx >= weekOptions.length - 1 ? 0.4 : 1 }}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='9 18 15 12 9 6'/></svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {[
            ['all', 'All'],
            ['not_submitted', `Missing (${totalNotSubmitted})`],
            ['at_risk', `At Risk (${totalAtRisk})`],
            ['needs_support', `Needs Support (${totalNeedsSupport})`],
            ['stale', `No Update (${data.flatMap(u => (u.objectives || []).flatMap(o => o.sub_objectives)).filter(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2).length})`],
          ].map(([val, label]) => (
            <button key={val} onClick={() => applyFilter(val)}
              className="text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: filterStatus === val ? 'rgba(37, 99, 235,0.15)' : 'var(--bg-surface)',
                color: filterStatus === val ? '#2563EB' : 'var(--text-muted)',
                border: `1px solid ${filterStatus === val ? 'rgba(37, 99, 235,0.3)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'At Risk Items', value: totalAtRisk, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Needs Manager Support', value: totalNeedsSupport, color: '#38BDF8', bg: 'rgba(56,189,248,0.08)' },
          { label: 'Missing Submissions', value: totalNotSubmitted, color: '#F87171', bg: 'rgba(248,113,113,0.08)' },
          { label: 'No Update (2+ weeks)', value: data.flatMap(u => (u.objectives || []).flatMap(o => o.sub_objectives)).filter(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2).length, color: '#D62027', bg: 'rgba(214,32,39,0.08)' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-5" style={{ background: card.bg, border: `1px solid ${card.color}20` }}>
            <div className="text-3xl font-semibold mb-1" style={{ color: card.color }}>{card.value}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Direct report cards */}
      <div className="space-y-3">
        {filteredData.map(u => (
          <div key={u.id} id={`user-${u.id}`} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', scrollMarginTop: 80 }}>
            <div
              className="px-5 py-4 cursor-pointer"
              style={{ borderBottom: expandedUsers.has(u.id) ? '1px solid var(--border)' : 'none' }}
              onClick={() => setExpandedUsers(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                  style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }}>
                  {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-700 truncate">{u.full_name}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    {u.submitted}/{u.totalSubs}
                  </div>
                  <div className="h-1.5 rounded-full" style={{ width: 80, background: 'var(--bg-elevated)' }}>
                    <div className="h-1.5 rounded-full transition-all" style={{
                      width: u.totalSubs > 0 ? `${(u.submitted / u.totalSubs) * 100}%` : '0%',
                      background: '#2563EB',
                    }} />
                  </div>
                </div>

                <button
                  title={`View as ${u.full_name}`}
                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard?viewAs=${u.id}`) }}
                  className="text-xs px-2 py-1 rounded-lg transition-all flex-shrink-0"
                  style={{
                    background: 'rgba(37, 99, 235,0.1)',
                    color: '#2563EB',
                    border: '1px solid rgba(37, 99, 235,0.25)',
                    cursor: 'pointer',
                  }}
                >
                  👁
                </button>

                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"
                  style={{ color: 'var(--text-muted)', transform: expandedUsers.has(u.id) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {/* alert chips */}
              {(() => {
                const staleCount = (u.objectives || []).flatMap(o => o.sub_objectives).filter(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2).length
                return (u.atRisk > 0 || u.needsSupport > 0 || u.offTrack > 0 || staleCount > 0) ? (
                <div className="flex flex-wrap gap-1.5 ml-11">
                  {u.atRisk > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}>
                      {u.atRisk} at risk
                    </span>
                  )}
                  {u.needsSupport > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(56,189,248,0.15)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.3)' }}>
                      🙋 needs you
                    </span>
                  )}
                  {u.offTrack > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                      {u.offTrack} off track
                    </span>
                  )}
                  {staleCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(214,32,39,0.15)', color: '#D62027', border: '1px solid rgba(214,32,39,0.3)' }}>
                      {staleCount} no update
                    </span>
                  )}
                </div>
              ) : null})()}
            </div>

            {/* Expanded objectives */}
            {expandedUsers.has(u.id) && (
              <div className="px-6 py-4 space-y-5">
                {u.objectives.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active objectives set up.</p>
                )}
                {u.objectives.map((obj, objIdx) => {
                  const visibleSubs = filterStatus === 'all' ? obj.sub_objectives
                    : filterStatus === 'not_submitted' ? obj.sub_objectives.filter(s => !s.thisWeekCheckin)
                    : filterStatus === 'at_risk' ? obj.sub_objectives.filter(s => s.thisWeekCheckin?.status === 'at_risk')
                    : filterStatus === 'needs_support' ? obj.sub_objectives.filter(s => s.thisWeekCheckin?.support_needed?.trim())
                    : filterStatus === 'stale' ? obj.sub_objectives.filter(s => calcWeeksNoProgress(s, weekOptions, selectedWeek) >= 2)
                    : obj.sub_objectives
                  if (filterStatus !== 'all' && visibleSubs.length === 0) return null
                  return (
                  <div key={obj.id} id={`obj-${obj.id}`}>
                    <div className="mb-3" style={{ letterSpacing: '0.02em' }}>
                      <span
                        onClick={() => { setExpandedModalSubs(new Set()); setHistoryModal({ type: 'objective', title: obj.title, userName: u.full_name, subs: obj.sub_objectives }) }}
                        style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', cursor: 'pointer', textDecoration: 'none' }}
                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                      >🎯 {objIdx + 1}. {obj.title}</span>
                    </div>
                    {obj.opportunity_target ? (() => {
                      const rows = (obj.objective_opportunities || [])
                        .slice()
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
                        .filter(r => r.customer || r.project_description || r.segment || r.estimated_value_text)
                      const done = rows.length >= obj.opportunity_target
                      return (
                        <div className="mb-3 pl-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#2563EB' }}>Opportunities</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: done ? '#34D399' : '#64748B' }}>{rows.length} of {obj.opportunity_target}</span>
                          </div>
                          {rows.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>None added yet</div>
                          ) : (
                            <div className="space-y-1.5">
                              {rows.map((r, ri) => (
                                <div key={r.id || ri} className="rounded-lg p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {ri + 1}. {r.customer || <span style={{ color: 'var(--text-muted)' }}>(no customer)</span>}
                                    {r.estimated_value_text && <span style={{ color: '#2563EB', fontWeight: 700 }}> · {r.estimated_value_text}</span>}
                                  </div>
                                  {r.project_description && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{r.project_description}</div>}
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {r.segment && <span>{r.segment}</span>}
                                    {r.segment && r.status && <span> · </span>}
                                    {r.status && <span>{r.status}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })() : null}
                    <div className="space-y-2 pl-4">
                      {visibleSubs.map((sub, subIdx) => {
                        const c = sub.thisWeekCheckin
                        const weeksStale = calcWeeksNoProgress(sub, weekOptions, selectedWeek)
                        const tint = statusTint(c?.status)
                        return (
                          <div key={sub.id} id={`sub-${sub.id}`} className="rounded-lg p-4 flex gap-3" style={{ transition: 'box-shadow 0.3s, transform 0.3s', boxShadow: highlightedSub === sub.id ? '0 0 0 2px #2563EB, 0 0 12px rgba(37, 99, 235,0.3)' : 'none', transform: highlightedSub === sub.id ? 'scale(1.01)' : 'none', background: tint.bg, border: `1px solid ${tint.border}` }}>
                            <div className="flex-shrink-0 mt-0.5" style={{ fontSize: 14 }}>📌</div>
                            <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div
                                onClick={() => setHistoryModal({ type: 'sub', title: sub.title, userName: u.full_name, subs: [sub] })}
                                className="text-sm flex-1 min-w-0"
                                style={{ color: tint.text, cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                              >{sub.is_implicit ? 'Weekly status' : `${toLetter(subIdx)}. ${sub.title}`}</div>
                              <StatusBadge status={c?.status} size="sm" />
                            </div>
                            {!obj.opportunity_target && weeksStale >= 2 && (
                              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md" style={{ background: 'rgba(214,32,39,0.08)', border: '1px solid rgba(214,32,39,0.2)', width: 'fit-content' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D62027" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#D62027' }}>{weeksStale} week{weeksStale > 1 ? 's' : ''} since update</span>
                              </div>
                            )}
                            {c ? (
                              <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Progress: </span>
                                  {c.progress_this_week
                                    ? <span style={{ color: '#34D399' }}>✓ Yes</span>
                                    : <span style={{ color: '#F87171' }}>✗ No</span>
                                  }
                                </div>
                                {c.discuss_in_meeting && (
                                  <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: '#A78BFA' }}>
                                    <span className="font-medium">💬 Discuss in 1:1</span>
                                  </div>
                                )}
                                {c.support_needed && (
                                  <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#7DD3FC' }}>
                                    <span className="font-medium">🙋 Support needed</span>{c.support_needed && c.support_needed !== 'Yes' && <>: {c.support_needed}</>}
                                  </div>
                                )}
                                {c.comments && (
                                  <div><span style={{ color: 'var(--text-muted)' }}>Comments: </span>{c.comments}</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No submission</div>
                            )}
                            </div>{/* end flex-1 */}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredData.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <div className="text-4xl mb-3">✅</div>
          <div className="text-sm">No issues match this filter.</div>
        </div>
      )}
      </>)}

      {historyModal && (
        <HistoryModal
          modal={historyModal}
          onClose={() => setHistoryModal(null)}
          weekOptions={weekOptions}
          expandedSubs={expandedModalSubs}
          setExpandedSubs={setExpandedModalSubs}
        />
      )}

    </div>
  )
}
