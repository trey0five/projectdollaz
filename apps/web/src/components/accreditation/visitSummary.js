// ─────────────────────────────────────────────────────────────────────────────
// visitSummary — SEAM B. AIC Phase H, §2.5.
//
// THE WHOLE POINT: the executive summary a board HEARS and the executive summary
// a board READS must be provably the same sentences. Four surfaces consume it —
// the Mock Visit screen (printed on the page), the Mock Visit screen (spoken via
// useNarrationPlayer), the Board Readiness One-Pager, and the scheduled board
// email — and not one of them is allowed to compose, reorder, filter, truncate or
// pad a sentence. All four read `visit.executiveSummary.segments`, which arrives
// from the ONE pure composer (`composeMockVisit`) already rendered.
//
// This module contains NO COPY. Read it: there is not a single sentence, count,
// date or percentage in it. It is a projection (`summarySpeech`) and a shape
// declaration (`SUMMARY_KEYS`), nothing more. The moment this file grows a string
// literal that reaches a user, the four surfaces can disagree again.
//
// WHY `summarySpeech` EXISTS AT ALL rather than the screen calling `.map` inline:
// so the spec that proves acceptance 3 has ONE function to compare the printed
// DOM against. `useNarrationPlayer(segments)` is handed the segment objects (it
// reads `.text` itself and, since no segment carries `kind:'item'`, its itemId
// plumbing is inert) — `summarySpeech` is the exact array of strings that player
// will speak, in the exact order it will speak them.
//
// THE NULL-TEXT SYMMETRY. `summarySpeech` and <ExecutiveSummary> must coerce a
// missing `text` IDENTICALLY, or the comparison spec goes red for a reason that
// has nothing to do with a surface drifting. Both use `?? ''`. The composer
// guarantees all six segments always carry a real sentence (a segment with
// nothing to say gets its frozen "nothing to say" sentence); this coercion is the
// belt to that brace, not a licence to ship a blank.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The six segment keys, in the order the composer always emits them.
 * ALWAYS all six, ALWAYS in this order — a variable-length summary cannot be
 * compared byte-for-byte across surfaces, which is the entire point of §2.5.
 */
export const SUMMARY_KEYS = Object.freeze([
  'opening',
  'strengths',
  'findings',
  'evidence',
  'unanswered',
  'plan',
])

/**
 * The DOM hook every rendered segment carries. It identifies WHICH segment a
 * paragraph is (the spec asserts the six keys in order); it is NOT how the
 * compared text is collected — see `summaryDomText`.
 */
export const SUMMARY_SEGMENT_ATTR = 'data-summary-segment'

/** The wrapper the compared region is scoped to. One per rendered summary. */
export const SUMMARY_TESTID = 'executive-summary'

/**
 * The exact strings handed to TTS, in order. No filtering, no joining, no
 * trimming, no sentence added and none dropped.
 *
 * A non-array input yields `[]` — the surfaces render nothing rather than throwing
 * on a payload that failed to load. It never yields a placeholder sentence.
 */
export function summarySpeech(segments) {
  if (!Array.isArray(segments)) return []
  return segments.map((s) => s?.text ?? '')
}

/**
 * Read EVERY sentence a rendered <ExecutiveSummary> actually put on the page.
 *
 * Lives here, beside `summarySpeech`, so both halves of the acceptance-3
 * comparison are declared in one file and neither surface can quietly change its
 * side of it. Test-only helper; it imports nothing and touches no global.
 *
 * IT READS EVERY `<p>` IN THE SUMMARY, NOT THE TAGGED SUBSET. The first cut
 * collected `[data-summary-segment]` nodes only — which meant a drifting surface
 * was compared on exactly the paragraphs that had volunteered to be compared. A
 * plain `<p>` added inside the summary ("The board should act on this
 * immediately.") made the printed one-pager render SEVEN sentences while the
 * narration player still spoke SIX, and the whole suite stayed green. Acceptance 3
 * is that the spoken summary and the printed summary are the same content, so the
 * comparison must see everything the reader sees.
 *
 * The optional `title` is an `<h3>` OUTSIDE the paragraph set, so a legitimate
 * heading still cannot leak in.
 *
 * Accepts either the render container or the summary element itself.
 */
export function summaryDomText(container) {
  if (!container?.querySelectorAll) return []
  const sel = `[data-testid="${SUMMARY_TESTID}"]`
  const scope = container.matches?.(sel)
    ? container
    : (container.querySelector?.(sel) ?? container)
  return [...scope.querySelectorAll('p')].map((el) => el.textContent)
}

export default summarySpeech
