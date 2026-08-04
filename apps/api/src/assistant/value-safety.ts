// ─────────────────────────────────────────────────────────────────────────────
// VALUE SAFETY — the product-neutral guard between a language model and a user.
//
// AIC Phase J extracted this out of narration.compose.ts BY CUT AND PASTE. Every
// function below is character-for-character what shipped with "Penny narrates the
// briefing"; briefing-narration.spec.ts pins that and is NOT edited, which is what
// makes the move provably behaviour-preserving rather than merely plausible.
//
// THE ONE RULE THIS FILE ENFORCES: the LLM never originates a finding, a number, a
// document name or a cause. It contributes PHRASING ONLY. Every figure a user reads
// or hears is a server string; a segment whose figures do not ALL appear in that
// segment's own server strings is discarded and its deterministic template is used
// instead. A guard is not a request to the model — it is a filter over what the
// model said, applied after the fact, that the model cannot influence.
//
// PURE: no Nest, no I/O, no `new Date()`, no imports. Product rules (which items to
// narrate, what a board audience may be offered, how a briefing closes) live in the
// callers; only the VALUE rule lives here, so it can be shared by the briefing
// narration and the accreditation advisory without either learning about the other.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Governance advisory guard — a board (viewer/governance-voice) segment must never
// open with an operator imperative. Kept in lockstep with the prompt rule.
const GOVERNANCE_IMPERATIVE_RE = /^(Fix|Go|Reconcile|Import|Update|Create|Assign|Upload|Map)\b/i

// Numeric grammar — the figure shapes the board UI glows ($1,234.56 / 86.6% /
// bare 1,234), now SIGN- and UNIT-aware so the guard can't be fooled by a
// sentiment flip (-2.0% → +2.0%) or a unit swap (5 days → $5k / 5 million).
// Captures an optional leading minus, an optional $, the digits, an optional %,
// and an optional scale word. Global so we can sweep a whole segment.
const FIGURE_RE = /[-−]?\$?\d[\d,]*(?:\.\d+)?%?(?:(?:k|m|bn)\b|\s(?:thousand|million|billion)\b)?/gi

// Spelled 0…12 → digit (belt-and-braces: the prompt asks for digits, but if the
// model spells a small count we still catch/allow it).
const SPELLED: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
}

/** Canonicalize a numeric token into a SIGN + MAGNITUDE + UNIT + SCALE key, so two
 *  figures are "equal" only when all four agree: "-2.0%"→"-2%", "2%"→"2%", "$5k"→
 *  "5$k", bare "5"→"5", "1,234"→"1234", "5 million"→"5m". This is the crux of
 *  value-safety: a figure the model invents — or whose sign or unit it flips —
 *  yields a key absent from the item's allowlist and is rejected. A bare count
 *  ("3") canonicalizes to just its number, so the summary allowlist (String(n))
 *  still matches. Non-numeric residue passes through unchanged. */
export function canon(raw: string): string {
  const r = raw.trim().toLowerCase()
  const neg = /^[-−]/.test(r)
  const unit = r.includes('$') ? '$' : r.includes('%') ? '%' : ''
  const scaleM = /(k|m|bn|thousand|million|billion)$/.exec(r)
  const scale = scaleM
    ? scaleM[1] === 'k' || scaleM[1] === 'thousand'
      ? 'k'
      : scaleM[1] === 'bn' || scaleM[1] === 'billion'
        ? 'b'
        : 'm'
    : ''
  const core = r.replace(/[-−$,%\s]/g, '').replace(/(k|m|bn|thousand|million|billion)$/, '')
  if (core === '') return raw
  const n = Number(core)
  if (!Number.isFinite(n)) return core
  return `${neg ? '-' : ''}${n}${unit}${scale}`
}

/** Every numeric token in a string: canonical figures ∪ spelled-number digits. */
export function tokensOf(s: string): Set<string> {
  const set = new Set<string>()
  for (const m of s.matchAll(FIGURE_RE)) set.add(canon(m[0]))
  const low = s.toLowerCase()
  for (const [w, d] of Object.entries(SPELLED)) {
    if (new RegExp(`\\b${w}\\b`).test(low)) set.add(d)
  }
  return set
}

/** Render an ISO yyyy-mm-dd as a spoken date ("Jul 3, 2026"); pass through if not ISO. */
export function renderDueDateHuman(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12) return iso
  return `${MONTHS[mo - 1]} ${d}, ${y}`
}

/** The STRUCTURAL MINIMUM `allowedItemTokens` needs. `NarrationSourceItem` (and any
 *  future advisory item) structurally satisfies it, so callers keep their own richer
 *  types and this file learns nothing about a briefing. */
export interface TokenBearingItem {
  title: string
  why: string
  dueDate: string | null
  schoolName?: string
}

/** The STRUCTURAL MINIMUM `allowedSummaryTokens` needs — `NarrationSummary` satisfies it. */
export interface CountSummary {
  total: number
  critical: number
  warn: number
  info: number
}

/** The numeric tokens permitted in an ITEM segment = tokens of its own server
 *  strings (title ∪ why ∪ dueDate ISO ∪ human-rendered dueDate). */
export function allowedItemTokens(item: TokenBearingItem): Set<string> {
  const strs = [item.title, item.why]
  // Only the HUMAN-rendered dueDate ("Jul 15, 2026") — the raw ISO would leak a
  // stray "07"→"7" token the segment never legitimately needs (N4). Segments are
  // instructed to speak dates in the human form, and templateSegment uses it too.
  if (item.dueDate) strs.push(renderDueDateHuman(item.dueDate))
  // Org attribution: the schoolName is a trusted server string the LLM is REQUIRED
  // to include, so its digits (e.g. "PS 121", "St. John's #2") are allowed — else a
  // digit-bearing name would force every org item to the template.
  if (item.schoolName) strs.push(item.schoolName)
  const set = new Set<string>()
  for (const s of strs) for (const t of tokensOf(s)) set.add(t)
  return set
}

/** The numeric tokens permitted in opening/closing = the summary counts + extras
 *  (omittedItemCount, and for org: schoolsReporting, schoolCount, notReported.length). */
export function allowedSummaryTokens(summary: CountSummary, extras: number[]): Set<string> {
  const set = new Set<string>()
  for (const n of [summary.total, summary.critical, summary.warn, summary.info, ...extras]) {
    set.add(String(n))
  }
  return set
}

/** The numeric tokens permitted in a segment whose provenance is an explicit list of
 *  server strings — the Mode-B/Mode-C shape, where a segment's allowlist is derived
 *  from ITS OWN sources and nothing else. Taking the union across all segments would
 *  let a figure computed for one paragraph be spoken in another, which is the exact
 *  mutation MB-2/MC-1 prove red. */
export function allowedTokensFromStrings(sources: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const s of sources) for (const t of tokensOf(s)) set.add(t)
  return set
}

/** True when every numeric token in `text` is in `allow` (i.e. no invented figure). */
export function validateSegmentNumbers(text: string, allow: Set<string>): boolean {
  for (const t of tokensOf(text)) if (!allow.has(t)) return false
  return true
}

/** True when a governance-voice segment opens with an operator imperative (rejected).
 *
 *  KEPT BYTE-IDENTICAL — briefing-narration.spec.ts imports this name and pins its
 *  behaviour on a single-sentence candidate. The multi-sentence rule lives in
 *  {@link violatesGovernanceVoiceAnywhere}, which is what `guardSegment` calls: an
 *  imperative in sentence two is the same instruction to a board as an imperative in
 *  sentence one, and prefixing "The board should note this." must not buy one. */
export function violatesGovernanceVoice(text: string): boolean {
  return GOVERNANCE_IMPERATIVE_RE.test(text.trim())
}

/** Split into sentences on terminal punctuation. Deliberately crude: it only has to
 *  find where a sentence STARTS, and an over-split costs at most one extra check. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** True when ANY sentence of a governance-voice segment opens with an operator
 *  imperative. `^`-anchoring the test at the string start let a harmless first clause
 *  smuggle "Reconcile the evidence register before the next visit." into a board card. */
export function violatesGovernanceVoiceAnywhere(text: string): boolean {
  return sentencesOf(text).some((s) => GOVERNANCE_IMPERATIVE_RE.test(s))
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ORIGINATION SCREEN — the non-numeric half of THE ONE RULE.
//
// The numeric guard above answers "did the model invent a FIGURE". It says nothing
// about the other three things the rule forbids the model to originate: a CAUSE, a
// DOCUMENT NAME and a FINDING. A sentence carrying none of those needs no digits:
//
//   "…largely because staff turnover in the business office eased over the summer."
//   "…the Board Governance Handbook and the Annual Safety Audit are now on file."
//   "…the weakest position of any school in the diocese."
//
// Every one of those passed the numeric guard untouched and rendered as model text.
//
// THE RULE THIS SCREEN ENFORCES: within a segment, the model may only REPHRASE. So
// four classes of load-bearing word must already appear in that segment's OWN server
// strings, case-insensitively, on a word boundary — a number word, a mid-sentence
// capitalised word (proper noun / document title), a causal connective, and a
// superlative or peer-comparison claim. Anything else the model writes is function
// words and synonyms, which is what "phrasing only" means.
//
// WHAT IT IS NOT. It is a SCREEN, not a proof: an unsourced cause phrased without a
// connective ("…after the office caught up") still passes. It is deliberately opt-in
// — it runs only when a caller passes `sources`, which the briefing narration does
// NOT, so `assembleSegments` keeps byte-identical behaviour and briefing-narration.spec.ts
// stays untouched. The advisory composer passes each spec's own `sourceStrings`.
// ─────────────────────────────────────────────────────────────────────────────

/** Spelled numbers BEYOND the 0…12 the numeric allowlist canonicalises. "fifteen
 *  standards still have no evidence" carries no digit and so carried no token. */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'dozen', 'half', 'quarter', 'third',
]

/** Causal connectives. A cause is the one thing Mode B exists to attribute, and the
 *  one thing nothing in this program can check a model against. */
const CAUSAL_WORDS = [
  'because', 'due', 'owing', 'thanks', 'driven', 'caused', 'attributable', 'stems',
  'stemming', 'blame', 'reason', 'reasons', 'explains', 'explained', 'prompted',
  'triggered', 'reflects', 'reflecting', 'resulted', 'resulting',
]

/** Superlative / peer-comparison claim words. Each is a FINDING about where a school
 *  sits, and a finding is computed here or it is not stated. */
const CLAIM_WORDS = [
  'weakest', 'strongest', 'worst', 'best', 'lowest', 'highest', 'least', 'most',
  'behind', 'ahead', 'better', 'worse', 'leading', 'lagging', 'trailing', 'outperform',
  'outperforms', 'underperform', 'underperforms', 'typical', 'average', 'median',
  'majority', 'minority', 'rare', 'unusual', 'only',
]

const SCREENED_WORDS = new Set([...NUMBER_WORDS, ...CAUSAL_WORDS, ...CLAIM_WORDS])

/** Capitalised words that are never a proper noun in this product's prose. */
const CAP_STOPWORDS = new Set(['i', 'a', 'an', 'the'])

const WORD_RE = /[A-Za-z][A-Za-z'’]*/g

/** True when `word` appears in any source string, case-insensitively, on a word
 *  boundary. `\b` is safe here: every screened token is pure letters. */
function inSources(word: string, sources: readonly string[]): boolean {
  const re = new RegExp(`\\b${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  return sources.some((s) => re.test(s))
}

/**
 * Every load-bearing word the candidate uses that its own sources do not.
 * Returns the offending words (lowercased, de-duplicated) so a spec can name what
 * was caught rather than assert a bare boolean.
 */
export function unsourcedOriginations(
  candidate: string,
  sources: readonly string[],
): string[] {
  const out = new Set<string>()
  for (const sentence of sentencesOf(candidate)) {
    const words = sentence.match(WORD_RE) ?? []
    words.forEach((raw, i) => {
      const low = raw.toLowerCase()
      const screened = SCREENED_WORDS.has(low)
      // A CAPITALISED word that does not open its sentence is a proper noun — a
      // document title, a framework, a school, a person. Sentence-initial words are
      // skipped because capitalisation there carries no information.
      const properNoun = i > 0 && /^[A-Z]/.test(raw) && !CAP_STOPWORDS.has(low)
      if (!screened && !properNoun) return
      if (!inSources(low, sources)) out.add(low)
    })
  }
  return [...out]
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED PER-SEGMENT GUARD
//
// This is the loop `assembleSegments` has always run, with the briefing-specific
// parts lifted out and passed in. `assembleSegments` is now one of its two callers;
// `composeAdvisory` is the other. Extracting the LOOP rather than the whole of
// `assembleSegments` is deliberate: the loop is a value rule and belongs here, while
// `assembleSegments`' body is briefing product policy (org attribution, the viewer
// closing, the not-reported aside) that has no business inside a neutral guard.
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentVoice = 'decision' | 'action' | 'governance'

export interface GuardedSegmentInput {
  /** Deterministic, value-safe-by-construction text. Used when the candidate fails. */
  templateText: string
  /** The model's candidate text for this segment, or null/'' when it offered none. */
  candidateText: string | null
  /** Numeric tokens this segment is permitted to contain. */
  allow: Set<string>
  /** 'governance' additionally forbids an operator-imperative opening. */
  voice?: SegmentVoice | null
  /**
   * This segment's OWN server strings. When present, the ORIGINATION SCREEN runs on
   * top of the numeric guard: a cause, a document name or a peer claim the sources
   * do not contain falls back to the template. OPT-IN so the briefing narration's
   * behaviour is unchanged by its absence (`assembleSegments` passes no `sources`).
   */
  sources?: readonly string[] | null
}

export interface GuardedSegmentResult {
  text: string
  source: 'llm' | 'template'
}

/**
 * Returns the candidate ONLY when every numeric token is in `allow` and (for a
 * governance voice) it does not open with an operator imperative. Otherwise the
 * template. NEVER throws; a null/blank candidate is a template result.
 *
 * The default is the template, not the candidate: every path that is not an
 * explicit pass — no candidate, a blank candidate, a non-string, an invented
 * figure, a flipped sign, a swapped unit, a board imperative — lands on the
 * deterministic text. That polarity is the guarantee. A guard whose default were
 * "keep the model's words" would fail open on exactly the inputs nobody thought of.
 */
export function guardSegment(input: GuardedSegmentInput): GuardedSegmentResult {
  const { templateText, candidateText, allow, voice, sources } = input
  if (typeof candidateText !== 'string') return { text: templateText, source: 'template' }
  const c = candidateText.trim()
  if (!c) return { text: templateText, source: 'template' }
  if (!validateSegmentNumbers(c, allow)) return { text: templateText, source: 'template' }
  if (voice === 'governance' && violatesGovernanceVoiceAnywhere(c)) {
    return { text: templateText, source: 'template' }
  }
  // THE NON-NUMERIC HALF. Only when the caller supplied this segment's own sources.
  if (sources && unsourcedOriginations(c, sources).length > 0) {
    return { text: templateText, source: 'template' }
  }
  return { text: c, source: 'llm' }
}
