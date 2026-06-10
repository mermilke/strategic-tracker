'use client'
import type { Dispatch, SetStateAction } from 'react'
import StatusBadge from '../StatusBadge'
import { statusTint, toLetter } from '../../lib/utils'
import { calcWeeksNoProgress } from '../../lib/dashboard'
import { onActivate } from '../../lib/a11y'
import type { DashUser, HistoryModalState } from './types'

// One expandable report row in the overview list: header (name, submission bar, view-as,
// alert chips) plus, when expanded, the report's objectives, opportunities, and sub-objective
// check-ins. Clicking the header toggles expansion; objective/sub titles open the history modal.
export default function DirectReportCard({
  u, expandedUsers, setExpandedUsers, router, filterStatus,
  weekOptions, selectedWeek, highlightedSub, setHistoryModal, setExpandedModalSubs,
}: {
  u: DashUser
  expandedUsers: Set<string>
  setExpandedUsers: Dispatch<SetStateAction<Set<string>>>
  router: { push: (href: string) => void }
  filterStatus: string
  weekOptions: string[]
  selectedWeek: string
  highlightedSub: string | null
  setHistoryModal: Dispatch<SetStateAction<HistoryModalState | null>>
  setExpandedModalSubs: Dispatch<SetStateAction<Set<string>>>
}) {
  return (
    <div id={`user-${u.id}`} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', scrollMarginTop: 80 }}>
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

          <button
            type="button"
            aria-label={expandedUsers.has(u.id) ? `Collapse ${u.full_name}` : `Expand ${u.full_name}`}
            aria-expanded={expandedUsers.has(u.id)}
            onClick={(e) => { e.stopPropagation(); setExpandedUsers(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; }) }}
            className="flex-shrink-0"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'var(--text-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: expandedUsers.has(u.id) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
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
            const openObjHistory = () => { setExpandedModalSubs(new Set()); setHistoryModal({ type: 'objective', title: obj.title, userName: u.full_name, subs: obj.sub_objectives }) }
            return (
            <div key={obj.id} id={`obj-${obj.id}`}>
              <div className="mb-3" style={{ letterSpacing: '0.02em' }}>
                <span
                  role="button" tabIndex={0} aria-label={`Open history for ${obj.title}`}
                  onClick={openObjHistory}
                  onKeyDown={onActivate(openObjHistory)}
                  style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', cursor: 'pointer', textDecoration: 'none' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.textDecoration = 'underline'}
                  onMouseLeave={e => (e.target as HTMLElement).style.textDecoration = 'none'}
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
                  const openSubHistory = () => setHistoryModal({ type: 'sub', title: sub.title, userName: u.full_name, subs: [sub] })
                  return (
                    <div key={sub.id} id={`sub-${sub.id}`} className="rounded-lg p-4 flex gap-3" style={{ transition: 'box-shadow 0.3s, transform 0.3s', boxShadow: highlightedSub === sub.id ? '0 0 0 2px #2563EB, 0 0 12px rgba(37, 99, 235,0.3)' : 'none', transform: highlightedSub === sub.id ? 'scale(1.01)' : 'none', background: tint.bg, border: `1px solid ${tint.border}` }}>
                      <div className="flex-shrink-0 mt-0.5" style={{ fontSize: 14 }}>📌</div>
                      <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div
                          role="button" tabIndex={0} aria-label={`Open history for ${sub.is_implicit ? 'weekly status' : sub.title}`}
                          onClick={openSubHistory}
                          onKeyDown={onActivate(openSubHistory)}
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
  )
}
