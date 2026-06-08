'use client'
import { useState } from 'react'

// Collapsible list of archived sub-objectives under an active objective, each with a Restore action.
export default function ArchivedSubsToggle({ subs, restoreSub }: {
  subs: { id: string; title: string }[]
  restoreSub: (id: string) => void | Promise<void>
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="pt-1">
      <button onClick={() => setShow(s => !s)}
        className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded w-full"
        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: show ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        {show ? 'Hide' : 'Show'} {subs.length} archived sub-objective{subs.length > 1 ? 's' : ''}
      </button>
      {show && (
        <div className="mt-1 space-y-1">
          {subs.map(sub => (
            <div key={sub.id} className="flex items-center justify-between px-3 py-1.5 rounded text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>📌 {sub.title}</span>
              <button onClick={() => { if (confirm('Restore this sub-objective?')) restoreSub(sub.id) }}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)', cursor: 'pointer' }}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
