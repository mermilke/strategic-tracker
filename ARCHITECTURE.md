# Architecture & design notes

A tour of how Strategic Tracker is built and why it's built that way. The
[README](README.md) covers what it does; this is the engineering side.

## Shape of the app

It's a single Next.js 14 app (App Router) talking to Supabase. There's no
separate backend service. The "server" is a handful of route handlers under
`app/api/`, plus a few server components for auth. Everything else is a client
component reading and writing Supabase directly.

That keeps the moving parts low: one deploy target (Vercel), one database
(Supabase Postgres), and the browser. The trade-off is that a lot of logic lives
client-side, which is fine here because row-level security is the real
enforcement boundary, not the UI.

## Data model

Six core tables, all keyed off Supabase auth:

- `users` -- profile + role (`manager`, `admin`, `direct_report`) + timezone, one row
  per auth user, created by a trigger on signup.
- `strategic_objectives` and `sub_objectives` -- the goal tree. An objective can
  carry an `opportunity_target` to become a count-based goal (e.g. "close 5
  pilots"), in which case its deals live in `objective_opportunities`.
- `weekly_checkins` -- one row per sub-objective per week (`UNIQUE(sub_objective_id,
  week_start)`), holding the status enum and the report's notes.
- `meeting_notes` -- a shared notes doc per person per week for 1:1s.
- `ai_briefings` -- one cached, generated briefing per week.

Weeks are always Mondays (`YYYY-MM-DD`), which makes "this week" a plain string
comparison instead of date-range math in most places.

## Access control

Every table has row-level security, and the policies are the security model, not
the UI. A direct report can only `SELECT`/`INSERT`/`UPDATE` their own objectives
and check-ins; a `manager` or `admin` can see everyone. The browser uses the public
anon key, so even though the client talks to Postgres directly, RLS decides what
it's allowed to touch.

Three things need to bypass RLS: the AI briefing (reads across all reports), the
reminder cron (reads everyone to decide who to email), and admin password resets.
Those run only in server route handlers with the service-role key, never in the
browser.

## The weekly briefing

This is the most involved feature. The flow:

1. `lib/briefing-context.js` assembles everything the model should see for a
   week -- each report's objectives, this-week vs last-week check-ins (so the
   model can spot changes), opportunities, recent 1:1 notes, and a best-effort
   calendar pull for upcoming 1:1s. It's deliberately separate from the route so
   I can test and tweak the context without touching the streaming code.
2. `app/api/ai/insights/route.js` sends that to Claude Sonnet through the Vercel
   AI Gateway with a Zod schema, so the model returns structured sections
   (headline, risks, momentum, talking points) rather than free text.
3. The response streams to the client as newline-delimited JSON, so the briefing
   fills in section by section instead of blocking on the full generation.
4. The result is cached in `ai_briefings` keyed by week. A regenerate within the
   provider's cache window only pays for the new output tokens, because the long
   context block is marked for prompt caching. Token counts and a cost estimate
   are stored per briefing.

If the AI gateway or service-role key isn't configured, the route reports the
feature as dormant and the card shows a quiet "not enabled" state instead of an
error. The rest of the dashboard is unaffected.

## Timezone-aware reminders

The reminder engine (`app/api/cron/reminders/route.js`) is the other piece worth
calling out, mostly for the timezone handling.

- Each report has their own IANA timezone. A reminder should land at 4pm in
  *their* clock, so the GitHub Actions cron pings the endpoint at several UTC
  times (one per timezone/DST combination) and the endpoint only acts for reports
  whose local hour is currently 16.
- It reads the manager's calendar (Microsoft Graph) and decides what kind of nudge
  fits: a day-before reminder, an "overdue" note if the 1:1 already happened with
  no check-in, or a "your 1:1 was cancelled, here's what to do" message. It will
  not call a check-in "missed" if the meeting hasn't happened yet or was
  cancelled.
- A `reminder_log` row dedupes sends to once per ~23 hours, so a report gets
  nudged daily until they submit, then it stops the moment a check-in exists.

The fiddly date helpers (weekend-skipping "day before", week-of-date, parsing
Graph's timezone-less timestamps) are small pure functions, which is also what
the unit tests exercise.

## Testing & CI

`lib/utils.js` and the date logic are covered by Vitest unit tests. GitHub
Actions runs the tests and a production build on every push and pull request.
The build step passes placeholder Supabase vars so Next can prerender; real keys
are only needed at runtime.

## Things I'd do differently / next

- Move the trickier reminder date helpers out of the route into their own module
  so they're importable and even easier to test in isolation.
- Adopt TypeScript. The app grew quickly in plain JS; the data shapes are stable
  enough now that types would pay off.
- Add an integration test around the briefing route with the model mocked.
