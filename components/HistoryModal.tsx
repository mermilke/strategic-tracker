'use client'
import { format } from 'date-fns'
import { STATUS_HEX, STATUS_LABELS } from '../lib/utils'

const toLetter = i => String.fromCharCode(65 + i)

// Week-by-week history for a single sub-objective, or every sub under an
// objective. `modal` is { type, title, userName, subs }.
export default function HistoryModal({ modal, onClose, weekOptions, expandedSubs, setExpandedSubs }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      ref={el => el?.focus()}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, outline: 'none' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1E293B' }}>
              {modal.type === 'objective' ? '🎯' : '📌'} {modal.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{modal.userName}</div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px 24px' }}>
          {modal.type === 'objective' && modal.subs.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setExpandedSubs(new Set(modal.subs.map(s => s.id)))}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.25)', cursor: 'pointer' }}
              >Expand all</button>
              <button
                onClick={() => setExpandedSubs(new Set())}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--text-muted)', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer' }}
              >Collapse all</button>
            </div>
          )}

          {modal.subs.map((sub, si) => {
            const isObjectiveView = modal.type === 'objective' && modal.subs.length > 1
            const isExpanded = !isObjectiveView || expandedSubs.has(sub.id)
            const latestCheckin = isObjectiveView ? [...weekOptions].reverse().reduce((found, w) => found || sub.weekly_checkins?.find(ch => ch.week_start === w), null) : null
            const latestStatus = latestCheckin?.status
            const latestColor = latestStatus ? STATUS_HEX[latestStatus] : '#94A3B8'

            return (
              <div key={sub.id} style={{ marginBottom: si < modal.subs.length - 1 ? (isObjectiveView ? 8 : 0) : 0 }}>
                {isObjectiveView ? (
                  <div
                    onClick={() => {
                      const next = new Set(expandedSubs)
                      next.has(sub.id) ? next.delete(sub.id) : next.add(sub.id)
                      setExpandedSubs(next)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      background: isExpanded ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${isExpanded ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)'}`,
                      marginBottom: isExpanded ? 8 : 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B', flex: 1, minWidth: 0 }}>📌 {toLetter(si)}. {sub.title}</span>
                    {latestStatus && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: latestColor, background: `${latestColor}20`, padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>
                        {STATUS_LABELS[latestStatus]}
                      </span>
                    )}
                  </div>
                ) : null}

                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: isObjectiveView && si < modal.subs.length - 1 ? 8 : 0 }}>
                    {[...weekOptions].reverse().map(week => {
                      const c = sub.weekly_checkins?.find(ch => ch.week_start === week)
                      const weekLabel = format(new Date(week + 'T00:00:00'), 'MMM d, yyyy')
                      if (!c) {
                        return (
                          <div key={week} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{weekLabel}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No submission</span>
                            </div>
                          </div>
                        )
                      }
                      const statusColor = STATUS_HEX[c.status] || '#94A3B8'
                      const statusLabel = STATUS_LABELS[c.status] || c.status
                      return (
                        <div key={week} style={{ padding: '12px 14px', borderRadius: 10, background: `${statusColor}10`, border: `1px solid ${statusColor}30` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (c.comments || c.progress_this_week) ? 8 : 0 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{weekLabel}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, color: c.progress_this_week ? '#34D399' : '#F87171' }}>
                                {c.progress_this_week ? '✓ Progress' : '✗ No progress'}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, background: `${statusColor}20`, padding: '2px 8px', borderRadius: 6 }}>
                                {statusLabel}
                              </span>
                            </div>
                          </div>
                          {c.comments && (
                            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>
                              {c.comments}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
