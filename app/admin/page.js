'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Navbar from '../../components/Navbar'

const toLetter = i => String.fromCharCode(65 + i)
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('users')
  const [expandedUsers, setExpandedUsers] = useState(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: 'success' })

  const [newObj, setNewObj] = useState({ title: '', userId: '', date: '', subs: [''] })
  const [editingObjs, setEditingObjs] = useState({})
  const [editingSub, setEditingSub] = useState(null)
  const [pendingEmail, setPendingEmail] = useState('')
  const [pendingName, setPendingName] = useState('')
  const [pendingUsers, setPendingUsers] = useState([])
  const [pendingObjectives, setPendingObjectives] = useState([])
  const [bugReports, setBugReports] = useState([])
  const [expandedPending, setExpandedPending] = useState(new Set())

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      const { data: prof } = await supabase.from('users').select('*').eq('id', session.user.id).single()
      if (!prof || (prof.role !== 'manager' && prof.role !== 'admin')) { router.push('/dashboard'); return }
      setProfile(prof)
      await loadData()
    }
    load()
  }, [])

  async function loadData() {
    const { data } = await supabase
      .from('users')
      .select(`*, strategic_objectives(*, sub_objectives(*))`)
      .order('full_name')
    setUsers(data || [])
    const { data: pending } = await supabase.from('pending_users').select('*').order('created_at', { ascending: false })
    const emails = (data || []).map(u => u.email.toLowerCase()); setPendingUsers((pending || []).filter(p => !emails.includes(p.email.toLowerCase())))
    const { data: pObjs } = await supabase.from('pending_objectives').select('*, pending_sub_objectives(*)').order('created_at')
    setPendingObjectives(pObjs || [])
    const { data: bugs } = await supabase.from('bug_reports').select('*, users(full_name, email)').order('created_at', { ascending: false })
    setBugReports(bugs || [])
    setLoading(false)
  }

  function showMsg(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: 'success' }), 3000)
  }

  async function addObjective() {
    if (!newObj.title || !newObj.userId) return
    const isPending = newObj.userId.startsWith('pending_')
    if (isPending) {
      const pendingId = newObj.userId.replace('pending_', '')
      const pu = pendingUsers.find(p => p.id === pendingId)
      if (!pu) { showMsg('Pending user not found', 'error'); return }
      const { data: obj, error } = await supabase.from('pending_objectives').insert({
        pending_user_email: pu.email, title: newObj.title,
        target_date: newObj.date || null, sort_order: 0,
      }).select().single()
      if (error) { showMsg(error.message, 'error'); return }
      const validSubs = newObj.subs.filter(s => s.trim())
      if (validSubs.length > 0) {
        await supabase.from('pending_sub_objectives').insert(
          validSubs.map((title, i) => ({ pending_objective_id: obj.id, title, sort_order: i }))
        )
      }
      showMsg('Objective added for pending user -- will transfer when they sign up!')
    } else {
      const { data: obj, error } = await supabase.from('strategic_objectives').insert({
        owner_id: newObj.userId, title: newObj.title,
        target_date: newObj.date || null, is_active: true, sort_order: 0,
      }).select().single()
      if (error) { showMsg(error.message, 'error'); return }
      const validSubs = newObj.subs.filter(s => s.trim())
      if (validSubs.length > 0) {
        await supabase.from('sub_objectives').insert(
          validSubs.map((title, i) => ({ objective_id: obj.id, title, sort_order: i, is_active: true }))
        )
      }
      showMsg('Objective added!')
    }
    setNewObj({ title: '', userId: '', date: '', subs: [''] })
    await loadData()
  }

  async function archiveObj(id) {
    await supabase.from('strategic_objectives').update({ is_active: false }).eq('id', id)
    setEditingObjs(prev => { const n = { ...prev }; delete n[id]; return n })
    showMsg('Objective archived -- find it in the Archived section')
    await loadData()
  }

  async function restoreObj(id) {
    await supabase.from('strategic_objectives').update({ is_active: true }).eq('id', id)
    showMsg('Objective restored!')
    await loadData()
  }

  async function deleteObj(id) {
    if (!confirm('Permanently delete this objective, all sub-objectives, and all check-in history? This cannot be undone.')) return
    const { error } = await supabase.from('strategic_objectives').delete().eq('id', id)
    if (error) { showMsg('Delete failed: ' + error.message, 'error'); return }
    setEditingObjs(prev => { const n = { ...prev }; delete n[id]; return n })
    showMsg('Objective permanently deleted')
    await loadData()
  }

  async function reorderObj(userId, objId, newIndex, oldIndex) {
    const userObjs = users.find(u => u.id === userId)?.strategic_objectives?.filter(o => o.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || '')) || []
    const reordered = [...userObjs]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    await Promise.all(reordered.map((o, i) =>
      supabase.from('strategic_objectives').update({ sort_order: i }).eq('id', o.id)
    ))
    await loadData()
  }

  async function saveEditSub() {
    if (!editingSub) return
    const { error } = await supabase.from('sub_objectives').update({ title: editingSub.title, short_title: editingSub.short_title || null }).eq('id', editingSub.id)
    if (error) { console.error('Sub save error:', error); alert('Error saving: ' + error.message); return }
    setEditingSub(null)
    showMsg('Sub-objective updated!')
    await loadData()
  }

  async function archiveSub(id) {
    await supabase.from('sub_objectives').update({ is_active: false }).eq('id', id)
    setEditingSub(null)
    showMsg('Sub-objective archived')
    await loadData()
  }

  async function restoreSub(id) {
    await supabase.from('sub_objectives').update({ is_active: true }).eq('id', id)
    showMsg('Sub-objective restored!')
    await loadData()
  }

  async function deleteSub(id) {
    if (!confirm('Permanently delete this sub-objective and all its check-in history?')) return
    const { error } = await supabase.from('sub_objectives').delete().eq('id', id)
    if (error) { showMsg('Delete failed: ' + error.message, 'error'); return }
    setEditingSub(null)
    showMsg('Sub-objective permanently deleted')
    await loadData()
  }

  async function reorderSub(objId, subId, newIndex, oldIndex) {
    const obj = users.flatMap(u => u.strategic_objectives || []).find(o => o.id === objId)
    const subs = (obj?.sub_objectives || []).filter(s => s.is_active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const reordered = [...subs]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    await Promise.all(reordered.map((s, i) =>
      supabase.from('sub_objectives').update({ sort_order: i }).eq('id', s.id)
    ))
    await loadData()
  }

  async function addObjForUser(userId, title, date, subs) {
    const { data: existing } = await supabase.from('strategic_objectives').select('sort_order').eq('owner_id', userId).eq('is_active', true).order('sort_order', { ascending: false }).limit(1)
    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1
    const { data: obj, error } = await supabase.from('strategic_objectives').insert({
      owner_id: userId, title, target_date: date || null, is_active: true, sort_order: nextOrder,
    }).select().single()
    if (error) { showMsg(error.message, 'error'); return }
    if (subs && subs.length > 0) {
      await supabase.from('sub_objectives').insert(
        subs.map((t, i) => ({ objective_id: obj.id, title: t, sort_order: i, is_active: true }))
      )
    }
    showMsg('Objective added!')
    await loadData()
  }

  async function addSubToObj(objId, title) {
    if (!title.trim()) return
    const { data: existing } = await supabase.from('sub_objectives').select('sort_order').eq('objective_id', objId).order('sort_order', { ascending: false }).limit(1)
    const nextOrder = (existing?.[0]?.sort_order || 0) + 1
    await supabase.from('sub_objectives').insert({ objective_id: objId, title, sort_order: nextOrder, is_active: true })
    showMsg('Sub-objective added!')
    await loadData()
  }

  async function addPendingUser() {
    if (!pendingEmail.trim()) return
    const { error } = await supabase.from('pending_users').insert({
      email: pendingEmail.trim().toLowerCase(), full_name: pendingName.trim() || null,
    })
    if (error) { showMsg(error.message, 'error'); return }
    showMsg('Person added!')
    setPendingEmail(''); setPendingName('')
    await loadData()
  }

  async function addObjForPendingUser(email, title, date, subs) {
    const { data: existing } = await supabase.from('pending_objectives').select('sort_order').eq('pending_user_email', email).order('sort_order', { ascending: false }).limit(1)
    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1
    const { data: obj, error } = await supabase.from('pending_objectives').insert({
      pending_user_email: email, title, target_date: date || null, sort_order: nextOrder,
    }).select().single()
    if (error) { showMsg(error.message, 'error'); return }
    if (subs && subs.length > 0) {
      await supabase.from('pending_sub_objectives').insert(
        subs.map((t, i) => ({ pending_objective_id: obj.id, title: t, sort_order: i }))
      )
    }
    showMsg('Objective added!')
    await loadData()
  }

  async function addSubToPendingObj(objId, title) {
    if (!title.trim()) return
    const { data: existing } = await supabase.from('pending_sub_objectives').select('sort_order').eq('pending_objective_id', objId).order('sort_order', { ascending: false }).limit(1)
    const nextOrder = (existing?.[0]?.sort_order || 0) + 1
    await supabase.from('pending_sub_objectives').insert({ pending_objective_id: objId, title, sort_order: nextOrder })
    showMsg('Sub-objective added!')
    await loadData()
  }

  async function deletePendingObj(id) {
    if (!confirm('Delete this pending objective and all its sub-objectives?')) return
    await supabase.from('pending_objectives').delete().eq('id', id)
    showMsg('Pending objective deleted')
    await loadData()
  }

  async function deletePendingSub(id) {
    if (!confirm('Delete this pending sub-objective?')) return
    await supabase.from('pending_sub_objectives').delete().eq('id', id)
    showMsg('Pending sub-objective deleted')
    await loadData()
  }

  async function deletePendingUser(id, email) {
    if (!confirm('Remove this pending person and all their pending objectives?')) return
    await supabase.from('pending_objectives').delete().eq('pending_user_email', email)
    await supabase.from('pending_users').delete().eq('id', id)
    showMsg('Pending person removed')
    await loadData()
  }

  async function reorderPendingObj(email, objId, newIndex, oldIndex) {
    const objs = pendingObjectives.filter(o => o.pending_user_email.toLowerCase() === email.toLowerCase())
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
    const reordered = [...objs]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    await Promise.all(reordered.map((o, i) =>
      supabase.from('pending_objectives').update({ sort_order: i }).eq('id', o.id)
    ))
    await loadData()
  }

  async function reorderPendingSub(objId, subId, newIndex, oldIndex) {
    const obj = pendingObjectives.find(o => o.id === objId)
    const subs = (obj?.pending_sub_objectives || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const reordered = [...subs]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    await Promise.all(reordered.map((s, i) =>
      supabase.from('pending_sub_objectives').update({ sort_order: i }).eq('id', s.id)
    ))
    await loadData()
  }

  async function generateResetLink(userEmail, userName) {
    showMsg('Generating reset link…', 'info')
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, action: 'generate_link' }),
      })
      const data = await res.json()
      if (!res.ok) {
        showMsg(data.error || 'Failed to generate link', 'error')
        return
      }
      try {
        await navigator.clipboard.writeText(data.link)
        showMsg(`Reset link for ${userName || userEmail} copied to clipboard! Share it with them directly.`)
      } catch {
        // clipboard blocked, fall back to a prompt
        prompt(`Reset link for ${userName || userEmail} (copy this):`, data.link)
        showMsg('Reset link generated -- copy it from the dialog above.')
      }
    } catch (err) {
      showMsg('Network error: ' + err.message, 'error')
    }
  }

  const directReports = users.filter(u => u.role === 'direct_report')
  const allPeople = [
    ...directReports.map(u => ({ id: u.id, name: u.full_name, email: u.email, type: 'user' })),
    ...pendingUsers.map(p => ({ id: `pending_${p.id}`, name: p.full_name || p.email, email: p.email, type: 'pending' })),
  ]

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2563EB', borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Navbar user={user} profile={profile} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-slate-800 mb-1">Manage Team</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Set up people, objectives, and sub-objectives</p>
        </div>

        {msg.text && (
          <div className="mb-6 px-4 py-3 rounded-lg text-sm" style={{
            background: msg.type === 'error' ? 'rgba(214,32,39,0.1)' : msg.type === 'info' ? 'rgba(37, 99, 235,0.1)' : 'rgba(52,211,153,0.1)',
            color: msg.type === 'error' ? '#F87171' : msg.type === 'info' ? '#2563EB' : '#34D399',
            border: `1px solid ${msg.type === 'error' ? 'rgba(214,32,39,0.2)' : msg.type === 'info' ? 'rgba(37, 99, 235,0.2)' : 'rgba(52,211,153,0.2)'}`,
          }}>{msg.text}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[['users', '👥 People & Objectives'], ['archived', '📦 Archived'], ['pending', '📧 Add Person'], ['bugs', '🐛 Bug Reports'], ['settings', '⚙️ Settings']].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className="text-sm px-4 py-2 rounded-lg transition-all" style={{
              background: activeTab === tab ? 'rgba(37, 99, 235,0.15)' : 'var(--bg-surface)',
              color: activeTab === tab ? '#2563EB' : 'var(--text-muted)',
              border: `1px solid ${activeTab === tab ? 'rgba(37, 99, 235,0.3)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>

        {/* people & objectives */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {pendingUsers.map(p => {
              const pObjs = pendingObjectives.filter(o => o.pending_user_email.toLowerCase() === p.email.toLowerCase())
              const isExpPending = expandedPending.has(p.id)
              return (
                <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(37, 99, 235,0.04)', border: '1px solid rgba(37, 99, 235,0.15)' }}>
                  <div className="px-5 py-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedPending(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                    style={{ borderBottom: isExpPending ? '1px solid rgba(37, 99, 235,0.15)' : 'none' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: 'rgba(37, 99, 235,0.15)', color: '#2563EB', border: '1px dashed rgba(37, 99, 235,0.3)' }}>
                        {(p.full_name || p.email)?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-700">{p.full_name || p.email} <span className="text-xs px-1.5 py-0.5 rounded ml-1" style={{ background: 'rgba(37, 99, 235,0.15)', color: '#2563EB', fontSize: 10 }}>Pending</span></div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{pObjs.length} objective{pObjs.length !== 1 ? 's' : ''}</span>
                      <IBtn onClick={e => { e.stopPropagation(); deletePendingUser(p.id, p.email) }} title='Remove' color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)' size={26}>
                        <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>
                      </IBtn>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: 'var(--text-muted)', transform: isExpPending ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </div>

                  {isExpPending && (
                    <div className="p-5 space-y-3">
                      <DraggablePendingObjList
                        objs={pObjs}
                        email={p.email}
                        deletePendingObj={deletePendingObj}
                        deletePendingSub={deletePendingSub}
                        addSubToPendingObj={addSubToPendingObj}
                        reorderPendingObj={reorderPendingObj}
                        reorderPendingSub={reorderPendingSub}
                        onSave={loadData}
                      />
                      {pObjs.length === 0 && (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No objectives yet -- add one below.</p>
                      )}
                      <AddObjInline userId={p.id} onAdd={(_, title, date, subs) => addObjForPendingUser(p.email, title, date, subs)} nextNum={pObjs.length + 1} />
                    </div>
                  )}
                </div>
              )
            })}

            {directReports.map(u => {
              const activeObjs = (u.strategic_objectives || []).filter(o => o.is_active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
              const archivedObjs = (u.strategic_objectives || []).filter(o => !o.is_active)
              const isExpanded = expandedUsers.has(u.id)
              return (
                <div key={u.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="px-5 py-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedUsers(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                    style={{ borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB' }}>
                        {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-700">{u.full_name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{activeObjs.length} active</span>
                      {archivedObjs.length > 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{archivedObjs.length} archived</span>}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-5 space-y-3">
                      <DraggableObjList
                        objs={activeObjs}
                        userId={u.id}
                        editingObjs={editingObjs}
                        setEditingObjs={setEditingObjs}
                        editingSub={editingSub}
                        setEditingSub={setEditingSub}
                        saveEditSub={saveEditSub}
                        archiveObj={archiveObj}
                        deleteObj={deleteObj}
                        archiveSub={archiveSub}
                        deleteSub={deleteSub}
                        restoreSub={restoreSub}
                        addSubToObj={addSubToObj}
                        reorderObj={reorderObj}
                        reorderSub={reorderSub}
                        onSave={loadData}
                      />

                      {activeObjs.length === 0 && (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No active objectives.</p>
                      )}

                      <AddObjInline userId={u.id} onAdd={addObjForUser} nextNum={activeObjs.length + 1} />

                      {/* archived */}
                      {archivedObjs.length > 0 && (
                        <div>
                          <button onClick={() => setShowArchived(s => !s)}
                            className="flex items-center gap-2 text-xs py-2 px-3 rounded-lg w-full mt-2"
                            style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              style={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                            {showArchived ? 'Hide' : 'Show'} {archivedObjs.length} archived objective{archivedObjs.length > 1 ? 's' : ''}
                          </button>

                          {showArchived && (
                            <div className="mt-2 space-y-2">
                              {archivedObjs.map(obj => {
                                const archivedSubs = (obj.sub_objectives || []).filter(s => !s.is_active)
                                const activeSubs = (obj.sub_objectives || []).filter(s => s.is_active)
                                return (
                                  <div key={obj.id} className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.02)', border: '1px dashed rgba(0,0,0,0.06)' }}>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>Archived</span>
                                        <span className="text-sm text-slate-500">{obj.title}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={() => restoreObj(obj.id)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)', cursor: 'pointer' }}>Restore</button>
                                        <IBtn onClick={() => deleteObj(obj.id)} title='Delete' color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)'>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>
                    </IBtn>
                                      </div>
                                    </div>
                                    {(activeSubs.length > 0 || archivedSubs.length > 0) && (
                                      <div className="pl-4 space-y-1 mt-2">
                                        {[...activeSubs, ...archivedSubs].map(sub => (
                                          <div key={sub.id} className="flex items-center justify-between text-xs py-1">
                                            <span style={{ color: sub.is_active ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                              📌 {sub.title} {!sub.is_active && <span style={{ color: '#F59E0B' }}>(archived)</span>}
                                            </span>
                                            {!sub.is_active && (
                                              <button onClick={() => restoreSub(sub.id)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)', cursor: 'pointer' }}>Restore</button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}


        {/* archived */}
        {activeTab === 'archived' && (
          <div className="space-y-4">
            {directReports.map(u => {
              const archivedObjs = (u.strategic_objectives || []).filter(o => !o.is_active)
              const objsWithArchivedSubs = (u.strategic_objectives || []).filter(o => o.is_active && (o.sub_objectives || []).some(s => !s.is_active))
              if (archivedObjs.length === 0 && objsWithArchivedSubs.length === 0) return null
              return (
                <div key={u.id} className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB' }}>
                      {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{u.full_name}</span>
                  </div>
                  {archivedObjs.map(obj => (
                    <div key={obj.id} className="rounded-lg p-3 mb-2" style={{ background: 'rgba(0,0,0,0.02)', border: '1px dashed rgba(0,0,0,0.06)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>Archived Objective</span>
                          <span className="text-sm text-slate-500">{obj.title}</span>
                          <span style={{ fontSize: 9, color: "var(--text-muted)", opacity: 0.5 }}>Date Archived: {fmtDate(obj.updated_at || obj.created_at)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => restoreObj(obj.id)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)', cursor: 'pointer' }}>Restore</button>
                          <IBtn onClick={() => deleteObj(obj.id)} title='Delete' color='#F87171' bg='rgba(214,32,39,0.1)' bdr='rgba(214,32,39,0.2)' size={26}>
                            <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>
                          </IBtn>
                        </div>
                      </div>
                    </div>
                  ))}
                  {objsWithArchivedSubs.map(obj => {
                    const arSubs = (obj.sub_objectives || []).filter(s => !s.is_active)
                    return (
                      <div key={'subs-' + obj.id} className="rounded-lg p-3 mb-2" style={{ background: 'rgba(0,0,0,0.02)', border: '1px dashed rgba(0,0,0,0.06)' }}>
                        <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>🎯 {obj.title}</div>
                        {arSubs.map(sub => (
                          <div key={sub.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', fontSize: 10 }}>Archived</span>
                              <span style={{ color: 'var(--text-muted)' }}>{sub.title}</span>
                              <span style={{ fontSize: 9, color: "var(--text-muted)", opacity: 0.5 }}>Date Archived: {fmtDate(sub.updated_at || sub.created_at)}</span>
                            </div>
                            <button onClick={() => restoreSub(sub.id)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)', cursor: 'pointer' }}>Restore</button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {directReports.every(u => {
              const archivedObjs = (u.strategic_objectives || []).filter(o => !o.is_active)
              const objsWithArchivedSubs = (u.strategic_objectives || []).filter(o => o.is_active && (o.sub_objectives || []).some(s => !s.is_active))
              return archivedObjs.length === 0 && objsWithArchivedSubs.length === 0
            }) && (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No archived items.</p>
            )}
          </div>
        )}

        {/* bug reports */}
        {activeTab === 'bugs' && (
          <div className="space-y-3">
            {bugReports.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🐛</div>
                <p className="text-sm">No bug reports yet -- that&apos;s a good sign!</p>
              </div>
            ) : (
              bugReports.map(bug => (
                <div key={bug.id} className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {bug.users?.full_name || 'Unknown'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                          background: bug.status === 'open' ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)',
                          color: bug.status === 'open' ? '#EF4444' : '#34D399',
                          border: `1px solid ${bug.status === 'open' ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'}`,
                        }}>
                          {bug.status}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(bug.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                        Page: <span style={{ color: '#2563EB' }}>{bug.page}</span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {bug.description}
                      </p>
                      {bug.screenshot_path && (
                        <button
                          onClick={async () => {
                            const { data } = await supabase.storage.from('bug-screenshots').createSignedUrl(bug.screenshot_path, 7200)
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                          }}
                          className="text-xs mt-2 flex items-center gap-1"
                          style={{ color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          📷 View Screenshot
                        </button>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        const newStatus = bug.status === 'open' ? 'resolved' : 'open'
                        await supabase.from('bug_reports').update({ status: newStatus }).eq('id', bug.id)
                        setBugReports(prev => prev.map(b => b.id === bug.id ? { ...b, status: newStatus } : b))
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{
                        background: bug.status === 'open' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                        color: bug.status === 'open' ? '#34D399' : '#EF4444',
                        border: `1px solid ${bug.status === 'open' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {bug.status === 'open' ? '✓ Resolve' : '↩ Reopen'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* password reset links */}
            <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <h2 className="font-display text-xl text-slate-800 mb-2">Password Reset</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Generate a password reset link for any team member. The link is copied to your clipboard -- share it with them directly.</p>
              <div className="space-y-2">
                {directReports.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB' }}>
                        {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-700">{u.full_name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                      </div>
                    </div>
                    <button onClick={() => generateResetLink(u.email, u.full_name)}
                      title="Generate password reset link (copies to clipboard)"
                      style={{ fontSize: 11, padding: '6px 14px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      🔑 Generate Reset Link
                    </button>
                  </div>
                ))}
                {directReports.length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No team members yet.</p>
                )}
              </div>
            </div>

            {/* service role key status */}
            <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <h2 className="font-display text-lg text-slate-800 mb-2">Configuration</h2>
              <div className="text-xs space-y-2" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <p>💡 Password reset links require the <code style={{ background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>SUPABASE_SERVICE_ROLE_KEY</code> environment variable to be set on Vercel.</p>
                <p>💡 To invite new users: go to <strong style={{ color: 'var(--text-secondary)' }}>Supabase → Authentication → Users → Invite user</strong></p>
              </div>
            </div>
          </div>
        )}

                {activeTab === 'pending' && (
          <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h2 className="font-display text-xl text-slate-800 mb-2">Add a Person</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Add someone before they create an account. Assign their objectives, then invite them when ready.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Full name</label>
                <input type="text" value={pendingName} onChange={e => setPendingName(e.target.value)} placeholder="Jane Smith"
                  className="w-full px-4 py-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email</label>
                <input type="email" value={pendingEmail} onChange={e => setPendingEmail(e.target.value)} placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-lg text-sm"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <button onClick={addPendingUser} className="w-full py-3 rounded-lg text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(37, 99, 235,0.2)' }}>
                Add Person
              </button>
            </div>
            <div className="mt-6 px-4 py-3 rounded-lg text-xs" style={{ background: 'rgba(37, 99, 235,0.06)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.15)', lineHeight: 1.7 }}>
              💡 To send their login invite: Supabase → Authentication → Users → Invite user, then enter their email.
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// little icon button
function IBtn({ onClick, title, color, bg, bdr, size = 30, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6, background: bg, color, border: '1px solid ' + bdr, cursor: 'pointer', padding: 0, flexShrink: 0,
    }}>{children}</button>
  )
}

function DraggableObjList({ objs, userId, editingObjs, setEditingObjs, editingSub, setEditingSub, saveEditSub, archiveObj, deleteObj, archiveSub, deleteSub, restoreSub, addSubToObj, reorderObj, reorderSub, onSave }) {
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)
  const [editingSubsForObj, setEditingSubsForObj] = useState({}) // { [objId]: { [subId]: title } }

  function handleDragStart(index) { dragItem.current = index }
  function handleDragEnter(index) { dragOverItem.current = index }
  async function handleDragEnd(objId) {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorderObj(userId, objId, dragOverItem.current, dragItem.current)
    dragItem.current = null; dragOverItem.current = null
  }

  function startEditObj(obj) {
    setEditingObjs(prev => ({ ...prev, [obj.id]: { title: obj.title, short_title: obj.short_title || '', target_date: obj.target_date } }))
    // seed the sub edit fields too
    const subsMap = {}
    const activeSubs = (obj.sub_objectives || []).filter(s => s.is_active)
    activeSubs.forEach(s => { subsMap[s.id] = { title: s.title, short_title: s.short_title || '' } })
    setEditingSubsForObj(prev => ({ ...prev, [obj.id]: subsMap }))
  }

  async function saveAllEdits(obj) {
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

  function cancelEdit(objId) {
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', cursor: 'grab', opacity: 0.4, flexShrink: 0 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 16, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />)}
              </div>

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
                  editingSub={editingSub}
                  setEditingSub={setEditingSub}
                  saveEditSub={saveEditSub}
                  archiveSub={archiveSub}
                  deleteSub={deleteSub}
                  reorderSub={reorderSub}
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

// subs are edited via the parent objective's Edit mode, no per-sub edit buttons here
function DraggableSubList({ subs, objId, editingSub, setEditingSub, saveEditSub, archiveSub, deleteSub, reorderSub }) {
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  function handleDragStart(e, index) { e.stopPropagation(); dragItem.current = index }
  function handleDragEnter(index) { dragOverItem.current = index }
  async function handleDragEnd(e, subId) {
    e.stopPropagation()
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorderSub(objId, subId, dragOverItem.current, dragItem.current)
    dragItem.current = null; dragOverItem.current = null
  }

  return (
    <>
      {subs.map((sub, subIdx) => {
        return (
          <div key={sub.id}
            draggable
            onDragStart={e => handleDragStart(e, subIdx)}
            onDragEnter={() => handleDragEnter(subIdx)}
            onDragEnd={e => handleDragEnd(e, sub.id)}
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', cursor: 'grab' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5, padding: '2px 4px', cursor: 'grab', opacity: 0.35, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 12, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />)}
            </div>

            <span className="flex-shrink-0" style={{ fontSize: 13 }}>📌</span>
            <span className="flex-1 text-xs text-slate-600">
              {toLetter(subIdx)}. {sub.title}
              {sub.short_title && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>({sub.short_title})</span>}
            </span>
              {sub.created_at && <span style={{ fontSize: 9, color: "var(--text-muted)", opacity: 0.5 }} title={"Created " + fmtDate(sub.created_at)}>Created: {fmtDate(sub.created_at)}</span>}
          </div>
        )
      })}
    </>
  )
}


function ArchivedSubsToggle({ subs, restoreSub }) {
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

function AddSubInline({ objId, onAdd, nextLetter }) {
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

function DraggablePendingObjList({ objs, email, deletePendingObj, deletePendingSub, addSubToPendingObj, reorderPendingObj, reorderPendingSub, onSave }) {
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)
  const [editingObjs, setEditingObjs] = useState({})
  const [editingSubsForObj, setEditingSubsForObj] = useState({})

  function handleDragStart(index) { dragItem.current = index }
  function handleDragEnter(index) { dragOverItem.current = index }
  async function handleDragEnd(objId) {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorderPendingObj(email, objId, dragOverItem.current, dragItem.current)
    dragItem.current = null; dragOverItem.current = null
  }

  function startEditObj(obj) {
    setEditingObjs(prev => ({ ...prev, [obj.id]: { title: obj.title, target_date: obj.target_date } }))
    const subsMap = {}
    const subs = (obj.pending_sub_objectives || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    subs.forEach(s => { subsMap[s.id] = s.title })
    setEditingSubsForObj(prev => ({ ...prev, [obj.id]: subsMap }))
  }

  async function saveAllEdits(obj) {
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

  function cancelEdit(objId) {
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', cursor: 'grab', opacity: 0.4, flexShrink: 0 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 16, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />)}
              </div>

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
                <DraggablePendingSubList
                  subs={subs}
                  objId={obj.id}
                  reorderPendingSub={reorderPendingSub}
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

function DraggablePendingSubList({ subs, objId, reorderPendingSub }) {
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  function handleDragStart(e, index) { e.stopPropagation(); dragItem.current = index }
  function handleDragEnter(index) { dragOverItem.current = index }
  async function handleDragEnd(e, subId) {
    e.stopPropagation()
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return
    await reorderPendingSub(objId, subId, dragOverItem.current, dragItem.current)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5, padding: '2px 4px', cursor: 'grab', opacity: 0.35, flexShrink: 0 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 12, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />)}
          </div>
          <span className="flex-shrink-0" style={{ fontSize: 13 }}>📌</span>
          <span className="flex-1 text-xs text-slate-600">{toLetter(subIdx)}. {sub.title}</span>
        </div>
      ))}
    </>
  )
}

function AddObjInline({ userId, onAdd, nextNum }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [subs, setSubs] = useState([''])

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
