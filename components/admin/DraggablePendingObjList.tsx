'use client'
import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import IBtn from './IBtn'
import AddSubInline from './AddSubInline'
import DraggableSubList from './DraggableSubList'
import DragGrip from './DragGrip'
import { toLetter, fmtDate } from '../../lib/utils'

type PendingSub = { id: string; title: string; sort_order?: number | null }
type PendingObj = {
  id: string
  title: string
  target_date?: string | null
  pending_sub_objectives?: PendingSub[] | null
}

// Drag-reorderable list of objectives staged for a person who has not signed up yet.
// Mirrors DraggableObjList but against the pending_* tables, with no archive concept
// and a simpler edit mode (objective title plus sub-objective titles).
export default function DraggablePendingObjList({ objs, email, deletePendingObj, deletePendingSub, addSubToPendingObj, reorderPendingObj, reorderPendingSub, onSave }: {
  objs: PendingObj[]
  email: string
  deletePendingObj: (objId: string) => void | Promise<void>
  deletePendingSub: (subId: string) => void | Promise<void>
  addSubToPendingObj: (objId: string, title: string) => void | Promise<void>
  reorderPendingObj: (email: string, objId: string, newIndex: number, oldIndex: number) => void | Promise<void>
  reorderPendingSub: (objId: string, subId: string, newIndex: number, oldIndex: number) => void | Promise<void>
  onSave: () => void | Promise<void>
}) {
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const [editingObjs, setEditingObjs] = useState<Record<string, { title: string; target_date?: string | null }>>({})
  const [editingSubsForObj, setEditingSubsForObj] = useState<Record<string, Record<string, string>>>({})

  function handleDragStart(index: number) { dragItem.current = index }
  function handleDragEnter(index: number) { dragOverItem.current = index }
  async function handleDragEnd(objId: string) {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorderPendingObj(email, objId, dragOverItem.current, dragItem.current)
    dragItem.current = null; dragOverItem.current = null
  }

  function startEditObj(obj: PendingObj) {
    setEditingObjs(prev => ({ ...prev, [obj.id]: { title: obj.title, target_date: obj.target_date } }))
    const subsMap: Record<string, string> = {}
    const subs = (obj.pending_sub_objectives || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    subs.forEach(s => { subsMap[s.id] = s.title })
    setEditingSubsForObj(prev => ({ ...prev, [obj.id]: subsMap }))
  }

  async function saveAllEdits(obj: PendingObj) {
    await supabase.from('pending_objectives').update({
      title: editingObjs[obj.id].title, target_date: editingObjs[obj.id].target_date || null,
    }).eq('id', obj.id)
    const subsMap = editingSubsForObj[obj.id] || {}
    await Promise.all(Object.entries(subsMap).map(([subId, title]) =>
      supabase.from('pending_sub_objectives').update({ title }).eq('id', subId)
    ))
    setEditingObjs(prev => { const n = { ...prev }; delete n[obj.id]; return n })
    setEditingSubsForObj(prev => { const n = { ...prev }; delete n[obj.id]; return n })
    await onSave()
  }

  function cancelEdit(objId: string) {
    setEditingObjs(prev => { const n = { ...prev }; delete n[objId]; return n })
    setEditingSubsForObj(prev => { const n = { ...prev }; delete n[objId]; return n })
  }

  return (
    <div className="space-y-3">
      {objs.map((obj, objIdx) => {
        const isEditing = editingObjs?.[obj.id] !== undefined
        const subs = (obj.pending_sub_objectives || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

        return (
          <div key={obj.id}
            draggable
            onDragStart={() => handleDragStart(objIdx)}
            onDragEnter={() => handleDragEnter(objIdx)}
            onDragEnd={() => handleDragEnd(obj.id)}
            onDragOver={e => e.preventDefault()}
            className="rounded-lg"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', cursor: 'grab' }}>

            <div className="flex items-center gap-2 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <DragGrip variant="obj" />

              <span className="text-base mr-1">🎯</span>

              {isEditing ? (
                <div className="flex-1 flex items-center rounded text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(37, 99, 235,0.4)' }}>
                  <span className="text-sm font-medium pl-3" style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{objIdx + 1}.</span>
                  <input value={editingObjs[obj.id]?.title ?? obj.title}
                    onChange={e => setEditingObjs(prev => ({ ...prev, [obj.id]: { ...prev[obj.id], title: e.target.value } }))}
                    className="flex-1 px-2 py-1 text-sm"
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }} />
                </div>
              ) : (
                <><span className="flex-1 text-sm font-medium text-slate-700">{objIdx + 1}. {obj.title}</span>{obj.target_date && <span className="text-xs ml-1" style={{ color: 'var(--text-muted)', opacity: 0.5, fontSize: 10 }}>Target: {fmtDate(obj.target_date)}</span>}</>
              )}

              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {isEditing ? (
                  <>
                    <IBtn onClick={() => saveAllEdits(obj)} title='Save' color='#34D399' bg='rgba(52,211,153,0.15)' bdr='rgba(52,211,153,0.3)'>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5'><polyline points='20 6 9 17 4 12'/></svg>
                    </IBtn>
                    <IBtn onClick={() => deletePendingObj(obj.id)} title='Delete' color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)'>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>
                    </IBtn>
                    <IBtn onClick={() => cancelEdit(obj.id)} title='Cancel' color='var(--text-muted)' bg='transparent' bdr='var(--border)'>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>
                    </IBtn>
                  </>
                ) : (
                  <button onClick={() => startEditObj(obj)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(37, 99, 235,0.1)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.2)', cursor: 'pointer' }}>
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* sub-objectives */}
            <div className="p-3 space-y-1.5">
              {isEditing ? (
                <>
                  {subs.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{toLetter(subs.indexOf(sub))}.</span>
                      <input
                        value={editingSubsForObj[obj.id]?.[sub.id] ?? sub.title}
                        onChange={e => setEditingSubsForObj(prev => ({
                          ...prev,
                          [obj.id]: { ...prev[obj.id], [sub.id]: e.target.value }
                        }))}
                        className="flex-1 px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--bg-base)', border: '1px solid rgba(37, 99, 235,0.3)', color: 'var(--text-primary)' }}
                      />
                      <IBtn onClick={() => deletePendingSub(sub.id)} title='Delete' size={26} color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)'>
                        <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>
                      </IBtn>
                    </div>
                  ))}
                  <AddSubInline objId={obj.id} onAdd={(_, title) => addSubToPendingObj(obj.id, title)} nextLetter={toLetter(subs.length)} />
                </>
              ) : (
                <DraggableSubList
                  subs={subs}
                  objId={obj.id}
                  reorder={reorderPendingSub}
                />
              )}
              {!isEditing && <AddSubInline objId={obj.id} onAdd={(_, title) => addSubToPendingObj(obj.id, title)} nextLetter={toLetter(subs.length)} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
