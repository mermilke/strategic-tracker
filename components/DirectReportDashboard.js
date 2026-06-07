'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import StatusBadge from './StatusBadge'
import Spinner from './Spinner'
import { getCurrentWeekStart, formatWeekLabel, statusTint, bySortOrder } from '../lib/utils'
import { startOfWeek, format } from 'date-fns'

const toLetter = i => String.fromCharCode(65 + i)

export default function DirectReportDashboard({ currentUser }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewAsId = searchParams.get('viewAs')
  const checkinHref = viewAsId ? `/checkin?viewAs=${viewAsId}` : '/checkin'
  const [objectives, setObjectives] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkinMap, setCheckinMap] = useState({})
  const thisWeek = getCurrentWeekStart()
  const [selectedWeek, setSelectedWeek] = useState(thisWeek)

  // earliest week comes from this user's check-ins so the range covers all real
  // history. Memoized so it only recomputes when the objectives change.
  const weekOptions = useMemo(() => {
    const weeks = []
    const cur = startOfWeek(new Date(), { weekStartsOn: 1 })

    let earliest = null
    for (const obj of (objectives || [])) {
      for (const s of (obj.sub_objectives || [])) {
        for (const c of (s.weekly_checkins || [])) {
          if (c.week_start && (!earliest || c.week_start < earliest)) earliest = c.week_start
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
  }, [objectives])
  const weekIdx = weekOptions.indexOf(selectedWeek)
  const goBack = () => { if (weekIdx > 0) setSelectedWeek(weekOptions[weekIdx - 1]) }
  const goForward = () => { if (weekIdx < weekOptions.length - 1) setSelectedWeek(weekOptions[weekIdx + 1]) }

  useEffect(() => {
    if (currentUser) loadData()
  }, [currentUser, selectedWeek])

  async function loadData() {
    const { data: objs } = await supabase
      .from('strategic_objectives')
      .select(`*, sub_objectives(*, weekly_checkins(*))`)
      .eq('owner_id', currentUser.id)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')

    if (!objs) { setLoading(false); return }

    objs.forEach(obj => {
      if (obj.sub_objectives) {
        obj.sub_objectives = obj.sub_objectives
          .filter(s => s.is_active !== false)
          .sort(bySortOrder)
      }
    })

    const map = {}
    objs.forEach(obj => {
      obj.sub_objectives?.forEach(sub => {
        const entry = sub.weekly_checkins?.find(c => c.week_start === selectedWeek)
        if (entry) map[sub.id] = entry
      })
    })

    setObjectives(objs)
    setCheckinMap(map)
    setLoading(false)
  }

  const totalSubs = objectives.flatMap(o => o.sub_objectives || []).length
  const submitted = Object.keys(checkinMap).length
  const allDone = totalSubs > 0 && submitted >= totalSubs
  const isCurrentWeek = selectedWeek === thisWeek

  if (loading) return <Spinner />

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-slate-800 mb-1">
            Hi, {currentUser?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {formatWeekLabel(selectedWeek)}{!isCurrentWeek && ' (past week)'}
          </p>
        </div>

        {isCurrentWeek && (
          <button
            onClick={() => router.push(checkinHref)}
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: allDone ? 'rgba(52,211,153,0.1)' : 'rgba(37, 99, 235,0.15)',
              color: allDone ? '#34D399' : '#2563EB',
              border: `1px solid ${allDone ? 'rgba(52,211,153,0.3)' : 'rgba(37, 99, 235,0.3)'}`,
              cursor: 'pointer',
            }}
          >
            {allDone ? '✓ All up to date' : `📝 Update my statuses (${submitted}/${totalSubs})`}
          </button>
        )}
      </div>

      {/* Week selector */}
      <div className="flex items-center gap-2 mb-6">
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

      {/* Progress bar */}
      <div className="rounded-xl p-5 mb-8" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-600">{isCurrentWeek ? "This week's progress" : 'Submissions'}</span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{submitted} / {totalSubs} submitted</span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
          <div className="h-2 rounded-full transition-all duration-500" style={{
            width: totalSubs > 0 ? `${(submitted / totalSubs) * 100}%` : '0%',
            background: allDone ? 'linear-gradient(90deg, #34D399, #10B981)' : '#2563EB',
          }} />
        </div>
      </div>

      {/* objectives, same card style as the manager view */}
      <div className="space-y-6">
        {objectives.map((obj, objIdx) => (
          <div key={obj.id}>
            <div className="mb-3" style={{ letterSpacing: '0.02em' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>🎯 {objIdx + 1}. {obj.title}</span>
              {obj.target_date && (
                <span className="ml-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Target: {new Date(obj.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>

            <div className="space-y-2 pl-4">
              {(obj.sub_objectives || []).filter(s => s.is_active !== false).map((sub, subIdx) => {
                const c = checkinMap[sub.id]
                const status = c?.status
                const tint = statusTint(status)

                return (
                  <div key={sub.id} className="rounded-lg p-4 flex gap-3" style={{ background: tint.bg, border: `1px solid ${tint.border}` }}>
                    <div className="flex-shrink-0 mt-0.5" style={{ fontSize: 14 }}>📌</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="text-sm flex-1 min-w-0" style={{ color: tint.text }}>
                          {toLetter(subIdx)}. {sub.title}
                        </div>
                        <StatusBadge status={status} size="sm" />
                      </div>
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
        ))}
      </div>

      {objectives.length === 0 && (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <div className="text-5xl mb-4">📭</div>
          <div className="text-sm">No objectives have been set up yet.</div>
          <div className="text-xs mt-1">Contact your admin to get started.</div>
        </div>
      )}
    </div>
  )
}
