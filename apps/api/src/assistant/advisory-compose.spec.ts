import { describe, expect, it } from 'vitest'
import {
  CANNOT_ATTRIBUTE,
  buildAdvisoryPrompt,
  composeAdvisory,
  parseAdvisoryJson,
  templateComposition,
  type AdvisorySegmentSpec,
} from './advisory-compose.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase J — THE ADVERSARIAL GUARD SPECS for the shared advisory composer.
//
// Acceptance 4: "a number not present in a tool result cannot survive the segment
// guard". These are the composer-level proofs (MB-2 / MC-1); the ORIGINATION half —
// a cause, a document name or a peer claim carrying no digits at all — is proved in
// AX-5 below and in value-safety.spec.ts. Every model reply below is written the way a real failure looks — fluent,
// confident, internally consistent, and carrying one figure nobody computed.
//
// RED PROOFS (run):
//  AX-1 — widen the allowlist to the union of all segments' sourceStrings
//         → "expected 'template' to be 'llm'" inverts: the cross-segment leak passes
//  AX-2 — return the candidate unconditionally from guardSegment
//         → "expected 'Readiness is 91% …' not to contain '91%'"
//  AX-3 — append unknown-id candidates instead of dropping them
//         → "expected length 2 to be 2" becomes 3
// ─────────────────────────────────────────────────────────────────────────────

const SPECS: AdvisorySegmentSpec[] = [
  {
    id: 'stands',
    templateText: 'Readiness stands at 62% documented and 48% defensible.',
    sourceStrings: ['Readiness stands at 62% documented and 48% defensible.'],
  },
  {
    id: 'moved',
    templateText: 'Since the last board marker, readiness moved by 7 points.',
    sourceStrings: ['Since the last board marker, readiness moved by 7 points.'],
  },
  {
    id: 'board',
    templateText: '3 standards have no evidence on file.',
    sourceStrings: ['3 standards have no evidence on file.'],
    voice: 'governance',
  },
]

describe('templateComposition — the deterministic floor', () => {
  it('is every templateText, all template-sourced, fully counted', () => {
    const c = templateComposition('C', SPECS)
    expect(c.mode).toBe('C')
    expect(c.source).toBe('template')
    expect(c.templateFallbackCount).toBe(3)
    expect(c.segments.map((s) => s.text)).toEqual(SPECS.map((s) => s.templateText))
    expect(c.segments.every((s) => s.source === 'template')).toBe(true)
  })

  it('an empty spec list is an empty, template-sourced composition', () => {
    expect(templateComposition('B', [])).toEqual({
      mode: 'B',
      segments: [],
      templateFallbackCount: 0,
      source: 'template',
      modelCalled: false,
    })
  })
})

describe('composeAdvisory — a fabricated figure cannot survive', () => {
  it('drops ONLY the segment carrying the invented number, and keeps the clean ones', () => {
    const c = composeAdvisory('C', SPECS, {
      segments: [
        { id: 'stands', text: 'Readiness sits at 62% documented, 48% defensible.' },
        // The failure a model actually produces: a confident, plausible, uncomputed figure.
        { id: 'moved', text: 'Readiness climbed 7 points, putting you at 91% of the way there.' },
        { id: 'board', text: 'The board should be aware that 3 standards carry no evidence.' },
      ],
    })
    expect(c.segments[0].source).toBe('llm')
    expect(c.segments[1].source).toBe('template')
    expect(c.segments[1].text).toBe(SPECS[1].templateText)
    expect(c.segments[1].text).not.toContain('91%')
    expect(c.segments[2].source).toBe('llm')
    expect(c.templateFallbackCount).toBe(1)
    // One survivor is enough to call the composition llm-sourced — and the count is
    // what makes "the model was ignored once" visible rather than silent.
    expect(c.source).toBe('llm')
  })

  it('a figure legitimate in ANOTHER segment is still fabricated in THIS one', () => {
    // The allowlist is per-segment by construction. Taking the union would let "62%",
    // computed for segment one, be spoken as if it described segment two. This is the
    // single most seductive widening in the whole design, so it gets its own proof.
    const c = composeAdvisory('C', SPECS, {
      segments: [{ id: 'moved', text: 'Since the marker, readiness moved to 62%.' }],
    })
    expect(c.segments[1].source).toBe('template')
    expect(c.segments[1].text).not.toContain('62%')
  })

  it('every segment failing ⇒ the composition reports itself as template', () => {
    const c = composeAdvisory('C', SPECS, {
      segments: SPECS.map((s) => ({ id: s.id, text: 'Everything is at 99% and rising.' })),
    })
    expect(c.templateFallbackCount).toBe(3)
    expect(c.source).toBe('template')
    expect(c.segments.map((s) => s.text)).toEqual(SPECS.map((s) => s.templateText))
  })
})

describe('composeAdvisory — the segment set is server-owned', () => {
  it('null parsed ⇒ the deterministic composition', () => {
    expect(composeAdvisory('B', SPECS, null)).toEqual(templateComposition('B', SPECS))
  })

  it('an INVENTED segment id is dropped, never appended', () => {
    // An invented segment is an invented finding. It does not get a slot.
    const c = composeAdvisory('C', SPECS, {
      segments: [
        { id: 'stands', text: 'Readiness sits at 62% documented, 48% defensible.' },
        { id: 'URGENT-NEW-RISK', text: 'Your accreditation is in serious jeopardy.' },
      ],
    })
    expect(c.segments).toHaveLength(SPECS.length)
    expect(c.segments.map((s) => s.id)).toEqual(['stands', 'moved', 'board'])
    expect(c.segments.some((s) => s.text.includes('jeopardy'))).toBe(false)
  })

  it('a SKIPPED segment gets its template, and order is never the model’s', () => {
    const c = composeAdvisory('C', SPECS, {
      segments: [{ id: 'board', text: 'The board should be aware that 3 standards carry no evidence.' }],
    })
    expect(c.segments.map((s) => s.id)).toEqual(['stands', 'moved', 'board'])
    expect(c.segments[0].source).toBe('template')
    expect(c.segments[1].source).toBe('template')
    expect(c.templateFallbackCount).toBe(2)
  })

  it('a duplicated id keeps the FIRST candidate — no re-rolling a failed segment', () => {
    const c = composeAdvisory('C', SPECS, {
      segments: [
        { id: 'stands', text: 'Readiness is 62% documented and 48% defensible.' },
        { id: 'stands', text: 'Actually readiness is 88%.' },
      ],
    })
    expect(c.segments[0].text).toBe('Readiness is 62% documented and 48% defensible.')
  })

  it('a governance segment opening with an operator imperative falls back', () => {
    const c = composeAdvisory('C', SPECS, {
      segments: [{ id: 'board', text: 'Fix the 3 standards with no evidence before the visit.' }],
    })
    expect(c.segments[2].source).toBe('template')
    expect(c.segments[2].text).not.toMatch(/^Fix/)
  })
})

describe('parseAdvisoryJson — tolerant, and null on garbage', () => {
  it('strips fences and surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"segments":[{"id":"a","text":"b"}]}\n```\nHope that helps.'
    expect(parseAdvisoryJson(raw)).toEqual({ segments: [{ id: 'a', text: 'b' }] })
  })

  it('returns null on hard garbage', () => {
    expect(parseAdvisoryJson('the model refused')).toBeNull()
    expect(parseAdvisoryJson('{not valid json at all')).toBeNull()
  })

  it('drops malformed members rather than admitting them', () => {
    const p = parseAdvisoryJson('{"segments":[{"id":"a","text":"b"},{"id":5},{"text":"orphan"}]}')
    expect(p).toEqual({ segments: [{ id: 'a', text: 'b' }] })
  })

  it('a reply with no segments key parses to an empty list ⇒ full template', () => {
    const p = parseAdvisoryJson('{"answer":"I think you will pass"}')
    expect(p).toEqual({ segments: [] })
    expect(composeAdvisory('C', SPECS, p).source).toBe('template')
  })
})

describe('buildAdvisoryPrompt — server-owned, no tools, no outcome talk', () => {
  it('sends only the server segment text and forbids the things the guard cannot see', () => {
    const msgs = buildAdvisoryPrompt('C', 'board', SPECS) as { role: string; content: string }[]
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    // The guard catches invented NUMBERS. It cannot catch an invented probability
    // stated in words, or a person's name — so those are prompt rules, and the tools
    // never hand the model a name to use in the first place (§4).
    expect(msgs[0].content).toMatch(/probability/i)
    expect(msgs[0].content).toMatch(/never name a person/i)
    // The board audience gets the imperative rule that `voice:'governance'` enforces.
    expect(msgs[0].content).toMatch(/NEVER an operator imperative/)
    // The user message carries the server's own text and nothing else.
    for (const s of SPECS) expect(msgs[1].content).toContain(s.templateText)
  })

  it('the leadership audience does not get the board clause', () => {
    const msgs = buildAdvisoryPrompt('B', 'leadership', SPECS) as { content: string }[]
    expect(msgs[0].content).not.toMatch(/NEVER an operator imperative/)
  })
})

describe('CANNOT_ATTRIBUTE — the frozen sentence', () => {
  it('names no cause and carries no figure', () => {
    // The whole point: when nothing is attributable we say so. A sentence with a
    // number in it would invite the model to elaborate on the number.
    expect(CANNOT_ATTRIBUTE).toContain('can’t attribute the change')
    expect(CANNOT_ATTRIBUTE).not.toMatch(/\d/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AX-5 — THE ORIGINATION SCREEN, THROUGH THE REAL COMPOSER.
//
// THE DEFECT THIS PINS. `guardSegment` inspected NUMBERS and (for a board voice) a
// first-word imperative, and nothing else. An LLM-originated CAUSE, DOCUMENT NAME or
// PEER FINDING containing no digits passed untouched and rendered as `source:'llm'`.
// Mode B's ENTIRE PURPOSE is attribution of cause, and cause was the one thing the
// guard did not check — THE ONE RULE ("the LLM never originates a finding, a number,
// a document name, or a cause") was enforced for numbers only.
//
// EVERY CASE BELOW WAS SEEN GREEN-WHEN-BROKEN. Reverting `sources:` in
// composeAdvisory's guardSegment call makes all four assertions read
// `expected 'template' to be 'llm'` inverted — i.e. the fabrications ship.
// ─────────────────────────────────────────────────────────────────────────────

describe('AX-5 — a fabrication with no digits in it does not survive', () => {
  const attributionSpec: AdvisorySegmentSpec[] = [
    {
      id: 'attribution',
      templateText: 'COG-2.3 moved from 2 to 3 on the rubric.',
      sourceStrings: ['COG-2.3 moved from 2 to 3 on the rubric.'],
    },
  ]

  const run = (text: string) =>
    composeAdvisory('B', attributionSpec, { segments: [{ id: 'attribution', text }] })

  it('an invented CAUSE falls back to the template', () => {
    const out = run(
      'COG-2.3 moved from 2 to 3 on the rubric, largely because staff turnover in the business ' +
        'office eased over the summer and the new head prioritised documentation.',
    )
    expect(out.segments[0].source).toBe('template')
    expect(out.segments[0].text).toBe(attributionSpec[0].templateText)
    expect(out.templateFallbackCount).toBe(1)
  })

  it('an invented DOCUMENT NAME falls back to the template', () => {
    const out = run(
      'COG-2.3 moved from 2 to 3 on the rubric; the Board Governance Handbook and the Annual ' +
        'Safety Audit are now on file.',
    )
    expect(out.segments[0].source).toBe('template')
  })

  it('an invented PEER FINDING falls back to the template', () => {
    const out = run(
      'COG-2.3 moved from 2 to 3 on the rubric, which is the weakest position of any school in ' +
        'the diocese.',
    )
    expect(out.segments[0].source).toBe('template')
  })

  it('a SPELLED-OUT count above twelve falls back to the template', () => {
    // The numeric allowlist canonicalises spelled numbers only to twelve, so
    // "fifteen" and "forty" carried no token at all and passed the figure check.
    const specs: AdvisorySegmentSpec[] = [
      {
        id: 'standing',
        templateText:
          'Readiness stands at 62% documented and 41% defensible across 48 standards, of which ' +
          '30 are scored and 22 carry evidence.',
        sourceStrings: [
          'Readiness stands at 62% documented and 41% defensible across 48 standards, of which ' +
            '30 are scored and 22 carry evidence.',
        ],
      },
    ]
    const out = composeAdvisory('C', specs, {
      segments: [
        {
          id: 'standing',
          text:
            'Readiness stands at 62% documented and 41% defensible across 48 standards; fifteen ' +
            'standards still have no evidence at all, and forty domains are unrated.',
        },
      ],
    })
    expect(out.segments[0].source).toBe('template')
    expect(out.segments[0].text).not.toMatch(/fifteen|forty/)
  })

  it('a faithful rewording of the SAME words still passes — the screen is not a veto', () => {
    // The guard's default is the template, but it must not be one in practice: a
    // screen that rejects everything is indistinguishable from having no LLM, and
    // nobody would notice it breaking.
    const out = run('On the rubric, COG-2.3 moved from 2 to 3.')
    expect(out.segments[0].source).toBe('llm')
    expect(out.templateFallbackCount).toBe(0)
  })
})

describe('AX-6 — `modelCalled` says whether a model was asked at all', () => {
  // `source:'template'` merges two different facts: "the model spoke and every
  // sentence was thrown away" and "nothing was asked". The advisory card renders a
  // provenance claim from this, so they cannot be merged.
  it('templateComposition defaults to modelCalled:false', () => {
    expect(templateComposition('C', SPECS).modelCalled).toBe(false)
    expect(templateComposition('C', SPECS, true).modelCalled).toBe(true)
  })

  it('composeAdvisory over a parsed reply is modelCalled:true even when nothing survives', () => {
    const out = composeAdvisory('C', SPECS, {
      segments: SPECS.map((s) => ({ id: s.id, text: 'Readiness is 91% and rising fast.' })),
    })
    expect(out.source).toBe('template')
    expect(out.templateFallbackCount).toBe(SPECS.length)
    expect(out.modelCalled).toBe(true)
  })

  it('a null parse is modelCalled:false through composeAdvisory', () => {
    expect(composeAdvisory('B', SPECS, null).modelCalled).toBe(false)
  })
})
