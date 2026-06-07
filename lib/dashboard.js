// Pure helpers for the manager dashboard, kept out of the component so they can be unit tested.

// Bar fill % and color for the snapshot tiles, keyed by status.
export const STATUS_PROGRESS = { completed: 100, on_track: 85, at_risk: 50, off_track: 18, on_hold: 10, not_started: 5 }
export const STATUS_BAR_COLOR = { completed: '#2563EB', on_track: '#34D399', at_risk: '#F59E0B', off_track: '#D62027', on_hold: '#A78BFA', not_started: '#94A3B8' }

// Consecutive weeks with no update, counting back from selectedWeek. A sub whose
// most recent check-in is "completed" needs no further updates, so it returns 0.
// weekOptions is the ascending list of week_start strings the dashboard knows about.
export function calcWeeksNoProgress(sub, weekOptions, selectedWeek) {
  const selectedIdx = weekOptions.indexOf(selectedWeek)
  const relevantWeeks = selectedIdx >= 0 ? weekOptions.slice(0, selectedIdx + 1) : weekOptions

  // completed subs don't need updates
  const latestCheckin = [...relevantWeeks].reverse().reduce((found, w) => found || sub.weekly_checkins?.find(ch => ch.week_start === w), null)
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
