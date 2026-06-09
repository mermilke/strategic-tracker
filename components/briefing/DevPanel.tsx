'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { BriefingMeta } from './types'

// Small "i" button in the card footer that reveals the generation stats
// (model, tokens, latency, cost) in a popover.
export default function DevPanel({ meta }: { meta: BriefingMeta }) {
  const [open, setOpen] = useState(false)
  const fmtTokens = (n: number | null | undefined) => n?.toLocaleString() || '--'
  const fmtCost = (c: number | null | undefined) => c == null ? '--' : `~$${(c / 100).toFixed(3)}`
  const fmtLatency = (ms: number | null | undefined) => ms == null ? '--' : `${(ms / 1000).toFixed(1)}s`

  // close popover on Escape or outside click
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest?.('[data-dev-panel-root]')) setOpen(false)
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

function DevStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div style={devStatRow}>
      <span style={devStatLabel}>{label}</span>
      <span style={devStatValue}>{value}</span>
    </div>
  )
}

const infoAnchor: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
}
const infoButton: CSSProperties = {
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
const infoButtonActive: CSSProperties = {
  color: 'var(--text-secondary)',
  borderColor: 'var(--text-secondary)',
  background: 'rgba(148,163,184,0.08)',
}
const infoPopover: CSSProperties = {
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
const infoPopoverTitle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#64748B',
  marginBottom: 10,
}
const infoPopoverGrid: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const infoPopoverArrow: CSSProperties = {
  position: 'absolute',
  bottom: -6,
  right: 9,
  width: 12,
  height: 12,
  background: '#0F172A',
  transform: 'rotate(45deg)',
  borderRadius: 2,
}
const devStatRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
}
const devStatLabel = { color: '#64748B' }
const devStatValue = { color: '#2563EB', fontWeight: 600 }
