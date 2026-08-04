// ─────────────────────────────────────────────────────────────────────────────
// "Penny narrates the briefing" — PURE composition helpers.
//
// Framework-free (no Nest, no I/O): the BRIEFING-SHAPED composition lives here and
// is trivially unit-testable (mirrors the briefing-lens.ts purity discipline). The
// service (briefing-narration.service.ts) does the I/O (fetch briefing, call the
// LLM, cache) and delegates ALL composition + validation to these functions.
//
// VALUE-SAFETY INVARIANT: the LLM contributes PHRASING ONLY. The item set, order,
// severity, link, title, dueDate, voice, schoolName and every COUNT always come
// from the server payload. `assembleSegments` iterates the server's items in
// server order and takes the model's text keyed by id; a per-segment numeric-token
// guard swaps any segment whose figures don't all appear in that item's own server
// strings back to the deterministic `templateSegment`. No figure a user sees or
// hears can originate in the model.
//
// AIC PHASE J: the guard itself now lives in ./value-safety.ts, unchanged and
// shared with the accreditation advisory. Only the BRIEFING product rules stayed
// here — org attribution, the viewer closing, the not-reported aside. The symbols
// below are RE-EXPORTED (not re-implemented) so every existing importer, including
// the untouched briefing-narration.spec.ts, keeps the SAME function objects.
// ─────────────────────────────────────────────────────────────────────────────
import {
  allowedItemTokens,
  allowedSummaryTokens,
  guardSegment,
  renderDueDateHuman,
} from './value-safety.js'

export {
  allowedItemTokens,
  allowedSummaryTokens,
  renderDueDateHuman,
  validateSegmentNumbers,
  violatesGovernanceVoice,
} from './value-safety.js'

export type DayPart = 'morning' | 'afternoon' | 'evening'
export type NarrationSeverity = 'critical' | 'warn' | 'info'
export type NarrationVoice = 'decision' | 'action' | 'governance'

/** A server briefing item projected to the fields narration needs (no raw value/metricKey). */
export interface NarrationSourceItem {
  id: string
  severity: NarrationSeverity
  source: string
  title: string
  why: string
  link: string
  dueDate: string | null
  voice: NarrationVoice | null
  /** org scope only — the attributed school. */
  schoolName?: string
}

export interface NarrationSummary {
  total: number
  critical: number
  warn: number
  info: number
}

export interface NarrationOrgMeta {
  schoolsReporting: number
  schoolCount: number
  notReported: string[]
}

/** Everything the pure composer needs. `items` is the already-capped (<= NARRATE_CAP)
 *  server-ordered narration set; `summary` carries the FULL counts. */
export interface NarrationPayload {
  scope: 'school' | 'org'
  lens: string
  lensLabel: string
  summary: NarrationSummary
  items: NarrationSourceItem[]
  orgMeta?: NarrationOrgMeta
  /** summary.total - narratedItemCount (folded into the closing), never negative. */
  omittedItemCount: number
}

export type NarrationSegment =
  | { kind: 'opening'; text: string }
  | {
      kind: 'item'
      text: string
      itemId: string
      title: string
      severity: NarrationSeverity
      source: string
      link: string
      dueDate: string | null
      voice: NarrationVoice | null
      schoolName?: string
    }
  | { kind: 'aside'; text: string }
  | { kind: 'closing'; text: string }

/** The tolerant shape parsed out of the LLM JSON reply. */
export interface ParsedNarration {
  opening: string
  items: { id: string; text: string }[]
  closing: string
}

export interface BriefingNarrationResponse {
  scope: 'school' | 'org'
  lens: string
  source: 'llm' | 'template'
  cached: boolean
  generatedAt: string
  briefingGeneratedAt: string
  periodId: string | null
  periodLabel: string | null
  fiscalYearStart: string | null
  summary: NarrationSummary
  orgMeta?: NarrationOrgMeta
  narratedItemCount: number
  omittedItemCount: number
  segments: NarrationSegment[]
}

/** How many item segments a spoken brief narrates before the tail folds into the closing. */
export const NARRATE_CAP = 7

/** The value-safe-by-construction deterministic segment text for one item. */
export function templateSegment(item: NarrationSourceItem, scope: 'school' | 'org'): string {
  let base = `${item.title}. ${item.why}`
  if (scope === 'org' && item.schoolName && !base.includes(item.schoolName)) {
    base = `At ${item.schoolName}: ${base}`
  }
  if (item.dueDate) base += ` Due ${renderDueDateHuman(item.dueDate)}.`
  return base
}

function summaryExtras(payload: NarrationPayload): number[] {
  const e = [payload.omittedItemCount]
  if (payload.scope === 'org' && payload.orgMeta) {
    e.push(payload.orgMeta.schoolsReporting, payload.orgMeta.schoolCount, payload.orgMeta.notReported.length)
  }
  return e
}

function templateOpening(payload: NarrationPayload, dayPart: DayPart): string {
  const g = `Good ${dayPart}.`
  const { total, critical, warn } = payload.summary
  if (payload.scope === 'org' && payload.orgMeta && payload.orgMeta.schoolsReporting === 0) {
    return `${g} None of your schools have reported statements for this year yet.`
  }
  if (total === 0) {
    return `${g} You're all caught up — nothing needs a decision today.`
  }
  if (payload.lens === 'viewer') {
    return `${g} Here is what the board should be aware of: ${total} ${total === 1 ? 'item' : 'items'}, ${critical} of them significant.`
  }
  return `${g} ${total} ${total === 1 ? 'thing needs' : 'things need'} a decision today — ${critical} critical, ${warn} to watch.`
}

function templateClosing(payload: NarrationPayload): string {
  if (payload.summary.total === 0) {
    return "You have a clean slate — I'll keep watch and flag anything the moment it needs you."
  }
  if (payload.lens === 'viewer') {
    return 'These are for your awareness ahead of the next meeting — I can walk through any of them.'
  }
  return 'Want me to open any of these, or turn one into a task? Just ask.'
}

/** Deterministic org "some schools haven't reported" aside; null when all reported.
 *  Lists ALL names (never "and N more") so the ONLY numeric token is the count k
 *  (= notReported.length, which is in the summary allowlist) — no derived figure the
 *  independent value-safety re-check could flag. */
function asideText(names: string[]): string | null {
  const k = names.length
  if (k === 0) return null
  const label = k === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[k - 1]}`
  return `${k} ${k === 1 ? "school hasn't" : "schools haven't"} reported yet: ${label}.`
}

function closingSuffix(payload: NarrationPayload): string {
  if (payload.summary.total > 0 && payload.omittedItemCount > 0) {
    return ` …and ${payload.omittedItemCount} more on your board below.`
  }
  return ''
}

/**
 * Compose the final segment array from the server payload + (optional) parsed LLM
 * reply. `parsed === null` ⇒ fully deterministic template. Otherwise the LLM's
 * text is used PER SEGMENT only when it passes the numeric guard (and, for
 * governance-voice items, the imperative guard); any failing segment falls back to
 * its template text. Item set + order + metadata are always server-owned: an
 * invented id is silently ignored (it never appears in payload.items), a skipped
 * id gets its template segment.
 */
export function assembleSegments(
  payload: NarrationPayload,
  dayPart: DayPart,
  parsed: ParsedNarration | null,
): NarrationSegment[] {
  const segments: NarrationSegment[] = []

  // ── OPENING ──────────────────────────────────────────────────────────────
  const openTpl = templateOpening(payload, dayPart)
  let openText = openTpl
  if (parsed && parsed.opening.trim()) {
    openText = guardSegment({
      templateText: openTpl,
      candidateText: parsed.opening,
      allow: allowedSummaryTokens(payload.summary, summaryExtras(payload)),
    }).text
  }
  segments.push({ kind: 'opening', text: openText })

  // ── ITEMS (server order; LLM invents nothing, skips fall to template) ──────
  const byId = new Map<string, string>()
  if (parsed) for (const e of parsed.items) byId.set(e.id, e.text)
  for (const item of payload.items) {
    const tpl = templateSegment(item, payload.scope)
    // The numeric + governance-voice guard is the shared value rule (value-safety.ts).
    // The org-attribution prefix below is a BRIEFING rule and is applied AFTER it, and
    // only to text the guard actually kept — a template segment already carries the
    // school name from templateSegment().
    const g = guardSegment({
      templateText: tpl,
      candidateText: parsed ? (byId.get(item.id) ?? null) : null,
      allow: allowedItemTokens(item),
      voice: item.voice,
    })
    let text = g.text
    if (
      g.source === 'llm' &&
      payload.scope === 'org' &&
      item.schoolName &&
      !g.text.includes(item.schoolName)
    ) {
      // Org attribution: guarantee the school name is spoken in the segment.
      text = `At ${item.schoolName}: ${g.text}`
    }
    segments.push({
      kind: 'item',
      text,
      itemId: item.id,
      title: item.title,
      severity: item.severity,
      source: item.source,
      link: item.link,
      dueDate: item.dueDate,
      voice: item.voice ?? null,
      ...(item.schoolName ? { schoolName: item.schoolName } : {}),
    })
  }

  // ── ASIDE (org not-reported callout, always deterministic) ─────────────────
  if (payload.scope === 'org' && payload.orgMeta) {
    const a = asideText(payload.orgMeta.notReported)
    if (a) segments.push({ kind: 'aside', text: a })
  }

  // ── CLOSING ────────────────────────────────────────────────────────────────
  // Board (viewer) lens: the closing must never offer a write action ("turn one
  // into a task"). The numeric guard can't see intent, so for viewer we simply
  // never trust the LLM closing — the advisory template is used verbatim (S2).
  const closeTpl = templateClosing(payload)
  let closeText = closeTpl
  if (parsed && parsed.closing.trim() && payload.lens !== 'viewer') {
    closeText = guardSegment({
      templateText: closeTpl,
      candidateText: parsed.closing,
      allow: allowedSummaryTokens(payload.summary, summaryExtras(payload)),
    }).text
  }
  segments.push({ kind: 'closing', text: closeText + closingSuffix(payload) })

  return segments
}

/** The fully deterministic, value-safe-by-construction narration (no LLM). */
export function buildTemplateNarration(payload: NarrationPayload, dayPart: DayPart): NarrationSegment[] {
  return assembleSegments(payload, dayPart, null)
}

/** Stable content hash over the items + summary — cache key + self-invalidation. */
export function hashBriefingItems(items: NarrationSourceItem[], summary: NarrationSummary): string {
  const basis = JSON.stringify({
    i: items.map((i) => [i.id, i.severity, i.source, i.title, i.why, i.dueDate, i.voice ?? null, i.schoolName ?? null]),
    s: [summary.total, summary.critical, summary.warn, summary.info],
  })
  // FNV-1a (32-bit) — deterministic, dependency-free.
  let h = 0x811c9dc5
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** Tolerant parse of the model's JSON reply. Strips ``` fences and surrounding
 *  prose; returns null only on hard garbage (missing braces / unparseable). */
export function parseNarrationJson(raw: string): ParsedNarration | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last < first) return null
  s = s.slice(first, last + 1)
  let obj: unknown
  try {
    obj = JSON.parse(s)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const opening = typeof o.opening === 'string' ? o.opening : ''
  const closing = typeof o.closing === 'string' ? o.closing : ''
  const items = Array.isArray(o.items)
    ? o.items
        .filter(
          (e): e is { id: string; text: string } =>
            !!e &&
            typeof e === 'object' &&
            typeof (e as Record<string, unknown>).id === 'string' &&
            typeof (e as Record<string, unknown>).text === 'string',
        )
        .map((e) => ({ id: e.id, text: e.text }))
    : []
  return { opening, items, closing }
}

/** Build the (system, user) messages for the narration LLM call. NO tools passed. */
export function buildNarrationPrompt(payload: NarrationPayload, dayPart: DayPart): unknown[] {
  const viewer = payload.lens === 'viewer'
  const org = payload.scope === 'org'
  const system =
    'You are Penny, a warm, concise financial co-pilot for an independent school. You write a short, spoken ' +
    '"morning brief" narration of a PRE-COMPUTED attention briefing you are given as JSON. You only rephrase it ' +
    'warmly in Penny\'s voice — you never add, drop, merge, or reorder items, and you never invent, recompute, ' +
    'round, convert, or restate any figure that is not already present verbatim in that item.\n\n' +
    'STRICT RULES:\n' +
    '- Use every figure EXACTLY as written in the input, in digits. Do NOT do arithmetic and do NOT mention any ' +
    'number that is not present verbatim in that same item (opening/closing may reference only the summary counts).\n' +
    '- At most 2 short sentences per item.\n' +
    '- Return ONLY the items you were given, each keyed by its exact "id". Do not add items; order is fixed by the server.\n' +
    '- An item whose "voice" is "governance" is for a board audience: use advisory, awareness language ' +
    '("worth reviewing with leadership", "the board should be aware") — NEVER an operator imperative like ' +
    '"Fix", "Reconcile", "Go", "Import", "Update", "Assign".\n' +
    (viewer
      ? '- This is the BOARD (view-only) audience: the closing must NOT offer to make any change, create tasks, or take any write action — only offer to walk through or discuss.\n'
      : '- The closing may warmly offer to open an item or turn one into a task.\n') +
    (org
      ? '- This is an ORG view across multiple schools: each item carries a "schoolName" — mention that school by name in its sentence.\n'
      : '- This is a single school.\n') +
    '\nReturn STRICT JSON only (no markdown, no code fences), exactly this shape:\n' +
    '{"opening":"...","items":[{"id":"<given id>","text":"..."}],"closing":"..."}'

  const userPayload: Record<string, unknown> = {
    greeting: `Good ${dayPart}`,
    view: payload.lensLabel,
    scope: payload.scope,
    summary: payload.summary,
    items: payload.items.map((i) => ({
      id: i.id,
      severity: i.severity,
      source: i.source,
      title: i.title,
      why: i.why,
      dueDate: i.dueDate,
      voice: i.voice,
      ...(i.schoolName ? { schoolName: i.schoolName } : {}),
    })),
  }
  if (org && payload.orgMeta) {
    userPayload.schoolsReporting = payload.orgMeta.schoolsReporting
    userPayload.schoolCount = payload.orgMeta.schoolCount
    userPayload.notReported = payload.orgMeta.notReported
  }

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content:
        'Narrate this briefing warmly and briefly. Reply with STRICT JSON only.\n\n' +
        JSON.stringify(userPayload),
    },
  ]
}
