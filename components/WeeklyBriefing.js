'use client'
import { useEffect, useRef, useState } from 'react'
import { formatWeekLabel } from '../lib/utils'

// On the public demo the briefing is view-only: visitors see the cached
// briefing but can't trigger a paid generation.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// Weekly briefing card: streams a 5-section exec briefing for the selected week
// (Claude Sonnet via Vercel AI Gateway). Loads any cached briefing on week change;
// Generate/Regenerate hit the streaming POST endpoint.
export default function WeeklyBriefing({ selectedWeek, currentUser }) {
  // status flow: idle -> loading (fetching cache) -> no_briefing | streaming -> complete | error
  const [status, setStatus] = useState('idle')
  const [briefing, setBriefing] = useState(null)
  const [meta, setMeta] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const abortRef = useRef(null)

  // restore collapsed preference (persists across reloads)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (window.localStorage.getItem('weeklyBriefing.collapsed') === '1') {
        setCollapsed(true)
      }
    } catch {}
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem('weeklyBriefing.collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  // load cached briefing when the week changes
  useEffect(() => {
    let alive = true
    setStatus('loading')
    setBriefing(null)
    setMeta(null)
    setErrorMsg(null)

    fetch(`/api/ai/insights?week_start=${selectedWeek}`)
      .then(async r => {
        if (!alive) return
        if (r.status === 404) {
          setStatus('no_briefing')
          return
        }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          setErrorMsg(body.error || `HTTP ${r.status}`)
          setStatus('error')
          return
        }
        const body = await r.json()
        if (body.unconfigured) {
          setStatus('unconfigured')
          return
        }
        setBriefing(body.content)
        setMeta(body.meta)
        setStatus('complete')
      })
      .catch(err => {
        if (!alive) return
        setErrorMsg(err.message || 'Network error')
        setStatus('error')
      })

    return () => { alive = false }
  }, [selectedWeek])

  // abort any in-flight stream on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  async function runStream(regenerate = false) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('streaming')
    setBriefing(null)
    setMeta(null)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: selectedWeek, regenerate }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body.error || `HTTP ${res.status}`)
        setStatus('error')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let msg
          try { msg = JSON.parse(line) }
          catch { continue }

          if (msg.type === 'cached' || msg.type === 'partial') {
            setBriefing(msg.content || msg.data)
          }
          if (msg.type === 'cached') {
            setMeta(msg.meta)
            setStatus('complete')
          }
          if (msg.type === 'done') {
            setMeta(msg.meta)
            setStatus('complete')
          }
          if (msg.type === 'error') {
            setErrorMsg(msg.message)
            setStatus('error')
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setErrorMsg(err.message || 'Stream failed')
      setStatus('error')
    }
  }

  const canRegenerate = status === 'complete' || status === 'no_briefing' || status === 'error'
  const showSpinner = status === 'loading' || status === 'streaming'

  return (
    <div style={card}>
      {/* header, gets a centered Expand button when collapsed */}
      <div style={collapsed ? { ...headerRow, borderBottom: 'none', position: 'relative' } : { ...headerRow, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={iconBadge}>B</div>
          <div>
            <div style={titleEyebrow}>Weekly Briefing</div>
            <div style={titleSub}>
              {formatWeekLabel(selectedWeek)}
              {meta?.generated_at && (
                <span style={{ marginLeft: 8, color: '#94A3B8' }}>
                  · generated {new Date(meta.generated_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expand button, only when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            style={headerCenterToggle}
            aria-label="Expand briefing"
            aria-expanded="false"
          >
            Expand
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
                 style={{ transform: 'rotate(180deg)' }}>
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status === 'streaming' && !collapsed && (
            <span style={streamingPill}>
              <span style={streamingDot} />
              Generating…
            </span>
          )}
          {status === 'no_briefing' && !showSpinner && !collapsed && !DEMO_MODE && (
            <button onClick={() => runStream(false)} style={btnPrimary}>
              ✨ Generate briefing
            </button>
          )}
          {canRegenerate && status !== 'no_briefing' && !collapsed && !DEMO_MODE && (
            <button
              onClick={() => runStream(true)}
              style={btnGhost}
              disabled={showSpinner}
              title="Regenerate from current data"
            >
              ↻ Regenerate
            </button>
          )}
        </div>
      </div>

      {/* body, hidden when collapsed */}
      {!collapsed && (<>
      <div style={body}>
        {status === 'loading' && (
          <div style={muted}>Checking for existing briefing…</div>
        )}

        {status === 'no_briefing' && (
          <div style={emptyState}>
            <p style={{ margin: 0, fontSize: 15, color: '#475569' }}>
              No briefing yet for the week of {formatWeekLabel(selectedWeek)}.
            </p>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94A3B8' }}>
              Generate one to see this week's summary.
            </p>
          </div>
        )}

        {status === 'unconfigured' && (
          <div style={emptyState}>
            <p style={{ margin: 0, fontSize: 15, color: '#475569' }}>
              The AI weekly briefing isn’t enabled in this environment.
            </p>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94A3B8' }}>
              Add an AI gateway key to turn on the streaming executive summary.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div style={errorBox}>
            <p style={{ margin: 0, fontWeight: 600 }}>Briefing unavailable</p>
            <p style={{ margin: '4px 0 8px 0', fontSize: 13 }}>{errorMsg}</p>
            <button onClick={() => runStream(true)} style={btnGhost}>Try again</button>
          </div>
        )}

        {briefing && (
          <BriefingContent
            briefing={briefing}
            isStreaming={status === 'streaming'}
          />
        )}
      </div>

      {/* footer keeps the info button on its own line so it doesn't overlap caveats */}
      {meta && status === 'complete' && (
        <div style={cardFooter}>
          <DevPanel meta={meta} />
        </div>
      )}

      {/* Collapse button, shown when expanded */}
      <div style={cardCollapseRow}>
        <button
          onClick={() => setCollapsed(true)}
          style={inlineToggle}
          aria-label="Collapse briefing"
          aria-expanded="true"
        >
          Collapse
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      </>)}
    </div>
  )
}

function BriefingContent({ briefing, isStreaming }) {
  const headlineText = briefing.headline || ''
  return (
    <>
      {headlineText && (
        <h2 style={headline}>
          {headlineText}
          {isStreaming && <Cursor />}
        </h2>
      )}

      {briefing.top_items?.length > 0 && (
        <Section label="Top things to know">
          <ol style={topList}>
            {briefing.top_items.map((item, i) => (
              <li key={i} style={topItem}>
                <span style={topNumber}>{i + 1}</span>
                <span dangerouslySetInnerHTML={renderInline(item)} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {briefing.risks?.length > 0 && (
        <Section label="Risks & blockers">
          {briefing.risks.map((r, i) => (
            <div key={i} style={itemRow}>
              <span style={{ ...severity, ...sevStyle(r.severity) }}>
                {r.severity}
              </span>
              <div style={{ flex: 1, color: '#0F172A' }}>
                <span dangerouslySetInnerHTML={renderInline(r.item)} />
                {r.owner_name && <span style={ownerLabel}>{r.owner_name}</span>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {briefing.momentum?.length > 0 && (
        <Section label="Momentum">
          {briefing.momentum.map((m, i) => (
            <div key={i} style={itemRow}>
              <span style={momentumDot} />
              <div style={{ flex: 1, color: '#0F172A' }}>
                <span dangerouslySetInnerHTML={renderInline(m.item)} />
                {m.owner_name && <span style={ownerLabel}>{m.owner_name}</span>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* show the empty-momentum note only on a finished briefing, not mid-stream */}
      {briefing.momentum?.length === 0 && !isStreaming && (
        <Section label="Momentum">
          <div style={emptyMomentum}>None this week.</div>
        </Section>
      )}

      {briefing.talking_points?.length > 0 && (
        <Section label="Talking points for upcoming 1:1s">
          {briefing.talking_points.map((tp, i) => (
            <div key={i} style={drCard}>
              <div style={drHeader}>
                <span style={drName}>{tp.dr_name}</span>
                {tp.upcoming_meeting_label
                  ? <span style={drMeeting}>{tp.upcoming_meeting_label}</span>
                  : <span style={drMeetingNone}>No 1:1 scheduled in next 14 days</span>}
              </div>
              <ul style={drPoints}>
                {tp.points?.map((p, j) => (
                  <li key={j} style={drPoint}>
                    <span style={drArrow}>→</span>
                    <span dangerouslySetInnerHTML={renderInline(p)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {briefing.data_caveats?.length > 0 && (
        <div style={caveats}>
          <p style={caveatsLabel}>Briefing caveats</p>
          <ul style={caveatsList}>
            {briefing.data_caveats.map((c, i) => (
              <li key={i} style={caveatsItem}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={sectionLabel}>{label}</p>
      {children}
    </div>
  )
}

function Cursor() {
  return <span style={cursor} aria-hidden="true" />
}

function DevPanel({ meta }) {
  const [open, setOpen] = useState(false)
  const fmtTokens = n => n?.toLocaleString() || '--'
  const fmtCost = c => c == null ? '--' : `~$${(c / 100).toFixed(3)}`
  const fmtLatency = ms => ms == null ? '--' : `${(ms / 1000).toFixed(1)}s`

  // close popover on Escape or outside click
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e) {
      if (!e.target.closest?.('[data-dev-panel-root]')) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div data-dev-panel-root style={infoAnchor}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        style={open ? { ...infoButton, ...infoButtonActive } : infoButton}
        aria-label="Generation details"
        title="Generation details (model, tokens, cost)"
        aria-expanded={open}
      >
        i
      </button>
      {open && (
        <div style={infoPopover} role="dialog" aria-label="Generation details">
          <div style={infoPopoverTitle}>Generation details</div>
          <div style={infoPopoverGrid}>
            <DevStat label="model" value={meta.model} />
            <DevStat label="input" value={fmtTokens(meta.input_tokens)} />
            <DevStat label="cached" value={fmtTokens(meta.cached_tokens)} />
            <DevStat label="output" value={fmtTokens(meta.output_tokens)} />
            <DevStat label="latency" value={fmtLatency(meta.latency_ms)} />
            <DevStat label="cost" value={fmtCost(meta.cost_cents)} />
          </div>
          <div style={infoPopoverArrow} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

function DevStat({ label, value }) {
  return (
    <div style={devStatRow}>
      <span style={devStatLabel}>{label}</span>
      <span style={devStatValue}>{value}</span>
    </div>
  )
}

// let the model emit *bold* / _italic_ and render as HTML. escape everything
// else first, then only un-escape those patterns.
function renderInline(raw) {
  if (typeof raw !== 'string') return { __html: '' }
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
  s = s.replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,monospace;background:rgba(37, 99, 235,0.08);padding:1px 5px;border-radius:3px;font-size:0.92em">$1</code>')
  return { __html: s }
}

function sevStyle(sev) {
  if (sev === 'high') return { background: 'rgba(214,32,39,0.12)', color: '#D62027' }
  if (sev === 'medium') return { background: 'rgba(245,158,11,0.12)', color: '#B45309' }
  return { background: 'rgba(148,163,184,0.18)', color: '#475569' }
}

// inline styles (matches mockup)
const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  overflow: 'visible',                  // popover can extend outside the card
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  marginBottom: 24,
  position: 'relative',                 // anchor for the info button
}
const headerRow = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
}
const iconBadge = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  fontWeight: 700,
  fontSize: 13,
}
const titleEyebrow = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}
const titleSub = { fontSize: 13, color: 'var(--text-muted)' }

const streamingPill = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: '#2563EB',
  background: 'rgba(37, 99, 235,0.1)',
  padding: '4px 10px',
  borderRadius: 12,
  fontWeight: 500,
}
const streamingDot = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#2563EB',
  animation: 'pulse-dot 1.4s ease-in-out infinite',
}

const btnPrimary = {
  padding: '8px 18px',
  borderRadius: 8,
  border: '1px solid #2563EB',
  background: '#2563EB',
  color: 'white',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
const btnGhost = {
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const body = { padding: '28px 32px 14px 32px' }
const muted = { color: 'var(--text-muted)', fontSize: 14 }
const emptyState = {
  padding: '24px 0',
  textAlign: 'center',
}
const errorBox = {
  padding: '14px 18px',
  background: 'rgba(214,32,39,0.06)',
  border: '1px solid rgba(214,32,39,0.3)',
  borderRadius: 8,
  color: '#D62027',
  fontSize: 14,
}

const headline = {
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
  margin: '0 0 32px 0',
  paddingBottom: 24,
  borderBottom: '1px solid var(--border-subtle)',
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#2563EB',
  margin: '0 0 12px 0',
}

const topList = { listStyle: 'none', padding: 0, margin: 0 }
const topItem = {
  padding: '12px 14px',
  background: 'rgba(37, 99, 235,0.05)',
  borderLeft: '3px solid #2563EB',
  borderRadius: '0 8px 8px 0',
  marginBottom: 8,
  fontSize: 14.5,
  lineHeight: 1.55,
  color: 'var(--text-primary)',
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
}
const topNumber = {
  display: 'inline-block',
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: '#2563EB',
  color: 'white',
  textAlign: 'center',
  lineHeight: '22px',
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
  marginTop: 1,
}

const itemRow = {
  display: 'flex',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: 14,
  lineHeight: 1.5,
}
const severity = {
  flexShrink: 0,
  width: 58,                  // fixed width so the text column lines up across high/medium/low
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  textAlign: 'center',
  padding: '3px 0',
  borderRadius: 4,
  height: 'fit-content',
  marginTop: 2,
}
const momentumDot = {
  flexShrink: 0,
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#34D399',
  marginTop: 8,
}
const ownerLabel = {
  display: 'inline-block',
  marginLeft: 6,
  fontSize: 12,
  color: 'var(--text-muted)',
}
const emptyMomentum = {
  fontStyle: 'italic',
  color: 'var(--text-muted)',
  fontSize: 13.5,
  padding: '12px 14px',
  background: 'rgba(148,163,184,0.07)',
  borderRadius: 8,
}

const drCard = {
  padding: '16px 18px',
  background: 'var(--bg-elevated)',
  borderRadius: 12,
  marginBottom: 12,
}
const drHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
  gap: 12,
}
const drName = { fontWeight: 600, fontSize: 14.5, color: 'var(--text-primary)' }
const drMeeting = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  padding: '3px 10px',
  background: 'var(--bg-surface)',
  borderRadius: 12,
  border: '1px solid var(--border-subtle)',
}
const drMeetingNone = { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }
const drPoints = { listStyle: 'none', padding: 0, margin: 0 }
const drPoint = {
  padding: '5px 0',
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'var(--text-primary)',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
}
const drArrow = { color: '#2563EB', fontWeight: 700, marginTop: 1, flexShrink: 0 }

const caveats = {
  marginTop: 28,
  padding: '14px 18px',
  background: 'rgba(148,163,184,0.1)',
  borderRadius: 8,
  borderLeft: '3px solid var(--text-muted)',
}
const caveatsLabel = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  margin: '0 0 6px 0',
}
const caveatsList = { margin: 0, paddingLeft: 16 }
const caveatsItem = {
  fontSize: 12.5,
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  fontStyle: 'italic',
}

const cursor = {
  display: 'inline-block',
  width: 2,
  height: '0.9em',
  background: '#2563EB',
  marginLeft: 2,
  verticalAlign: 'text-bottom',
  animation: 'blinkCursor 1s infinite',
}

// card footer + info button
const cardFooter = {
  padding: '0 14px 8px 14px',           // no top padding, body's 14px bottom is the gap
  display: 'flex',
  justifyContent: 'flex-end',
}
// quiet Collapse/Expand toggle, used both in the header (when collapsed) and bottom of card (when expanded)
const inlineToggle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '6px 14px',
  background: 'rgba(15, 23, 42, 0.04)',
  borderRadius: 999,
  border: 'none',
  color: 'var(--text-secondary)',
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
}
const headerCenterToggle = {
  ...inlineToggle,
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 2,
}
const cardCollapseRow = {
  padding: '4px 14px 14px 14px',
  display: 'flex',
  justifyContent: 'center',
}
const infoAnchor = {
  position: 'relative',
  display: 'inline-block',
}
const infoButton = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: '1px solid rgba(148,163,184,0.5)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontStyle: 'italic',
  fontWeight: 600,
  fontSize: 12,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  transition: 'color 0.15s, border-color 0.15s, background 0.15s',
}
const infoButtonActive = {
  color: 'var(--text-secondary)',
  borderColor: 'var(--text-secondary)',
  background: 'rgba(148,163,184,0.08)',
}
const infoPopover = {
  position: 'absolute',
  bottom: 30,                          // just above the 22px button
  right: 0,
  width: 280,
  padding: '14px 16px',
  background: '#0F172A',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(15,23,42,0.25), 0 2px 6px rgba(0,0,0,0.12)',
  color: '#E2E8F0',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 11,
  zIndex: 6,
}
const infoPopoverTitle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#64748B',
  marginBottom: 10,
}
const infoPopoverGrid = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const infoPopoverArrow = {
  position: 'absolute',
  bottom: -6,
  right: 9,
  width: 12,
  height: 12,
  background: '#0F172A',
  transform: 'rotate(45deg)',
  borderRadius: 2,
}
const devStatRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
}
const devStatLabel = { color: '#64748B' }
const devStatValue = { color: '#2563EB', fontWeight: 600 }
