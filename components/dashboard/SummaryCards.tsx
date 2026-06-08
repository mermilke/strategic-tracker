'use client'

// The four headline stat cards shown under the week/filter bar.
export default function SummaryCards({ totalAtRisk, totalNeedsSupport, totalNotSubmitted, staleCount }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {[
        { label: 'At Risk Items', value: totalAtRisk, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
        { label: 'Needs Manager Support', value: totalNeedsSupport, color: '#38BDF8', bg: 'rgba(56,189,248,0.08)' },
        { label: 'Missing Submissions', value: totalNotSubmitted, color: '#F87171', bg: 'rgba(248,113,113,0.08)' },
        { label: 'No Update (2+ weeks)', value: staleCount, color: '#D62027', bg: 'rgba(214,32,39,0.08)' },
      ].map(card => (
        <div key={card.label} className="rounded-xl p-5" style={{ background: card.bg, border: `1px solid ${card.color}20` }}>
          <div className="text-3xl font-semibold mb-1" style={{ color: card.color }}>{card.value}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
        </div>
      ))}
    </div>
  )
}
