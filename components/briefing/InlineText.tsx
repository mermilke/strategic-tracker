'use client'
import type { CSSProperties, ReactNode } from 'react'

// The briefing model emits a small, fixed subset of markdown: **bold**,
// *italic*, and `code`. We tokenize it into React nodes rather than building an
// HTML string, so there is no dangerouslySetInnerHTML anywhere -- every text run
// is rendered as a React child, which React escapes, so model output can never
// inject markup.
//
// Bold is matched before italic so a `**...**` run is consumed whole rather than
// being read as two empty italics.
const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`/g

export function InlineText({ children }: { children: unknown }): ReactNode {
  if (typeof children !== 'string') return null
  const raw = children
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null

  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(raw)) !== null) {
    if (m.index > last) nodes.push(raw.slice(last, m.index))
    if (m[1] != null) nodes.push(<strong key={key++}>{m[1]}</strong>)
    else if (m[2] != null) nodes.push(<em key={key++}>{m[2]}</em>)
    else if (m[3] != null) nodes.push(<code key={key++} style={code}>{m[3]}</code>)
    last = m.index + m[0].length
  }
  if (last < raw.length) nodes.push(raw.slice(last))

  return <>{nodes}</>
}

const code: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  background: 'rgba(37, 99, 235,0.08)',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: '0.92em',
}
