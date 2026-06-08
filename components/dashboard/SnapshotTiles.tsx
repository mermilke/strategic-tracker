'use client'
import { calcWeeksNoProgress, STATUS_PROGRESS, STATUS_BAR_COLOR } from '../../lib/dashboard'
import { toLetter } from '../../lib/utils'

// The compact per-report grid at the top of the overview: one tile per direct report,
// each showing a colored progress bar per sub-objective. Clicking a name or bar expands
// that report's full card below and scrolls to it.
export default function SnapshotTiles({ data, weekOptions, selectedWeek, setExpandedUsers, setHighlightedSub }) {
  return (
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
  )
}
