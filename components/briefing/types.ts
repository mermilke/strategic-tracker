// Shapes for the weekly briefing the AI route streams back. Every field is
// optional because the content arrives incrementally during streaming, so a
// partial object is always a valid Briefing.

export type BriefingRisk = {
  severity?: string
  item?: string
  owner_name?: string | null
}

export type BriefingMomentum = {
  item?: string
  owner_name?: string | null
}

export type BriefingTalkingPoint = {
  dr_name?: string
  upcoming_meeting_label?: string | null
  points?: string[]
}

export type Briefing = {
  headline?: string
  top_items?: string[]
  risks?: BriefingRisk[]
  momentum?: BriefingMomentum[]
  talking_points?: BriefingTalkingPoint[]
  data_caveats?: string[]
}

// Generation metadata shown in the dev panel and the "generated ..." subtitle.
export type BriefingMeta = {
  generated_at?: string
  model?: string
  input_tokens?: number | null
  cached_tokens?: number | null
  output_tokens?: number | null
  latency_ms?: number | null
  cost_cents?: number | null
}
