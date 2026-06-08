'use client'
import { useRef } from 'react'
import type { DragEvent } from 'react'
import DragGrip from './DragGrip'
import { toLetter, fmtDate } from '../../lib/utils'

type SubRow = {
  id: string
  title: string
  short_title?: string | null
  created_at?: string | null
  sort_order?: number | null
}

// Read-only, drag-reorderable list of sub-objective rows. Sub-objectives are edited
// through the parent objective's Edit mode, so there are no per-row controls here.
// `reorder(objId, subId, newIndex, oldIndex)` persists a move. `showMeta` adds the
// short_title and created-date annotations used for real (non-pending) sub-objectives.
export default function DraggableSubList({ subs, objId, reorder, showMeta = false }: {
  subs: SubRow[]
  objId: string
  reorder: (objId: string, subId: string, newIndex: number, oldIndex: number) => void | Promise<void>
  showMeta?: boolean
}) {
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  function handleDragStart(e: DragEvent, index: number) { e.stopPropagation(); dragItem.current = index }
  function handleDragEnter(index: number) { dragOverItem.current = index }
  async function handleDragEnd(e: DragEvent, subId: string) {
    e.stopPropagation()
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorder(objId, subId, dragOverItem.current, dragItem.current)
    dragItem.current = null; dragOverItem.current = null
  }

  return (
    <>
      {subs.map((sub, subIdx) => (
        <div key={sub.id}
          draggable
          onDragStart={e => handleDragStart(e, subIdx)}
          onDragEnter={() => handleDragEnter(subIdx)}
          onDragEnd={e => handleDragEnd(e, sub.id)}
          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'var(--bg-elevated)', cursor: 'grab' }}>

          <DragGrip variant="sub" />

          <span className="flex-shrink-0" style={{ fontSize: 13 }}>📌</span>
          <span className="flex-1 text-xs text-slate-600">
            {toLetter(subIdx)}. {sub.title}
            {showMeta && sub.short_title && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>({sub.short_title})</span>}
          </span>
          {showMeta && sub.created_at && <span style={{ fontSize: 9, color: "var(--text-muted)", opacity: 0.5 }} title={"Created " + fmtDate(sub.created_at)}>Created: {fmtDate(sub.created_at)}</span>}
        </div>
      ))}
    </>
  )
}
