import { describe, it, expect } from 'vitest'
import { calcWeeksNoProgress } from './dashboard.js'

const weeks = ['2026-01-05', '2026-01-12', '2026-01-19']
const last = '2026-01-19'

const sub = (checkins) => ({ weekly_checkins: checkins })

describe('calcWeeksNoProgress', () => {
  it('counts every week back when there are no check-ins', () => {
    expect(calcWeeksNoProgress(sub([]), weeks, last)).toBe(3)
  })

  it('returns 0 when the latest check-in is completed', () => {
    expect(calcWeeksNoProgress(sub([{ week_start: last, status: 'completed' }]), weeks, last)).toBe(0)
  })

  it('returns 0 when there was progress in the selected week', () => {
    expect(calcWeeksNoProgress(sub([{ week_start: last, progress_this_week: true }]), weeks, last)).toBe(0)
  })

  it('counts only the weeks since the last progress', () => {
    const s = sub([{ week_start: '2026-01-05', progress_this_week: true }])
    expect(calcWeeksNoProgress(s, weeks, last)).toBe(2)
  })

  it('treats a check-in with no progress as a missed week', () => {
    const s = sub([
      { week_start: '2026-01-12', progress_this_week: true },
      { week_start: last, progress_this_week: false },
    ])
    expect(calcWeeksNoProgress(s, weeks, last)).toBe(1)
  })

  it('ignores weeks after the selected week', () => {
    const s = sub([{ week_start: last, progress_this_week: true }])
    // selecting the middle week, the latest progress is in the future and should not count
    expect(calcWeeksNoProgress(s, weeks, '2026-01-12')).toBe(2)
  })

  it('falls back to all weeks when the selected week is unknown', () => {
    expect(calcWeeksNoProgress(sub([]), weeks, '2025-12-01')).toBe(3)
  })
})
