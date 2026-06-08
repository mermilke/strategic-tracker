'use client'
import { formatWeekLabel } from '../../lib/utils'

// Week picker (dropdown + prev/next arrows) on the left, status filter chips on the right.
export default function WeekFilterBar({
  selectedWeek, setSelectedWeek, weekOptions, thisWeek, weekIdx, goBack, goForward,
  filterStatus, applyFilter, totalNotSubmitted, totalAtRisk, totalNeedsSupport, staleCount,
}) {
  return (
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
          ['stale', `No Update (${staleCount})`],
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
  )
}
