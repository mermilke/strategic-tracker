// Shared logic for spotting a direct report's 1:1 on the manager's calendar.
// The weekly briefing (lib/briefing-context) and the reminder cron
// (app/api/cron/reminders) both need to answer the same question -- "is this
// calendar event this person's 1:1?" -- so the matching lives here once instead
// of drifting between two copies.

// A Microsoft Graph calendar event, narrowed to the fields the app actually
// reads. The briefing, the reminder cron, and the calendar route all consume
// Graph events, so they share this one shape rather than each re-declaring it.
// Everything is optional/nullable because Graph only returns the $select-ed
// fields and the callers each read a different subset.
export type GraphEvent = {
  subject?: string | null
  start?: { dateTime?: string | null; date?: string | null } | null
  end?: { dateTime?: string | null; date?: string | null } | null
  location?: { displayName?: string | null } | null
  isAllDay?: boolean | null
  isCancelled?: boolean | null
  showAs?: string | null
  organizer?: unknown
  webLink?: string | null
}

// Candidate calendar-subject patterns for a DR's 1:1, built from their first
// name and the manager's. Covers the common ways people title recurring 1:1s
// ("Dana 121", "Sam - Dana", "Dana / Sam"). Subjects that don't follow any of
// these still match on the bare-name-plus-"1:1" check in isOneOnOneSubject.
export function meetingPatternsFor(drFirst: string, managerFirst: string): string[] {
  const dr = drFirst.toLowerCase()
  const mgr = managerFirst.toLowerCase()
  return [
    `${dr} 121`, `${dr} 1:1`, `${dr} 1-1`,
    `${mgr} - ${dr}`, `${dr} - ${mgr}`,
    `${mgr} / ${dr}`, `${dr} / ${mgr}`,
  ]
}

// Does this calendar subject look like the DR's 1:1? Either it matches one of
// the name-based patterns above, or it mentions the DR by first name and reads
// like a 1:1 ("121" / "1:1" / "1-1"). A plain meeting that merely mentions the
// name -- "Dana onboarding" -- is intentionally not a match.
export function isOneOnOneSubject(
  subject: string | null | undefined,
  drFirst: string,
  managerFirst: string
): boolean {
  const s = (subject || '').toLowerCase()
  const dr = drFirst.toLowerCase()
  if (meetingPatternsFor(dr, managerFirst).some(p => s.includes(p))) return true
  const looksLike11 = s.includes('121') || s.includes('1:1') || s.includes('1-1')
  return looksLike11 && s.includes(dr)
}
