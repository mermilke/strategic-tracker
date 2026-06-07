import { startOfWeek, format, subWeeks } from 'date-fns'

// Always returns the most recent Monday as YYYY-MM-DD
export function getCurrentWeekStart() {
  const now = new Date()
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  return format(monday, 'yyyy-MM-dd')
}

// Returns last week's Monday
export function getLastWeekStart() {
  const now = new Date()
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const lastMonday = subWeeks(monday, 1)
  return format(lastMonday, 'yyyy-MM-dd')
}

// Format a date string like "Week of Jan 6, 2025"
export function formatWeekLabel(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return `Week of ${format(date, 'MMM d, yyyy')}`
}

export const STATUS_CONFIG = {
  on_track:    { label: 'On Track',    color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/25', dot: 'bg-emerald-500', hex: '#34D399' },
  at_risk:     { label: 'At Risk',     color: 'bg-amber-500/15  text-amber-700  border-amber-500/25',  dot: 'bg-amber-500', hex: '#F59E0B'   },
  off_track:   { label: 'Off Track',   color: 'bg-red-500/15    text-red-700    border-red-500/25',    dot: 'bg-red-500', hex: '#D62027'     },
  on_hold:     { label: 'On Hold',     color: 'bg-purple-500/15 text-purple-700 border-purple-500/25', dot: 'bg-purple-500', hex: '#A78BFA' },
  not_started: { label: 'Not Started', color: 'bg-slate-500/15  text-slate-600  border-slate-500/25',  dot: 'bg-slate-500', hex: '#94A3B8' },
  completed:   { label: 'Completed',   color: 'bg-sky-500/15    text-sky-700    border-sky-500/25',    dot: 'bg-sky-500', hex: '#38BDF8'     },
}

// Status -> hex and status -> label, derived so there's one source of truth.
export const STATUS_HEX = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.hex])
)
export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])
)

// manager and admin both get the manager views.
export function isAdminRole(profile) {
  return profile?.role === 'manager' || profile?.role === 'admin'
}

// Sort by sort_order, then created_at as a tiebreaker. Used for objectives,
// sub-objectives, and opportunities, which all carry both columns.
export function bySortOrder(a, b) {
  return (a.sort_order || 0) - (b.sort_order || 0)
    || (a.created_at || '').localeCompare(b.created_at || '')
}

// Tinted background / border / text color for a status, used on the check-in
// cards in both dashboards.
const STATUS_TINT = {
  off_track:   { bg: 'rgba(239,68,68,0.14)',   border: 'rgba(239,68,68,0.4)',   text: '#F87171' },
  at_risk:     { bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.4)',  text: '#F59E0B' },
  on_hold:     { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)', text: '#A78BFA' },
  not_started: { bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)', text: '#94A3B8' },
  completed:   { bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)', text: '#38BDF8' },
  on_track:    { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)', text: '#34D399' },
}

export function statusTint(status) {
  return STATUS_TINT[status] || { bg: 'var(--bg-base)', border: 'var(--border)', text: '#64748B' }
}

// Index -> letter label (0 -> "A"). Labels sub-objective rows in the admin UI.
export function toLetter(i) {
  return String.fromCharCode(65 + i)
}

// Format a date value as "Jun 6, 2026", or "" when missing. Used across the admin lists.
export function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}
