'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Navbar from '../../components/Navbar'
import { getCurrentWeekStart, getLastWeekStart, formatWeekLabel, STATUS_CONFIG } from '../../lib/utils'

const toLetter = i => String.fromCharCode(65 + i)

function blankOpportunity() {
  return { customer: '', project_description: '', segment: '', estimated_value_text: '', status: 'Completed' }
}

// parse a free-text value into a number for totals later
// handles "$500K", "500,000", "~250k/yr", "1.2M", "300000", and friends
function parseEstimatedValue(text) {
  if (!text) return null
  const cleaned = String(text).replace(/[,\s$]/g, '')
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*([kKmMbB]?)/)
  if (!m) return null
  let n = parseFloat(m[1])
  if (isNaN(n)) return null
  const suffix = (m[2] || '').toLowerCase()
  if (suffix === 'k') n *= 1e3
  else if (suffix === 'm') n *= 1e6
  else if (suffix === 'b') n *= 1e9
  return Math.round(n)
}

function CheckinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusedSubId = searchParams.get('sub')
  const viewAsId = searchParams.get('viewAs')

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [viewAsProfile, setViewAsProfile] = useState(null)
  const [readOnly, setReadOnly] = useState(false)
  const [objectives, setObjectives] = useState([])
  // { [objectiveId]: [ { id?, customer, project_description, segment, estimated_value_text, status } ] }
  const [opportunities, setOpportunities] = useState({})
  const [formState, setFormState] = useState({})
  const [lastWeekState, setLastWeekState] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showComment, setShowComment] = useState({})
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [linkForm, setLinkForm] = useState({ show: false, name: '', url: '' })
  const fileInputRef = useRef(null)
  const thisWeek = getCurrentWeekStart()
  const lastWeek = getLastWeekStart()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)

      const { data: prof } = await supabase.from('users').select('*').eq('id', session.user.id).single()
      setProfile(prof)

      // admin/manager can view a DR's check-in read-only via ?viewAs=<userId>
      const isAdmin = prof?.role === 'manager' || prof?.role === 'admin'
      let targetId = session.user.id
      if (viewAsId && isAdmin && viewAsId !== session.user.id) {
        const { data: targetProf } = await supabase.from('users').select('*').eq('id', viewAsId).single()
        if (targetProf) {
          setViewAsProfile(targetProf)
          setReadOnly(true)
          targetId = viewAsId
        }
      }

      const { data: objs } = await supabase
        .from('strategic_objectives')
        .select(`*, sub_objectives(*), objective_opportunities(*)`)
        .eq('owner_id', targetId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (!objs) { setLoading(false); return }
      // keep sub_objectives in a stable order
      const sorted = (objs || []).map(obj => ({
        ...obj,
        sub_objectives: (obj.sub_objectives || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
      }))
      setObjectives(sorted)

      // seed opportunity rows for opportunity-tracking objectives (these persist across weeks)
      const oppMap = {}
      sorted.forEach(obj => {
        if (obj.opportunity_target) {
          const rows = (obj.objective_opportunities || [])
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
            .map(r => ({
              id: r.id,
              customer: r.customer || '',
              project_description: r.project_description || '',
              segment: r.segment || '',
              estimated_value_text: r.estimated_value_text || '',
              status: r.status || 'Completed',
            }))
          // always keep one blank row around to fill in
          oppMap[obj.id] = rows.length > 0 ? rows : [blankOpportunity()]
        }
      })
      setOpportunities(oppMap)

      const subIds = objs.flatMap(o => o.sub_objectives?.map(s => s.id) || [])
      const { data: thisCheckins } = await supabase
        .from('weekly_checkins')
        .select('*')
        .in('sub_objective_id', subIds)
        .eq('week_start', thisWeek)

      const { data: lastCheckins } = await supabase
        .from('weekly_checkins')
        .select('*')
        .in('sub_objective_id', subIds)
        .eq('week_start', lastWeek)

      const form = {}
      const lw = {}
      const sc = {}

      subIds.forEach(id => {
        const thisEntry = thisCheckins?.find(c => c.sub_objective_id === id)
        const lastEntry = lastCheckins?.find(c => c.sub_objective_id === id)

        lw[id] = lastEntry?.status || null

        form[id] = {
          status: thisEntry?.status || lastEntry?.status || '',
          progress_this_week: thisEntry?.progress_this_week || '',
          support_needed: thisEntry?.support_needed || '',
          comments: thisEntry?.comments || '',
          existing_id: thisEntry?.id || null,
          hasProgress: !!(thisEntry?.progress_this_week),
          hasSupport: !!(thisEntry?.support_needed),
          discuss_in_meeting: !!(thisEntry?.discuss_in_meeting),
          prefilled: !thisEntry && !!lastEntry?.status,
        }

        // show the comment field if one already exists
        if (thisEntry?.comments) sc[id] = true
      })

      setFormState(form)
      setLastWeekState(lw)
      setShowComment(sc)

      const { data: atts } = await supabase
        .from('meeting_attachments')
        .select('*')
        .eq('user_id', targetId)
        .eq('week_start', thisWeek)
        .order('created_at', { ascending: true })
      setAttachments(atts || [])

      setLoading(false)
    }
    load()
  }, [viewAsId])

  function updateField(subId, field, value) {
    setFormState(prev => ({
      ...prev,
      [subId]: { ...prev[subId], [field]: value, prefilled: false }
    }))
    setSaved(false)
  }

  function toggleCheck(subId, field) {
    setFormState(prev => {
      const current = prev[subId] || {}
      const isChecked = !current[field]
      return {
        ...prev,
        [subId]: {
          ...current,
          [field]: isChecked,
          ...(field === 'hasProgress' && !isChecked ? { progress_this_week: '' } : {}),
          ...(field === 'hasSupport' && !isChecked ? { support_needed: '' } : {}),
        }
      }
    })
    setSaved(false)
  }

  function updateOpportunity(objId, idx, field, value) {
    setOpportunities(prev => {
      const rows = [...(prev[objId] || [])]
      rows[idx] = { ...rows[idx], [field]: value }
      return { ...prev, [objId]: rows }
    })
    setSaved(false)
  }

  function addOpportunityRow(objId) {
    setOpportunities(prev => ({
      ...prev,
      [objId]: [...(prev[objId] || []), blankOpportunity()],
    }))
    setSaved(false)
  }

  function removeOpportunityRow(objId, idx) {
    setOpportunities(prev => {
      const rows = [...(prev[objId] || [])]
      rows.splice(idx, 1)
      return { ...prev, [objId]: rows.length ? rows : [blankOpportunity()] }
    })
    setSaved(false)
  }

  function commentRequired(subId) {
    const entry = formState[subId]
    if (!entry?.status) return false
    const flagStatuses = ['at_risk', 'off_track', 'on_hold']
    if (!flagStatuses.includes(entry.status)) return false
    const last = lastWeekState[subId]
    return entry.status !== last
  }

  function getMissingComments() {
    const subIds = objectives.flatMap(o => o.sub_objectives?.map(s => s.id) || [])
    return subIds.filter(id => commentRequired(id) && !(formState[id]?.comments?.trim()))
  }

  const [commentErrors, setCommentErrors] = useState(new Set())

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // let the same file be re-picked later

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      alert('File is too large. Maximum size is 10MB.')
      return
    }

    setUploading(true)
    const path = `${user.id}/${thisWeek}/${crypto.randomUUID()}-${file.name}`

    const { error: uploadErr } = await supabase.storage
      .from('meeting-files')
      .upload(path, file)

    if (uploadErr) {
      alert('Upload failed: ' + uploadErr.message)
      setUploading(false)
      return
    }

    const { data: row, error: insertErr } = await supabase
      .from('meeting_attachments')
      .insert({
        user_id: user.id,
        week_start: thisWeek,
        type: 'file',
        file_path: path,
        file_name: file.name,
        file_size: file.size,
      })
      .select()
      .single()

    if (!insertErr && row) setAttachments(prev => [...prev, row])
    setUploading(false)
  }

  async function handleAddLink() {
    const url = linkForm.url.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      alert('Please enter a valid URL starting with http:// or https://')
      return
    }
    const name = linkForm.name.trim() || url

    const { data: row, error } = await supabase
      .from('meeting_attachments')
      .insert({
        user_id: user.id,
        week_start: thisWeek,
        type: 'link',
        file_name: name,
        url: url,
      })
      .select()
      .single()

    if (!error && row) setAttachments(prev => [...prev, row])
    setLinkForm({ show: false, name: '', url: '' })
  }

  async function handleDeleteAttachment(att) {
    if (att.type === 'file' && att.file_path) {
      await supabase.storage.from('meeting-files').remove([att.file_path])
    }
    await supabase.from('meeting_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  function formatFileSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  async function saveAll() {
    if (readOnly) return // admin is just viewing this DR's check-in
    const missing = getMissingComments()
    if (missing.length > 0) {
      setCommentErrors(new Set(missing))
      const el = document.getElementById(`sub-${missing[0]}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setCommentErrors(new Set())
    setSaving(true)
    const subIds = objectives.flatMap(o => o.sub_objectives?.map(s => s.id) || [])

    await Promise.all(subIds.filter(id => formState[id]?.status).map(async (subId) => {
      const entry = formState[subId]
      const payload = {
        sub_objective_id: subId,
        submitted_by: user.id,
        week_start: thisWeek,
        status: entry.status,
        progress_this_week: entry.hasProgress ? (entry.progress_this_week || 'Yes') : null,
        support_needed: entry.hasSupport ? (entry.support_needed || 'Yes') : null,
        comments: entry.comments || null,
        discuss_in_meeting: !!entry.discuss_in_meeting,
      }

      if (entry.existing_id) {
        await supabase.from('weekly_checkins').update(payload).eq('id', entry.existing_id)
      } else {
        const res = await supabase.from('weekly_checkins').insert(payload).select().single()
        if (res.data) {
          setFormState(prev => ({ ...prev, [subId]: { ...prev[subId], existing_id: res.data.id } }))
        }
      }
    }))

    // save opportunity rows. they hang off the objective, not the week, so they
    // accumulate over time.
    await Promise.all(Object.entries(opportunities).map(async ([objId, rows]) => {
      await Promise.all(rows.map(async (row, idx) => {
        // skip blank rows that were never touched
        const isEmpty = !row.customer?.trim() && !row.project_description?.trim()
          && !row.segment?.trim() && !row.estimated_value_text?.trim()
        if (isEmpty && !row.id) return

        const payload = {
          objective_id: objId,
          customer: row.customer || null,
          project_description: row.project_description || null,
          segment: row.segment || null,
          estimated_value_text: row.estimated_value_text || null,
          estimated_value_number: parseEstimatedValue(row.estimated_value_text),
          status: row.status || 'Completed',
          sort_order: idx,
          updated_at: new Date().toISOString(),
        }

        if (row.id) {
          await supabase.from('objective_opportunities').update(payload).eq('id', row.id)
        } else {
          const res = await supabase.from('objective_opportunities').insert(payload).select().single()
          if (res.data) {
            setOpportunities(prev => {
              const arr = [...(prev[objId] || [])]
              if (arr[idx]) arr[idx] = { ...arr[idx], id: res.data.id }
              return { ...prev, [objId]: arr }
            })
          }
        }
      }))
    }))

    setSaving(false)
    setSaved(true)
    setTimeout(() => router.push('/dashboard'), 800)
  }

  const totalSubs = objectives.flatMap(o => o.sub_objectives || []).length
  const completedSubs = Object.values(formState).filter(f => f.status).length

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Navbar user={user} profile={profile} />

      {/* view-as banner when an admin is previewing a DR's check-in */}
      {readOnly && viewAsProfile && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          borderBottom: '1px solid rgba(239,68,68,0.3)',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}>
          <span className="text-sm" style={{ color: '#F87171' }}>
            👁 Viewing <strong>{viewAsProfile.full_name}</strong>’s check-in (read-only)
          </span>
          <button
            onClick={() => { window.location.href = `/dashboard?viewAs=${viewAsProfile.id}` }}
            className="text-xs px-3 py-1 rounded-lg"
            style={{
              background: 'rgba(239,68,68,0.2)',
              color: '#F87171',
              border: '1px solid rgba(239,68,68,0.4)',
              cursor: 'pointer',
            }}
          >
            ✕ Exit
          </button>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-xl text-slate-800 mb-0">Weekly Check-in</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatWeekLabel(thisWeek)}{readOnly && viewAsProfile ? ` · ${viewAsProfile.full_name}` : ''}
            </p>
          </div>
          {readOnly ? (
            <span className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)' }}>
              Read-only preview
            </span>
          ) : (
            <button
              onClick={saveAll}
              disabled={completedSubs === 0 || saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: saved ? 'rgba(52,211,153,0.15)' : completedSubs > 0 ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'rgba(0,0,0,0.02)',
                color: saved ? '#34D399' : completedSubs > 0 ? 'white' : 'var(--text-muted)',
                border: saved ? '1px solid rgba(52,211,153,0.3)' : 'none',
                cursor: completedSubs > 0 && !saving ? 'pointer' : 'not-allowed',
                boxShadow: completedSubs > 0 && !saved ? '0 4px 20px rgba(37, 99, 235,0.25)' : 'none',
              }}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save & finish'}
            </button>
          )}
        </div>

        {/* all objectives, frozen in read-only preview */}
        <div className="space-y-5" style={readOnly ? { pointerEvents: 'none', opacity: 0.95 } : undefined}>
          {objectives.map((obj, objIdx) => (
            <div key={obj.id}>
              {objIdx > 0 && <div style={{ borderTop: '1px solid rgba(148,163,184,0.3)', marginBottom: 16 }} />}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 14 }}>🎯</span>
                <h2 className="text-lg font-bold text-slate-800">{objIdx + 1}. {obj.title}</h2>
              </div>

              {(() => {
                const activeSubs = (obj.sub_objectives || []).filter(s => s.is_active !== false)
                const onlyImplicit = activeSubs.length === 1 && activeSubs[0].is_implicit
                return (
              <div className={onlyImplicit ? '' : 'grid grid-cols-2 gap-1.5'}>
                {activeSubs.map((sub, subIdx) => {
                  const entry = formState[sub.id] || {}
                  const lastStatus = lastWeekState[sub.id]
                  const statusCfg = entry.status ? STATUS_CONFIG[entry.status] : null
                  const isCommentRequired = commentRequired(sub.id)
                  const hasError = commentErrors.has(sub.id)
                  const commentVisible = isCommentRequired || showComment[sub.id] || !!(entry.comments)

                  return (
                    <div
                      key={sub.id}
                      className="rounded-lg px-3 py-2"
                      style={{
                        background: statusCfg ? `${statusCfg.hex}12` : 'var(--bg-surface)',
                        border: `1px solid ${statusCfg ? `${statusCfg.hex}30` : 'var(--border)'}`,
                      }}
                    >
                      {/* implicit subs have no title of their own, the objective heading is it */}
                      {!sub.is_implicit && (
                        <div className="text-xs font-medium mb-1.5" style={{ color: statusCfg ? statusCfg.hex : '#cbd5e1' }}>
                          {toLetter(subIdx)}. {sub.title}
                        </div>
                      )}

                      {/* status pills and checkboxes share a row */}
                      <div className="flex items-center gap-6">
                        <div className="flex gap-1 flex-shrink-0">
                          {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                            <button
                              key={val}
                              onClick={() => updateField(sub.id, 'status', val)}
                              className="py-0.5 px-1.5 rounded transition-all whitespace-nowrap"
                              style={{
                                background: entry.status === val ? `${cfg.hex}25` : 'var(--bg-base)',
                                border: `1px solid ${entry.status === val ? `${cfg.hex}60` : 'var(--border)'}`,
                                color: entry.status === val ? cfg.hex : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: 10,
                              }}
                            >
                              {cfg.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!entry.discuss_in_meeting}
                              onChange={() => toggleCheck(sub.id, 'discuss_in_meeting')}
                              style={{ accentColor: '#A78BFA', width: 13, height: 13, cursor: 'pointer' }}
                            />
                            <span style={{ color: entry.discuss_in_meeting ? '#A78BFA' : 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              Discuss in 1:1
                            </span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!entry.hasProgress}
                              onChange={() => toggleCheck(sub.id, 'hasProgress')}
                              style={{ accentColor: '#2563EB', width: 13, height: 13, cursor: 'pointer' }}
                            />
                            <span style={{ color: entry.hasProgress ? '#1E293B' : 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              Progress made
                            </span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!entry.hasSupport}
                              onChange={() => toggleCheck(sub.id, 'hasSupport')}
                              style={{ accentColor: '#F59E0B', width: 13, height: 13, cursor: 'pointer' }}
                            />
                            <span style={{ color: entry.hasSupport ? '#7DD3FC' : 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              Support needed
                            </span>
                          </label>
                        </div>
                      </div>

                      {entry.prefilled && lastStatus && (
                        <div className="mt-1" style={{ color: '#38BDF8', fontSize: 10 }}>
                          ℹ️ Pre-selected from last week ({STATUS_CONFIG[lastStatus]?.label})
                        </div>
                      )}

                      {isCommentRequired && (
                        <div style={{ color: hasError ? '#F87171' : '#F59E0B', fontSize: 11, marginTop: 2 }}>
                          ⚠ Comment required -- status changed to {STATUS_CONFIG[entry.status]?.label}
                        </div>
                      )}
                      {commentVisible ? (
                        <textarea
                          id={`sub-${sub.id}`}
                          rows={1}
                          placeholder={isCommentRequired ? 'Why did the status change?' : 'Comments (optional)'}
                          value={entry.comments || ''}
                          onChange={e => {
                            updateField(sub.id, 'comments', e.target.value)
                            if (hasError && e.target.value.trim()) setCommentErrors(prev => { const n = new Set(prev); n.delete(sub.id); return n })
                          }}
                          className="w-full px-2 py-1 rounded text-xs resize-none"
                          style={{
                            background: 'var(--bg-base)',
                            border: `1px solid ${hasError ? 'rgba(239,68,68,0.5)' : isCommentRequired ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                            color: 'var(--text-primary)',
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => setShowComment(prev => ({ ...prev, [sub.id]: true }))}
                          style={{ color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginTop: 1 }}
                        >
                          + Add comment
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
                )
              })()}

              {/* opportunity table, persistent rows for opportunity-tracking objectives */}
              {obj.opportunity_target ? (() => {
                const rows = opportunities[obj.id] || []
                const filledCount = rows.filter(r =>
                  r.customer?.trim() || r.project_description?.trim() || r.segment?.trim() || r.estimated_value_text?.trim()
                ).length
                return (
                  <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase" style={{ color: '#2563EB', letterSpacing: '0.04em' }}>
                        Opportunities
                      </span>
                      <span className="text-xs font-semibold" style={{ color: filledCount >= obj.opportunity_target ? '#34D399' : 'var(--text-muted)' }}>
                        {filledCount} of {obj.opportunity_target}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {rows.map((row, idx) => (
                        <div key={row.id || `new-${idx}`} className="rounded-lg p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{idx + 1}.</span>
                            {rows.length > 1 && (
                              <button
                                onClick={() => removeOpportunityRow(obj.id, idx)}
                                title="Remove this row"
                                style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                              >×</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              ['customer', 'Customer'],
                              ['project_description', 'Project Description'],
                              ['segment', 'Segment'],
                              ['estimated_value_text', 'Estimated Annual Value'],
                              ['status', 'Status'],
                            ].map(([field, label]) => (
                              <div key={field} className={field === 'project_description' ? 'col-span-2' : ''}>
                                <label className="block mb-0.5" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</label>
                                <input
                                  type="text"
                                  value={row[field] || ''}
                                  onChange={e => updateOpportunity(obj.id, idx, field, e.target.value)}
                                  placeholder={field === 'estimated_value_text' ? 'e.g. $500K' : ''}
                                  className="w-full px-2 py-1 rounded"
                                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => addOpportunityRow(obj.id)}
                      className="mt-2 px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.2)', cursor: 'pointer' }}
                    >
                      + Add
                    </button>
                  </div>
                )
              })() : null}
            </div>
          ))}
        </div>

        {/* attachments */}
        <div className="mt-6 rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', ...(readOnly ? { pointerEvents: 'none', opacity: 0.95 } : {}) }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              📎 Files & Links for 1:1
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setLinkForm({ show: true, name: '', url: '' })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.2)', cursor: 'pointer' }}
              >
                + Add Link
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(37, 99, 235,0.1)', color: '#2563EB', border: '1px solid rgba(37, 99, 235,0.2)', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? 'Uploading...' : '+ Upload File'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif"
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* add-link form */}
          {linkForm.show && (
            <div className="flex items-center gap-2 mb-3 p-3 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <input
                type="url"
                placeholder="https://..."
                value={linkForm.url}
                onChange={e => setLinkForm(prev => ({ ...prev, url: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                autoFocus
              />
              <input
                type="text"
                placeholder="Display name (optional)"
                value={linkForm.name}
                onChange={e => setLinkForm(prev => ({ ...prev, name: e.target.value }))}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: 180 }}
              />
              <button
                onClick={handleAddLink}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                Save
              </button>
              <button
                onClick={() => setLinkForm({ show: false, name: '', url: '' })}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* attachments list */}
          {attachments.length > 0 ? (
            <div className="space-y-1.5">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>
                    {att.type === 'file' ? '📄' : '🔗'}
                  </span>
                  <span className="flex-1 min-w-0 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                    {att.file_name}
                  </span>
                  {att.file_size && (
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {formatFileSize(att.file_size)}
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteAttachment(att)}
                    className="flex-shrink-0"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No files or links attached yet. Add items you want to review during your 1:1.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

export default function CheckinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckinForm />
    </Suspense>
  )
}
