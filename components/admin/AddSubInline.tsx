'use client'
import { useState } from 'react'

// Inline "add sub-objective" control: a dashed button that expands into a titled input.
export default function AddSubInline({ objId, onAdd, nextLetter }: {
  objId: string
  onAdd: (objId: string, title: string) => void | Promise<void>
  nextLetter?: string
}) {
  const [val, setVal] = useState('')
  const [open, setOpen] = useState(false)
  async function submit() {
    if (!val.trim()) return
    await onAdd(objId, val.trim())
    setVal(''); setOpen(false)
  }
  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full text-xs py-2 rounded-lg transition-all"
      style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px dashed rgba(37, 99, 235,0.2)', cursor: 'pointer' }}>
      + Add sub-objective
    </button>
  )
  return (
    <div className="flex gap-2">
      <div className="flex-1 flex items-center rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid rgba(37, 99, 235,0.4)' }}>
        {nextLetter && <span className="text-xs font-medium pl-3" style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{nextLetter}.</span>}
        <input autoFocus type="text" value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
          placeholder="New sub-objective title…" className="flex-1 px-2 py-2 text-xs"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }} />
      </div>
      <button onClick={submit} style={{ padding: '0 12px', background: 'rgba(37, 99, 235,0.15)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.3)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Add</button>
      <button onClick={() => setOpen(false)} style={{ padding: '0 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>✕</button>
    </div>
  )
}
