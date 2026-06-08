// Three-bar drag handle shown on draggable objective ("obj") and sub-objective ("sub") rows.
const VARIANTS = {
  obj: { gap: 3, padding: '4px 6px', opacity: 0.4, width: 16 },
  sub: { gap: 2.5, padding: '2px 4px', opacity: 0.35, width: 12 },
}

export default function DragGrip({ variant = 'obj' }: { variant?: 'obj' | 'sub' }) {
  const v = VARIANTS[variant] || VARIANTS.obj
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: v.gap, padding: v.padding, cursor: 'grab', opacity: v.opacity, flexShrink: 0 }}>
      {[0, 1, 2].map(i => <div key={i} style={{ width: v.width, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />)}
    </div>
  )
}
