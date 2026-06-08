'use client'
import { useState, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { supabase } from '../../lib/supabase'
import IBtn from './IBtn'
import AddSubInline from './AddSubInline'
import ArchivedSubsToggle from './ArchivedSubsToggle'
import DraggableSubList from './DraggableSubList'
import DragGrip from './DragGrip'
import { toLetter, fmtDate } from '../../lib/utils'

type SubObjective = {
  id: string
  title: string
  short_title?: string | null
  is_active?: boolean | null
  sort_order?: number | null
  created_at?: string | null
}
type Objective = {
  id: string
  title: string
  short_title?: string | null
  target_date?: string | null
  created_at?: string | null
  sub_objectives?: SubObjective[] | null
}
type EditObjState = Record<string, { title: string; short_title?: string; target_date?: string | null }>
type EditSubState = Record<string, Record<string, { title?: string; short_title?: string }>>

// Drag-reorderable list of a person's active strategic objectives. Each card flips
// into an Edit mode that lets the manager rename the objective and all of its
// sub-objectives at once, archive/delete either, and add new sub-objectives.
export default function DraggableObjList({ objs, userId, editingObjs, setEditingObjs, archiveObj, deleteObj, archiveSub, deleteSub, restoreSub, addSubToObj, reorderObj, reorderSub, onSave }: {
  objs: Objective[]
  userId: string
  editingObjs: EditObjState
  setEditingObjs: Dispatch<SetStateAction<EditObjState>>
  archiveObj: (objId: string) => void | Promise<void>
  deleteObj: (objId: string) => void | Promise<void>
  archiveSub: (subId: string) => void | Promise<void>
  deleteSub: (subId: string) => void | Promise<void>
  restoreSub: (subId: string) => void | Promise<void>
  addSubToObj: (objId: string, title: string) => void | Promise<void>
  reorderObj: (userId: string, objId: string, newIndex: number, oldIndex: number) => void | Promise<void>
  reorderSub: (objId: string, subId: string, newIndex: number, oldIndex: number) => void | Promise<void>
  onSave: () => void | Promise<void>
}) {
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const [editingSubsForObj, setEditingSubsForObj] = useState<EditSubState>({}) // { [objId]: { [subId]: title } }

  function handleDragStart(index: number) { dragItem.current = index }
  function handleDragEnter(index: number) { dragOverItem.current = index }
  async function handleDragEnd(objId: string) {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorderObj(userId, objId, dragOverItem.current, dragItem.current)
    dragItem.current = null; dragOverItem.current = null
  }

  function startEditObj(obj: Objective) {
    setEditingObjs(prev => ({ ...prev, [obj.id]: { title: obj.title, short_title: obj.short_title || '', target_date: obj.target_date } }))
    // seed the sub edit fields too
    const subsMap: Record<string, { title: string; short_title: string }> = {}
    const activeSubs = (obj.sub_objectives || []).filter(s => s.is_active)
    activeSubs.forEach(s => { subsMap[s.id] = { title: s.title, short_title: s.short_title || '' } })
    setEditingSubsForObj(prev => ({ ...prev, [obj.id]: subsMap }))
  }

  async function saveAllEdits(obj: Objective) {
    await supabase.from('strategic_objectives').update({
      title: editingObjs[obj.id].title, short_title: editingObjs[obj.id].short_title || null, target_date: editingObjs[obj.id].target_date || null,
    }).eq('id', obj.id)

    const subsMap = editingSubsForObj[obj.id] || {}
    const subResults = await Promise.all(Object.entries(subsMap).map(([subId, val]) =>
      supabase.from('sub_objectives').update({ title: val.title, short_title: val.short_title || null }).eq('id', subId)
    ))
    const subError = subResults.find(r => r.error)
    if (subError?.error) { console.error('Sub save error:', subError.error); alert('Error saving sub-objectives: ' + subError.error.message) }

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
        const activeSubs = (obj.sub_objectives || []).filter(s => s.is_active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
        const archivedSubs = (obj.sub_objectives || []).filter(s => !s.is_active)

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
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 flex items-center rounded text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(37, 99, 235,0.4)' }}>
                    <span className="text-sm font-medium pl-3" style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{objIdx + 1}.</span>
                    <input value={editingObjs[obj.id]?.title ?? obj.title}
                      onChange={e => setEditingObjs(prev => ({ ...prev, [obj.id]: { ...prev[obj.id], title: e.target.value } }))}
                      className="flex-1 px-2 py-1 text-sm"
                      style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }} />
                  </div>
                  <input value={editingObjs[obj.id]?.short_title ?? ''}
                    onChange={e => setEditingObjs(prev => ({ ...prev, [obj.id]: { ...prev[obj.id], short_title: e.target.value } }))}
                    className="px-2 py-1 rounded text-xs"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(37, 99, 235,0.3)', color: 'var(--text-primary)', width: 130 }}
                    placeholder="Short title (tile)" />
                </div>
              ) : (
                <><span className="flex-1 text-sm font-medium text-slate-700">{objIdx + 1}. {obj.title}{obj.short_title && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>({obj.short_title})</span>}</span>{obj.created_at && <span className="text-xs ml-1" style={{ color: "var(--text-muted)", opacity: 0.5, fontSize: 10 }} title={"Created " + fmtDate(obj.created_at)}>Date Created: {fmtDate(obj.created_at)}</span>}</>
              )}

              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {isEditing ? (
                  <>
                    <IBtn onClick={() => saveAllEdits(obj)} title='Save' color='#34D399' bg='rgba(52,211,153,0.15)' bdr='rgba(52,211,153,0.3)'>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5'><polyline points='20 6 9 17 4 12'/></svg>
                    </IBtn>
                    <IBtn onClick={() => archiveObj(obj.id)} title='Archive' color='#F59E0B' bg='rgba(245,158,11,0.1)' bdr='rgba(245,158,11,0.2)'>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><rect x='2' y='3' width='20' height='5' rx='1'/><path d='M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8'/><path d='M10 12h4'/></svg>
                    </IBtn>
                    <IBtn onClick={() => deleteObj(obj.id)} title='Delete' color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)'>
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
                // edit all subs at once
                <>
                  {activeSubs.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", marginRight: 6 }}>{toLetter(activeSubs.indexOf(sub))}.</span>
                      <input
                        value={editingSubsForObj[obj.id]?.[sub.id]?.title ?? sub.title}
                        onChange={e => setEditingSubsForObj(prev => ({
                          ...prev,
                          [obj.id]: { ...prev[obj.id], [sub.id]: { ...prev[obj.id]?.[sub.id], title: e.target.value } }
                        }))}
                        className="flex-1 px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--bg-base)', border: '1px solid rgba(37, 99, 235,0.3)', color: 'var(--text-primary)' }}
                        placeholder="Full title"
                      />
                      <input
                        value={editingSubsForObj[obj.id]?.[sub.id]?.short_title ?? sub.short_title ?? ''}
                        onChange={e => setEditingSubsForObj(prev => ({
                          ...prev,
                          [obj.id]: { ...prev[obj.id], [sub.id]: { ...prev[obj.id]?.[sub.id], short_title: e.target.value } }
                        }))}
                        className="px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--bg-base)', border: '1px solid rgba(37, 99, 235,0.3)', color: 'var(--text-primary)', width: 130 }}
                        placeholder="Short title (tile)"
                      />
                      <IBtn onClick={() => archiveSub(sub.id)} title='Archive' size={26} color='#F59E0B' bg='rgba(245,158,11,0.1)' bdr='rgba(245,158,11,0.2)'>
                        <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><rect x='2' y='3' width='20' height='5' rx='1'/><path d='M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8'/><path d='M10 12h4'/></svg>
                      </IBtn>
                      <IBtn onClick={() => deleteSub(sub.id)} title='Delete' size={26} color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)'>
                        <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>
                      </IBtn>
                    </div>
                  ))}
                  <AddSubInline objId={obj.id} onAdd={addSubToObj} nextLetter={toLetter(activeSubs.length)} />
                </>
              ) : (
                <DraggableSubList
                  subs={activeSubs}
                  objId={obj.id}
                  reorder={reorderSub}
                  showMeta
                />
              )}

              {!isEditing && archivedSubs.length > 0 && (
                <ArchivedSubsToggle subs={archivedSubs} restoreSub={restoreSub} />
              )}

              {!isEditing && <AddSubInline objId={obj.id} onAdd={addSubToObj} nextLetter={toLetter(activeSubs.length)} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
