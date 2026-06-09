'use client'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatWeekLabel } from '../lib/utils'
import BriefingContent from './briefing/BriefingContent'
import DevPanel from './briefing/DevPanel'
import type { Briefing, BriefingMeta } from './briefing/types'

// On the public demo the briefing is view-only: visitors see the cached
// briefing but can't trigger a paid generation.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// Weekly briefing card: streams a 5-section exec briefing for the selected week
// (Claude Sonnet via Vercel AI Gateway). Loads any cached briefing on week change;
// Generate/Regenerate hit the streaming POST endpoint.
export default function WeeklyBriefing({ selectedWeek, currentUser }: {
  selectedWeek: string
  currentUser?: { id: string; full_name?: string | null } | null
}) {
  // status flow: idle -> loading (fetching cache) -> no_briefing | streaming -> complete | error
  const [status, setStatus] = useState('idle')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [meta, setMeta] = useState<BriefingMeta | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

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
          let msg: any
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
    } catch (err: any) {
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

// inline styles (matches mockup)
const card: CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  overflow: 'visible',                  // popover can extend outside the card
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  marginBottom: 24,
  position: 'relative',                 // anchor for the info button
}
const headerRow: CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
}
const iconBadge: CSSProperties = {
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
const titleEyebrow: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}
const titleSub = { fontSize: 13, color: 'var(--text-muted)' }

const streamingPill: CSSProperties = {
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
const streamingDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#2563EB',
  animation: 'pulse-dot 1.4s ease-in-out infinite',
}

const btnPrimary: CSSProperties = {
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
const btnGhost: CSSProperties = {
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
const emptyState: CSSProperties = {
  padding: '24px 0',
  textAlign: 'center',
}
const errorBox: CSSProperties = {
  padding: '14px 18px',
  background: 'rgba(214,32,39,0.06)',
  border: '1px solid rgba(214,32,39,0.3)',
  borderRadius: 8,
  color: '#D62027',
  fontSize: 14,
}

// card footer + collapse/expand toggle
const cardFooter: CSSProperties = {
  padding: '0 14px 8px 14px',           // no top padding, body's 14px bottom is the gap
  display: 'flex',
  justifyContent: 'flex-end',
}
// quiet Collapse/Expand toggle, used both in the header (when collapsed) and bottom of card (when expanded)
const inlineToggle: CSSProperties = {
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
const headerCenterToggle: CSSProperties = {
  ...inlineToggle,
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 2,
}
const cardCollapseRow: CSSProperties = {
  padding: '4px 14px 14px 14px',
  display: 'flex',
  justifyContent: 'center',
}
