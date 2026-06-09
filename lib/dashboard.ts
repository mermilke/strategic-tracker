// Pure helpers for the manager dashboard, kept out of the component so they can be unit tested.
import { STATUS_HEX } from './utils'

// Bar fill % for the snapshot tiles, keyed by status.
export const STATUS_PROGRESS: Record<string, number> = { completed: 100, on_track: 85, at_risk: 50, off_track: 18, on_hold: 10, not_started: 5 }

// Bar color per status. Reuses the shared status palette so there's a single
// source of truth; only "completed" overrides it, using the brand blue on the
// progress bar (its badge elsewhere uses the sky tone).
export const STATUS_BAR_COLOR: Record<string, string> = { ...STATUS_HEX, completed: '#2563EB' }

type Checkin = {
  week_start: string
  status?: string | null
  progress_this_week?: string | null
}

type SubObjective = {
  weekly_checkins?: Checkin[] | null
}

// Consecutive weeks with no update, counting back from selectedWeek. A sub whose
// most recent check-in is "completed" needs no further updates, so it returns 0.
// weekOptions is the list of week_start strings the dashboard knows about; it's
// normally ascending, but we sort a copy here so the count is correct even if a
// caller passes it the other way round (week_start is YYYY-MM-DD, so a plain
// string sort is chronological).
export function calcWeeksNoProgress(
  sub: SubObjective,
  weekOptions: string[],
  selectedWeek: string
): number {
  const weeks = [...weekOptions].sort()
  const selectedIdx = weeks.indexOf(selectedWeek)
  const relevantWeeks = selectedIdx >= 0 ? weeks.slice(0, selectedIdx + 1) : weeks

  // completed subs don't need updates
  const latestCheckin = [...relevantWeeks].reverse().reduce<Checkin | null | undefined>(
    (found, w) => found || sub.weekly_checkins?.find(ch => ch.week_start === w),
    null
  )
  if (latestCheckin?.status === 'completed') return 0

  const recentWeeks = [...relevantWeeks].reverse()
  let count = 0
  for (const week of recentWeeks) {
    const c = sub.weekly_checkins?.find(ch => ch.week_start === week)
    if (!c || !c.progress_this_week) {
      count++
    } else {
      break // streak broken
    }
  }
  return count
}
