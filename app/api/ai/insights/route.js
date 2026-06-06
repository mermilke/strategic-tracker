import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { streamObject } from 'ai'
import { z } from 'zod'
import { getAuthenticatedUser } from '../../../../lib/auth'
import { buildBriefingContext } from '../../../../lib/briefing-context'

// Latest Sonnet at implementation time. Check the gateway before bumping:
//   GET https://ai-gateway.vercel.sh/v1/models
const MODEL = 'anthropic/claude-sonnet-4.6'

// Leader the briefing is written for, plus the clock it's written in. Both
// configurable so the app isn't tied to one organization.
const CEO_NAME = process.env.CEO_NAME || 'the CEO'
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'UTC'

// Sonnet 4.x family pricing (USD per million tokens), rough cost estimate.
// Adjust if Anthropic moves pricing.
const PRICE = {
  input_per_mtok: 3.0,
  output_per_mtok: 15.0,
  cache_read_per_mtok: 0.30,
  cache_write_per_mtok: 3.75,
}

function calcCostCents({ input_tokens = 0, output_tokens = 0, cache_read = 0, cache_write = 0 }) {
  const uncached_in = Math.max(0, input_tokens - cache_read - cache_write)
  const dollars =
    uncached_in * PRICE.input_per_mtok / 1e6 +
    cache_read * PRICE.cache_read_per_mtok / 1e6 +
    cache_write * PRICE.cache_write_per_mtok / 1e6 +
    output_tokens * PRICE.output_per_mtok / 1e6
  return Math.round(dollars * 100)
}

// what the model has to produce. arrays can all be empty so a thin week can
// come back as a one-sentence briefing.
const BriefingSchema = z.object({
  headline: z.string().describe(
    'One sentence summarizing the week for the CEO. Punchy, factual, no hedging. ' +
    'If the week was flat, say so plainly.'
  ),
  top_items: z.array(z.string()).max(3).describe(
    '0-3 most important things the CEO needs to know. ' +
    'Skip if nothing material happened -- empty array is fine. ' +
    'No need to invent a third just because the field allows 3.'
  ),
  risks: z.array(z.object({
    item: z.string().describe('Brief description of the risk or blocker.'),
    owner_name: z.string().nullable().describe('DR full name, or null if cross-cutting.'),
    severity: z.enum(['high', 'medium', 'low']),
  })).describe('Real risks only. Empty array if none.'),
  momentum: z.array(z.object({
    item: z.string().describe('Status flip, sub-objective completed, or new opportunity logged.'),
    owner_name: z.string().nullable(),
  })).describe('Genuine wins only -- status flips, completions, new opportunities. Empty if a hold-the-line week.'),
  talking_points: z.array(z.object({
    dr_name: z.string(),
    upcoming_meeting_label: z.string().nullable().describe(
      'e.g. "Mon May 26, 10:00 AM UTC" or null if no 1:1 in next 14 days.'
    ),
    points: z.array(z.string()).describe(
      'Direct questions/items for the leader to raise. Be specific. Skip DRs with nothing worth discussing.'
    ),
  })).describe('Only DRs with material to discuss. Skip DRs whose week was uneventful.'),
  data_caveats: z.array(z.string()).describe(
    'Honest call-outs only when material to the CEO -- e.g. "no upcoming 1:1 found with a direct report". ' +
    'Skip operational noise (reminders, narrative length, etc.). Empty if nothing worth flagging.'
  ),
})

// voice + section rules, cached as a stable system block
const SYSTEM_PROMPT = `You are ${CEO_NAME}'s chief of staff. You are writing a Monday-morning briefing in under 4 minutes of reading time.

VOICE:
- Direct, factual, prioritized.
- Punchy sentences. No buzzwords, no hedging, no "I'd recommend", no "consider".
- First name is fine in the headline and in prose ("Dana hasn't…", "Priya flipped…"). Use FULL name (first + last) when used as an attribution label (e.g. the "owner" of a risk, the dr_name field in talking_points).
- Honest about thin-data weeks -- if nothing material happened, say so. Do not invent drama.

LANGUAGE -- STATUS VALUES:
- The status enum uses underscored values (not_started, on_track, at_risk, off_track, on_hold, completed). NEVER write these in prose -- convert to natural English: "not started", "on track", "at risk", "off track", "on hold", "completed". e.g. write "two sub-objectives stuck at not started", NOT "stuck at not_started".

SECTIONS (you fill these via the structured schema):
- headline: one sentence summarizing the week.
- top_items: the 1-3 most important things the CEO needs to know. Empty if none.
- risks: real risks/blockers with severity. Empty if none.
- momentum: genuine wins only -- status flips (e.g. at-risk to on-track), sub-objective completions, new opportunities logged. NOT "submitted on time" or "consistency". Empty if a hold-the-line week.
- talking_points: per-DR prep for upcoming 1:1s. Only include DRs with something specific worth raising. Use the upcoming_meeting_label from the calendar data if present.
- data_caveats: only flag things material to the CEO (e.g. "no upcoming 1:1 found with a direct report"). Skip operational noise.

RULES:
- Assume DRs will NEVER write narrative in their check-ins. Status fields are the signal. Do not complain that progress_this_week is empty or "Yes" -- that is the norm.
- Do not mention reminder emails or nudge behavior.
- Compare this week vs previous week to identify real changes.
- A sub-objective that has been "not started" or "on hold" for multiple consecutive weeks is a genuine risk.
- A sub-objective that flipped status this week is genuine momentum.
- CHECK-IN TIMING (very important -- read carefully):
  - Each DR is expected to submit their check-in by the day of their 1:1 with the leader.
  - Inspect today_date and the DR's meetings_next_14d list (which now includes CANCELLED meetings, flagged with is_cancelled: true).
  - If the DR's next confirmed 1:1 is today or in the future, the check-in is NOT yet due. Frame as "check-in not yet due, 1:1 is Thursday". DO NOT say "missed".
  - If the DR's most recent scheduled 1:1 this week was CANCELLED and no replacement is on the calendar yet, frame as "1:1 cancelled; check-in not late, awaiting reschedule". DO NOT say "missed".
  - Only call a check-in "missed" / "didn't submit" if a confirmed 1:1 already happened this week AND no check-in exists. That is a real miss.
  - This applies to the headline too. If neither DR has a real miss, the headline should NOT say they "didn't submit" -- describe the actual situation (e.g. "Quiet week -- Dana's 1:1 is Thursday; Priya's 1:1 was cancelled, awaiting reschedule").
- Each DR's latest_meeting_note holds what was discussed in their most recent 1:1. Use it for continuity in talking_points: follow up on the commitments or blockers raised there, and don't re-raise something already resolved.
- Use objective short_title if present; otherwise the full title.
- ONE entry per DR in talking_points. Never include the same DR more than once -- consolidate their points under a single entry.`

function userPromptFromContext(ctx) {
  const today = new Date().toISOString().slice(0, 10)
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: APP_TIMEZONE })
  return [
    `Today: ${today} (${dayName}, the leader's local time).`,
    `Briefing week: Mon ${ctx.week_start} to Sun (compare against previous week: ${ctx.previous_week_start}).`,
    `Calendar fetch status: ${ctx.calendar_status}.`,
    '',
    'DIRECT REPORTS WITH FULL DATA:',
    JSON.stringify(ctx.direct_reports, null, 2),
    '',
    'Generate the briefing now. Be terse.',
  ].join('\n')
}

function newAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// Cache reads run under the caller's session, so row-level security applies and
// a stored briefing is viewable by any CEO/admin without the service-role key.
async function sessionClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// Generating needs the service-role key (to read across reports) and an AI
// gateway key. It's also off on the public demo so a visitor can't run up the
// AI bill; the demo just serves the pre-generated briefing.
function canGenerate() {
  return !DEMO_MODE && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.AI_GATEWAY_API_KEY
}

async function gateRequest(request) {
  const auth = await getAuthenticatedUser()
  if (!auth) return { error: 'Unauthorized', status: 401 }
  const role = auth.profile?.role
  if (role !== 'ceo' && role !== 'admin') {
    return { error: 'Forbidden -- CEO/admin only', status: 403 }
  }
  return { auth }
}

function ndjsonChunk(obj) {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds (Vercel Fluid Compute)

/**
 * POST /api/ai/insights
 *   body: { week_start: 'YYYY-MM-DD', regenerate?: boolean }
 *   response: application/x-ndjson stream
 *     - {type:'cached', content, meta}          (single line, if hit)
 *     - {type:'partial', data}                  (many lines)
 *     - {type:'done', meta}                     (final line)
 *     - {type:'error', message}                 (terminal)
 */
export async function POST(request) {
  const gate = await gateRequest(request)
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (DEMO_MODE) {
    return NextResponse.json({ error: 'Briefing generation is disabled in the demo.' }, { status: 403 })
  }
  if (!canGenerate()) {
    return NextResponse.json({ error: 'Weekly briefing is not configured in this environment.' }, { status: 503 })
  }

  let body
  try { body = await request.json() } catch { body = {} }
  const { week_start, regenerate = false } = body
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return NextResponse.json({ error: 'Missing or invalid week_start' }, { status: 400 })
  }

  const admin = newAdmin()

  if (!regenerate) {
    const { data: cached } = await admin
      .from('ai_briefings')
      .select('*')
      .eq('week_start', week_start)
      .maybeSingle()
    if (cached) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(ndjsonChunk({
            type: 'cached',
            content: cached.content,
            meta: {
              model: cached.model,
              input_tokens: cached.input_tokens,
              cached_tokens: cached.cached_tokens,
              output_tokens: cached.output_tokens,
              cost_cents: cached.cost_cents,
              latency_ms: cached.latency_ms,
              generated_at: cached.generated_at,
            },
          }))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      })
    }
  }

  // Build context (one set of DB round-trips + a calendar fetch that may fail)
  let ctx
  try {
    ctx = await buildBriefingContext(week_start)
  } catch (err) {
    console.error('Context build failed:', err)
    return NextResponse.json({ error: 'Failed to assemble briefing data' }, { status: 500 })
  }

  const startTime = Date.now()

  const result = streamObject({
    model: MODEL,
    schema: BriefingSchema,
    // system goes top-level per AI SDK guidance, safer than stuffing it in user messages
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPromptFromContext(ctx),
            // Cache the long context block (DR roster + objectives + check-ins) so a
            // regenerate within 5min only pays ~10% of input cost
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
        ],
      },
    ],
    // Fail fast on non-retryable errors (403, schema/auth, etc.). The AI SDK
    // default of 2 retries with backoff once cost us 247s on a 403.
    maxRetries: 0,
    onError({ error }) {
      console.error('streamObject error:', error)
    },
  })

  const stream = new ReadableStream({
    async start(controller) {
      let finalObject = null
      try {
        for await (const partial of result.partialObjectStream) {
          finalObject = partial
          controller.enqueue(ndjsonChunk({ type: 'partial', data: partial }))
        }

        const usage = await result.usage
        const providerMeta = await result.providerMetadata
        const latency_ms = Date.now() - startTime

        const anthropicMeta = providerMeta?.anthropic || {}
        const cache_read = anthropicMeta.cacheReadInputTokens || 0
        const cache_write = anthropicMeta.cacheCreationInputTokens || 0
        const input_tokens = usage.inputTokens || 0
        const output_tokens = usage.outputTokens || 0
        const cost_cents = calcCostCents({
          input_tokens, output_tokens, cache_read, cache_write,
        })

        // Status enum scrub. Despite the prompt rule, the model sometimes copies
        // the raw enum (not_started, on_hold, etc.) from the data context into
        // prose. Walk every string in the JSON and rewrite them to bold natural
        // English so no underscored variable names ever reach the UI.
        const STATUS_REWRITES = [
          [/\bnot_started\b/gi,  '**not started**'],
          [/\bon_track\b/gi,     '**on track**'],
          [/\bat_risk\b/gi,      '**at risk**'],
          [/\boff_track\b/gi,    '**off track**'],
          [/\bon_hold\b/gi,      '**on hold**'],
          [/\bcompleted\b/gi,    '**completed**'],
        ]
        function scrubStrings(node) {
          if (typeof node === 'string') {
            return STATUS_REWRITES.reduce((s, [re, repl]) => s.replace(re, repl), node)
          }
          if (Array.isArray(node)) return node.map(scrubStrings)
          if (node && typeof node === 'object') {
            const out = {}
            for (const k of Object.keys(node)) out[k] = scrubStrings(node[k])
            return out
          }
          return node
        }
        finalObject = scrubStrings(finalObject)

        // DR dedupe in talking_points. The model occasionally duplicates a DR
        // despite the prompt rule, so collapse by dr_name (keeping first-seen
        // order) and merge their point lists.
        if (finalObject?.talking_points?.length) {
          const seen = new Map()
          for (const tp of finalObject.talking_points) {
            const name = tp?.dr_name?.trim()
            if (!name) continue
            const existing = seen.get(name)
            if (!existing) {
              seen.set(name, { ...tp, points: [...(tp.points || [])] })
            } else {
              for (const p of (tp.points || [])) {
                if (!existing.points.includes(p)) existing.points.push(p)
              }
              if (!existing.upcoming_meeting_label && tp.upcoming_meeting_label) {
                existing.upcoming_meeting_label = tp.upcoming_meeting_label
              }
            }
          }
          finalObject.talking_points = Array.from(seen.values())
        }

        // upsert overwrites this week's previous row on regenerate
        const { error: upsertErr } = await admin
          .from('ai_briefings')
          .upsert({
            week_start,
            content: finalObject,
            model: MODEL,
            input_tokens,
            output_tokens,
            cached_tokens: cache_read,
            cost_cents,
            latency_ms,
            generated_by: gate.auth.user.id,
            generated_at: new Date().toISOString(),
          }, { onConflict: 'week_start' })
        if (upsertErr) {
          console.error('Briefing upsert failed:', upsertErr)
        }

        controller.enqueue(ndjsonChunk({
          type: 'done',
          meta: {
            model: MODEL,
            input_tokens,
            output_tokens,
            cached_tokens: cache_read,
            cost_cents,
            latency_ms,
            generated_at: new Date().toISOString(),
          },
        }))
        controller.close()
      } catch (err) {
        console.error('Stream failure, discarding partial:', err)
        // Dig out the most useful error string. Gateway errors stash the
        // human-readable message in responseBody.
        let detail = err?.message || 'Unknown error'
        try {
          const causeBody = err?.cause?.responseBody
          if (causeBody) {
            const parsed = JSON.parse(causeBody)
            if (parsed?.error?.message) detail = parsed.error.message
          }
        } catch {}
        controller.enqueue(ndjsonChunk({
          type: 'error',
          message: detail,
        }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * GET /api/ai/insights?week_start=YYYY-MM-DD
 *   returns the cached row or 404. Used by past-weeks dropdown.
 *
 * GET /api/ai/insights?history=1
 *   returns list of past briefings (week_start, generated_at, model, cost_cents).
 */
export async function GET(request) {
  const gate = await gateRequest(request)
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(request.url)
  const db = await sessionClient()

  if (searchParams.get('history') === '1') {
    const { data, error } = await db
      .from('ai_briefings')
      .select('week_start, generated_at, model, cost_cents, input_tokens, output_tokens, cached_tokens, latency_ms')
      .order('week_start', { ascending: false })
      .limit(52)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ briefings: data || [] })
  }

  const week_start = searchParams.get('week_start')
  if (!week_start) {
    return NextResponse.json({ error: 'Missing week_start' }, { status: 400 })
  }

  const { data, error } = await db
    .from('ai_briefings')
    .select('*')
    .eq('week_start', week_start)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    // No stored briefing. Offer generation if it's available, otherwise report
    // the feature as dormant so the card shows a quiet note rather than an error.
    if (canGenerate()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ unconfigured: true })
  }

  return NextResponse.json({
    content: data.content,
    meta: {
      model: data.model,
      input_tokens: data.input_tokens,
      cached_tokens: data.cached_tokens,
      output_tokens: data.output_tokens,
      cost_cents: data.cost_cents,
      latency_ms: data.latency_ms,
      generated_at: data.generated_at,
    },
  })
}
