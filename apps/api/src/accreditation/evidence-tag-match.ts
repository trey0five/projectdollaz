import type { RequirementTag } from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — the ONE knowledge-document title matcher.
//
// listSuggestions has inlined these literals at seven call sites since Phase 3,
// and Phase C's auto-satisfaction resolver needs exactly the same patterns. Two
// copies would drift the day someone adds "auditor" to one of them, and the
// school would then see a document suggested on the standard drawer that the
// Evidence Index refuses to auto-link — the same file, two answers.
//
// The values for the seven pre-existing tags are BYTE-IDENTICAL to the literals
// they replace; accreditation.service.spec.ts pins the suggestion output.
// `self_study` is additive and only ever reached by an `external` requirement,
// which is unconditionally `not_tracked`, so it can never change a state.
//
// A TITLE MATCH IS NOT A DATE. Nothing here infers when a document is from —
// the resolver that uses these patterns returns effectiveDate: null, always.
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWLEDGE_TAG_PATTERNS: Partial<Record<RequirementTag, string[]>> = {
  financial_audit: ['audit'],
  budget: ['budget'],
  enrollment_data: ['enrollment'],
  staff_credentials: ['credential', 'certif'],
  safety_plan: ['safety', 'crisis'],
  survey: ['survey'],
  marketing: ['marketing'],
  self_study: ['self-study', 'self study'],
}

/** Case-insensitive "does this title contain any of the tag's patterns". */
export function titleMatchesTag(title: string, tag: string): boolean {
  const patterns = KNOWLEDGE_TAG_PATTERNS[tag as RequirementTag]
  if (!patterns || patterns.length === 0) return false
  const haystack = title.toLowerCase()
  return patterns.some((p) => haystack.includes(p.toLowerCase()))
}
