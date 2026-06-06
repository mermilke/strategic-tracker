import { STATUS_CONFIG } from '../lib/utils'

export default function StatusBadge({ status, size = 'md' }) {
  if (!status) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>--</span>

  const config = STATUS_CONFIG[status]
  if (!config) return null

  const isSmall = size === 'sm'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${isSmall ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs'}`}
      style={{
        background: `${config.hex}18`,
        color: config.hex,
        border: `1px solid ${config.hex}40`,
      }}
    >
      <span
        className={status === 'at_risk' ? 'status-pulse' : ''}
        style={{
          width: isSmall ? 6 : 7,
          height: isSmall ? 6 : 7,
          borderRadius: '50%',
          backgroundColor: config.hex,
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  )
}
