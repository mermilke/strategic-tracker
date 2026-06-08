'use client'
import { useState } from 'react'
import { toLetter } from '../../lib/utils'

// Inline "add strategic objective" form: title, optional target date, and a growing list of sub-objectives.
export default function AddObjInline({ userId, onAdd, nextNum }: {
  userId: string
  onAdd: (userId: string, title: string, date: string, subs: string[]) => void | Promise<void>
  nextNum: number
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [subs, setSubs] = useState<string[]>([''])

  async function submit() {
    if (!title.trim()) return
    await onAdd(userId, title.trim(), date, subs.filter(s => s.trim()))
    setTitle(''); setDate(''); setSubs(['']); setOpen(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full text-xs py-2.5 rounded-lg transition-all mt-1"
      style={{ background: 'rgba(37, 99, 235,0.08)', color: '#2563EB', border: '1px dashed rgba(37, 99, 235,0.3)', cursor: 'pointer', fontWeight: 600 }}>
      + Add Strategic Objective
    </button>
  )

  return (
    <div className="rounded-lg p-4 mt-1 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(37, 99, 235,0.3)' }}>
      <div className="w-full flex items-center rounded-lg text-sm" style={{ background: 'var(--bg-base)', border: '1px solid rgba(37, 99, 235,0.4)' }}>
          <span className="text-sm font-medium pl-3" style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{nextNum}.</span>
          <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="Strategic Objective title…" className="flex-1 px-2 py-2 text-sm"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }} />
        </div>
      <div>
          <label className="text-xs" style={{ color: "var(--text-muted)", fontSize: 11 }}>Target Date <span style={{ opacity: 0.5 }}>(Optional)</span></label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg"
            style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 11 }} />
        </div>
      <div className="space-y-2">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Sub-objectives</label>
        {subs.map((s, i) => (
          <div key={i} className="flex gap-2">
            <div className="flex-1 flex items-center rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <span className="text-xs font-medium pl-3" style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{toLetter(i)}.</span>
                <input type="text" value={s} onChange={e => { const u = [...subs]; u[i] = e.target.value; setSubs(u) }}
                  onKeyDown={e => { if (e.key === 'Enter' && i === subs.length - 1 && s.trim()) setSubs([...subs, '']) }}
                  placeholder="Sub-objective title…" className="flex-1 px-2 py-1.5 text-xs"
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }} />
              </div>
            {subs.length > 1 && (
              <button onClick={() => setSubs(subs.filter((_, idx) => idx !== i))}
                style={{ padding: '0 8px', background: 'rgba(214,32,39,0.1)', color: '#F87171', border: '1px solid rgba(214,32,39,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>×</button>
            )}
          </div>
        ))}
        <button onClick={() => setSubs([...subs, ''])} className="text-xs w-full py-1.5 rounded-lg"
          style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
          + Add sub-objective
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white', border: 'none', cursor: 'pointer' }}>
          Add Objective
        </button>
        <button onClick={() => { setOpen(false); setTitle(''); setDate(''); setSubs(['']) }}
          style={{ padding: '0 12px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>
    </div>
  )
}
