'use client'
import type { CSSProperties, ReactNode } from 'react'
import { InlineText } from './InlineText'
import type { Briefing, BriefingRisk, BriefingMomentum, BriefingTalkingPoint } from './types'

// Presentational body of the briefing: headline + the five sections. The data is
// partial while streaming, so each block guards on its own field being present.
export default function BriefingContent({ briefing, isStreaming }: {
  briefing: Briefing
  isStreaming: boolean
}) {
  const headlineText = briefing.headline || ''
  return (
    <>
      {headlineText && (
        <h2 style={headline}>
          {headlineText}
          {isStreaming && <Cursor />}
        </h2>
      )}

      {briefing.top_items && briefing.top_items.length > 0 && (
        <Section label="Top things to know">
          <ol style={topList}>
            {briefing.top_items.map((item, i) => (
              <li key={i} style={topItem}>
                <span style={topNumber}>{i + 1}</span>
                <span><InlineText>{item}</InlineText></span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {briefing.risks && briefing.risks.length > 0 && (
        <Section label="Risks & blockers">
          {briefing.risks.map((r: BriefingRisk, i) => (
            <div key={i} style={itemRow}>
              <span style={{ ...severity, ...sevStyle(r.severity) }}>
                {r.severity}
              </span>
              <div style={{ flex: 1, color: '#0F172A' }}>
                <span><InlineText>{r.item}</InlineText></span>
                {r.owner_name && <span style={ownerLabel}>{r.owner_name}</span>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {briefing.momentum && briefing.momentum.length > 0 && (
        <Section label="Momentum">
          {briefing.momentum.map((m: BriefingMomentum, i) => (
            <div key={i} style={itemRow}>
              <span style={momentumDot} />
              <div style={{ flex: 1, color: '#0F172A' }}>
                <span><InlineText>{m.item}</InlineText></span>
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

      {briefing.talking_points && briefing.talking_points.length > 0 && (
        <Section label="Talking points for upcoming 1:1s">
          {briefing.talking_points.map((tp: BriefingTalkingPoint, i) => (
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
                    <span><InlineText>{p}</InlineText></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {briefing.data_caveats && briefing.data_caveats.length > 0 && (
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

function Section({ label, children }: { label: ReactNode; children: ReactNode }) {
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

function sevStyle(sev: string | undefined) {
  if (sev === 'high') return { background: 'rgba(214,32,39,0.12)', color: '#D62027' }
  if (sev === 'medium') return { background: 'rgba(245,158,11,0.12)', color: '#B45309' }
  return { background: 'rgba(148,163,184,0.18)', color: '#475569' }
}

const headline: CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
  margin: '0 0 32px 0',
  paddingBottom: 24,
  borderBottom: '1px solid var(--border-subtle)',
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#2563EB',
  margin: '0 0 12px 0',
}

const topList = { listStyle: 'none', padding: 0, margin: 0 }
const topItem: CSSProperties = {
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
const topNumber: CSSProperties = {
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

const itemRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: 14,
  lineHeight: 1.5,
}
const severity: CSSProperties = {
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
const momentumDot: CSSProperties = {
  flexShrink: 0,
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#34D399',
  marginTop: 8,
}
const ownerLabel: CSSProperties = {
  display: 'inline-block',
  marginLeft: 6,
  fontSize: 12,
  color: 'var(--text-muted)',
}
const emptyMomentum: CSSProperties = {
  fontStyle: 'italic',
  color: 'var(--text-muted)',
  fontSize: 13.5,
  padding: '12px 14px',
  background: 'rgba(148,163,184,0.07)',
  borderRadius: 8,
}

const drCard: CSSProperties = {
  padding: '16px 18px',
  background: 'var(--bg-elevated)',
  borderRadius: 12,
  marginBottom: 12,
}
const drHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
  gap: 12,
}
const drName = { fontWeight: 600, fontSize: 14.5, color: 'var(--text-primary)' }
const drMeeting: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  padding: '3px 10px',
  background: 'var(--bg-surface)',
  borderRadius: 12,
  border: '1px solid var(--border-subtle)',
}
const drMeetingNone = { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' as const }
const drPoints = { listStyle: 'none', padding: 0, margin: 0 }
const drPoint: CSSProperties = {
  padding: '5px 0',
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'var(--text-primary)',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
}
const drArrow = { color: '#2563EB', fontWeight: 700, marginTop: 1, flexShrink: 0 }

const caveats: CSSProperties = {
  marginTop: 28,
  padding: '14px 18px',
  background: 'rgba(148,163,184,0.1)',
  borderRadius: 8,
  borderLeft: '3px solid var(--text-muted)',
}
const caveatsLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  margin: '0 0 6px 0',
}
const caveatsList = { margin: 0, paddingLeft: 16 }
const caveatsItem: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  fontStyle: 'italic',
}

const cursor: CSSProperties = {
  display: 'inline-block',
  width: 2,
  height: '0.9em',
  background: '#2563EB',
  marginLeft: 2,
  verticalAlign: 'text-bottom',
  animation: 'blinkCursor 1s infinite',
}
