// ─────────────────────────────────────────────────────────────────────────────
// The AI insight's reply gate (owner live report 2026-10-15).
//
// With no readable numbers the model answered conversationally ("I'm ready to
// help summarize your…", "I'll need information such as:", "Revenue breakdown
// (tuition %, other sources)") and the Finance page cut that into five
// "warning" tiles. A warning must be a REAL warning, so the reply is accepted
// only as a list of tagged signals:
//   - every kept line starts with a [RISK] / [WATCH] / [STRENGTH] tag;
//   - untagged lines (a stray preamble, a bare list item) are dropped;
//   - a reply where ANY line is a question or asks for information is not a
//     summary at all — it is rejected whole;
//   - nothing left → null, and the caller falls back to the rule text.
// Pure + deterministic so the gate is unit-testable without a provider.
// ─────────────────────────────────────────────────────────────────────────────

export type InsightTag = 'RISK' | 'WATCH' | 'STRENGTH'

/** At most this many signals survive (the Finance warnings grid and Home band). */
export const MAX_INSIGHT_SIGNALS = 5

/** A tagged line: optional bullet/number/markdown, then the tag in [], (), or bare with a separator. */
const TAG_RE =
  /^(?:[-•*>]\s*|\d+[.)]\s*)?(?:\*\*|__)?\s*[[(]\s*(risk|watch|strength)\s*[\])]\s*(?:\*\*|__)?\s*[:\-–—]?\s*|^(?:[-•*>]\s*|\d+[.)]\s*)?(?:\*\*|__)?\s*(risk|watch|strength)\s*(?:\*\*|__)?\s*[:\-–—]\s*(?:\*\*|__)?\s*/i

/**
 * A line that is the model talking to the user instead of summarizing the
 * school — a request for data, an offer to help, a refusal. Checked on EVERY
 * line, tagged or not: a tagged "[WATCH] Please share your revenue breakdown"
 * is still a request.
 */
const CONVERSATIONAL_RE = new RegExp(
  [
    String.raw`\?`,
    String.raw`\bI(?:['’]ll| will| would| do)? need\b`,
    String.raw`\bI(?:['’]m| am) (?:ready|happy|glad|able)\b`,
    String.raw`\b(?:happy|glad|ready) to help\b`,
    String.raw`\bI can(?:not|['’]t)?\b`,
    String.raw`\bI(?:['’]d| would) (?:need|like|be)\b`,
    String.raw`\bI don['’]?t (?:have|see)\b`,
    String.raw`\b(?:unable|not able) to (?:summari[sz]e|assess|provide|analy[sz]e)\b`,
    String.raw`\bplease\b`,
    String.raw`\b(?:could|can|would) you\b`,
    String.raw`\blet me know\b`,
    String.raw`\b(?:provide|share|send|upload)(?: me)?(?: with)? (?:the|your|some|more|additional)\b`,
    String.raw`\binformation such as\b`,
    String.raw`\bonce (?:you|I) (?:have|provide|share|receive)\b`,
    String.raw`\bif you (?:can )?(?:provide|share|send|upload)\b`,
    String.raw`\b(?:no|missing|without) (?:metrics|data|numbers|figures)(?: (?:was|were|is|are|have been))? (?:provided|available|supplied|given)\b`,
  ].join('|'),
  'i',
)

/** The tag of a line, or null when it doesn't start with one. */
export function insightTagOf(line: string): InsightTag | null {
  const m = line.trim().match(TAG_RE)
  if (!m) return null
  return (m[1] ?? m[2]).toUpperCase() as InsightTag
}

/** True when the line is a question, a request for information, or chat. */
export function isConversationalLine(line: string): boolean {
  return CONVERSATIONAL_RE.test(line)
}

/**
 * Validate an LLM insight reply. Returns the normalised signals
 * (`[TAG] sentence` per line, ≤ MAX_INSIGHT_SIGNALS) or null when the reply is
 * not a usable list of tagged signals — the caller then uses the rule text.
 */
export function validateInsightReply(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null
  const lines = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return null
  // One conversational line poisons the reply: the model wasn't summarizing.
  if (lines.some(isConversationalLine)) return null

  const kept: string[] = []
  for (const line of lines) {
    const m = line.match(TAG_RE)
    if (!m) continue // untagged → never a signal
    const tag = (m[1] ?? m[2]).toUpperCase()
    const body = line
      .slice(m[0].length)
      .replace(/\*\*|__/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    // A tag with no real sentence after it ("[RISK]", "[WATCH] —") is not a signal.
    if (body.split(' ').filter((w) => /[a-z0-9]/i.test(w)).length < 3) continue
    kept.push(`[${tag}] ${body}`)
    if (kept.length >= MAX_INSIGHT_SIGNALS) break
  }
  return kept.length > 0 ? kept.join('\n') : null
}
