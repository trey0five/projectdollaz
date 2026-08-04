// ─────────────────────────────────────────────────────────────────────────────
// THE ADVISORY COMPOSER — Mode B and Mode C, pure.
//
// AIC Phase J. The server composes N segments; each carries a deterministic
// `templateText` and the `sourceStrings` whose numbers it is allowed to speak. The
// model is shown those segments and may ONLY re-phrase them. Each candidate then
// survives only if every numeric token it contains appears in THAT SEGMENT'S OWN
// sources — not the union across segments, which would let a figure computed for
// one paragraph be spoken in another (the mutation MB-2/MC-1 prove red).
//
// A segment the model skipped, invented, mis-keyed or over-numbered gets its
// template. `templateFallbackCount` rides on the payload so "the model was ignored
// 4 times out of 5" is VISIBLE rather than silent — a guard whose activity nobody
// can see is a guard nobody maintains.
//
// PURE: no Nest, no I/O, no `new Date()`. The I/O and the LLM call live in
// advisory.service.ts; everything decidable without them is decided here so it is
// testable without booting anything.
// ─────────────────────────────────────────────────────────────────────────────
import { allowedTokensFromStrings, guardSegment, type SegmentVoice } from './value-safety.js'

export type AdvisoryMode = 'A' | 'B' | 'C'

export interface AdvisorySegmentSpec {
  id: string
  /** Deterministic text, composed only of verbatim server strings. */
  templateText: string
  /** The server strings whose numeric tokens this segment may use. */
  sourceStrings: string[]
  voice?: SegmentVoice | null
}

export interface AdvisorySegment {
  id: string
  text: string
  source: 'llm' | 'template'
}

export interface AdvisoryComposition {
  mode: AdvisoryMode
  segments: AdvisorySegment[]
  /** How many segments fell back. 0 ⇒ every candidate passed. */
  templateFallbackCount: number
  /** 'llm' only when at least one segment kept model text. */
  source: 'llm' | 'template'
  /**
   * Was a language model ACTUALLY consulted for these segments?
   *
   * Distinct from `source`, and the distinction is the whole point: `source:'template'`
   * with `modelCalled:true` means the model spoke and every sentence it offered was
   * thrown away; `modelCalled:false` means nothing was asked. A surface that renders
   * "N sentences were not accepted from the model" in the second case is describing an
   * interaction that did not happen, which is the same class of untruth this phase
   * exists to prevent — just aimed at the provenance strip instead of a figure.
   */
  modelCalled: boolean
}

/**
 * The frozen sentence Mode B returns when the diff attributes nothing.
 *
 * This is a STRING, not a prompt: when `attributions` is empty the tool does not
 * call the model at all. Not calling the model is stronger than guarding it — a
 * guard filters what the model said; a model that was never asked has said nothing.
 * A plausible cause is exactly what a language model is best at inventing and
 * exactly what nothing in this program can check.
 */
export const CANNOT_ATTRIBUTE =
  'Readiness moved, but I can’t attribute the change to anything in the register: no standard ' +
  'changed score, gained or lost evidence, or entered or left scope between those two dates.'

/** The deterministic composition — every segment is its templateText.
 *  `modelCalled` defaults to FALSE: the overwhelmingly common template path is the
 *  one where nothing was asked. The caller passes `true` only where it really did
 *  reach a model and threw the whole reply away. */
export function templateComposition(
  mode: AdvisoryMode,
  specs: readonly AdvisorySegmentSpec[],
  modelCalled = false,
): AdvisoryComposition {
  return {
    mode,
    segments: specs.map((s) => ({ id: s.id, text: s.templateText, source: 'template' as const })),
    templateFallbackCount: specs.length,
    source: 'template',
    modelCalled,
  }
}

/**
 * Apply the per-segment guard. `parsed === null` ⇒ templateComposition. Guard
 * semantics are byte-identical to `assembleSegments`: the allowlist is the tokens
 * of THIS spec's `sourceStrings` and nothing else.
 *
 * Segment set and ORDER are server-owned. A candidate whose id is not a server
 * segment id is dropped on the floor — it is never appended, because an invented
 * segment is an invented finding. A duplicate id keeps the FIRST candidate, so a
 * model cannot re-roll a segment it already failed.
 */
export function composeAdvisory(
  mode: AdvisoryMode,
  specs: readonly AdvisorySegmentSpec[],
  parsed: { segments: { id: string; text: string }[] } | null,
): AdvisoryComposition {
  if (!parsed) return templateComposition(mode, specs)

  const byId = new Map<string, string>()
  for (const s of parsed.segments) {
    if (typeof s?.id === 'string' && typeof s?.text === 'string' && !byId.has(s.id)) {
      byId.set(s.id, s.text)
    }
  }

  const segments: AdvisorySegment[] = specs.map((spec) => {
    const g = guardSegment({
      templateText: spec.templateText,
      candidateText: byId.get(spec.id) ?? null,
      allow: allowedTokensFromStrings(spec.sourceStrings),
      voice: spec.voice ?? null,
      // THE ORIGINATION SCREEN. Mode B's whole purpose is attribution of CAUSE, and
      // a cause carries no digits — the numeric allowlist above never saw it. Passing
      // the segment's own sources turns on the non-numeric half of the guard.
      sources: spec.sourceStrings,
    })
    return { id: spec.id, text: g.text, source: g.source }
  })

  const templateFallbackCount = segments.filter((s) => s.source === 'template').length
  return {
    mode,
    segments,
    templateFallbackCount,
    source: segments.some((s) => s.source === 'llm') ? 'llm' : 'template',
    // `parsed` is non-null here, so a model replied — whether or not any sentence of
    // it survived the guard.
    modelCalled: true,
  }
}

/** Tolerant JSON parse of the model reply: {"segments":[{"id":"…","text":"…"}]}.
 *  Strips fences/prose; null on hard garbage. Mirrors parseNarrationJson. */
export function parseAdvisoryJson(
  raw: string,
): { segments: { id: string; text: string }[] } | null {
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
  const segments = Array.isArray(o.segments)
    ? o.segments
        .filter(
          (e): e is { id: string; text: string } =>
            !!e &&
            typeof e === 'object' &&
            typeof (e as Record<string, unknown>).id === 'string' &&
            typeof (e as Record<string, unknown>).text === 'string',
        )
        .map((e) => ({ id: e.id, text: e.text }))
    : []
  return { segments }
}

/** Build the (system, user) messages for the advisory LLM call. NO tools passed.
 *  The model is told, in the strongest terms the format allows, that it may only
 *  re-word — and then the guard enforces it, because a prompt is advice. */
export function buildAdvisoryPrompt(
  mode: 'B' | 'C',
  audience: 'leadership' | 'board',
  specs: readonly AdvisorySegmentSpec[],
): unknown[] {
  const board = audience === 'board'
  const system =
    'You are Penny, a warm, concise co-pilot for an independent school. You are given PRE-COMPUTED ' +
    'accreditation-readiness segments as JSON. You rewrite each segment in clearer, warmer prose. ' +
    'You never add, drop, merge, reorder or renumber segments, and you never invent, recompute, ' +
    'round, convert or restate any figure that is not already present verbatim in that segment.\n\n' +
    'STRICT RULES:\n' +
    '- Use every figure EXACTLY as written in that segment, in digits. Do NOT do arithmetic. Do NOT ' +
    'mention any number that is not present verbatim in the SAME segment you are rewriting.\n' +
    '- Never state or imply a probability, a percentage chance, a likelihood or whether an ' +
    'accreditation visit will be passed. That data does not exist.\n' +
    '- Never name a person, a staff member, a student or a document filename.\n' +
    '- At most 2 short sentences per segment.\n' +
    '- Return ONLY the segments you were given, each keyed by its exact "id". Order is fixed by the server.\n' +
    (board
      ? '- This is the BOARD audience: use advisory, awareness language ("worth reviewing with leadership", ' +
        '"the board should be aware") — NEVER an operator imperative like "Fix", "Reconcile", "Go", ' +
        '"Import", "Update", "Assign".\n'
      : '- This is the LEADERSHIP audience: plain, direct, operational language is fine.\n') +
    '\nReturn STRICT JSON only (no markdown, no code fences), exactly this shape:\n' +
    '{"segments":[{"id":"<given id>","text":"..."}]}'

  const userPayload = {
    mode,
    audience,
    segments: specs.map((s) => ({ id: s.id, text: s.templateText, voice: s.voice ?? null })),
  }

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content:
        'Rewrite each of these segments clearly and briefly. Reply with STRICT JSON only.\n\n' +
        JSON.stringify(userPayload),
    },
  ]
}
