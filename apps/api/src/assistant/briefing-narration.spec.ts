import { describe, expect, it } from 'vitest'
import {
  allowedItemTokens,
  assembleSegments,
  buildTemplateNarration,
  hashBriefingItems,
  parseNarrationJson,
  validateSegmentNumbers,
  violatesGovernanceVoice,
  type NarrationPayload,
  type NarrationSourceItem,
  type ParsedNarration,
} from './narration.compose.js'

// ─────────────────────────────────────────────────────────────────────────────
// PURE narration composer — the value-safety guardrails. No Nest / no I/O boot;
// every function here is framework-free. Covers the invariants the reviewers and
// the e2e re-check against: the LLM contributes phrasing ONLY.
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_MARGIN: NarrationSourceItem = {
  id: 'metric:operating_margin',
  severity: 'critical',
  source: 'metric',
  title: 'Operating margin is in the risk band',
  why: 'Operating margin is -2.0%, below the 0% risk floor (healthy schools target 5% or better).',
  link: '/analytics?metric=operating_margin',
  dueDate: null,
  voice: 'decision',
}

const ITEM_POLICY: NarrationSourceItem = {
  id: 'governance:policies-overdue',
  severity: 'warn',
  source: 'governance',
  title: '2 policies are overdue for review',
  why: 'Two board policies have passed their scheduled review date. Review and record them in the policy register.',
  link: '/governance',
  dueDate: '2026-07-15',
  voice: 'governance',
}

function schoolPayload(items: NarrationSourceItem[], overrides: Partial<NarrationPayload> = {}): NarrationPayload {
  const critical = items.filter((i) => i.severity === 'critical').length
  const warn = items.filter((i) => i.severity === 'warn').length
  const info = items.filter((i) => i.severity === 'info').length
  return {
    scope: 'school',
    lens: 'owner',
    lensLabel: 'Leadership view',
    summary: { total: items.length, critical, warn, info },
    items,
    omittedItemCount: 0,
    ...overrides,
  }
}

describe('narration.compose — numeric guard', () => {
  it('rejects a segment whose figure is not in the item’s server strings', () => {
    const allow = allowedItemTokens(ITEM_MARGIN)
    // -2.0% and 0% and 5% are all present in the item.
    expect(validateSegmentNumbers('Margin slipped to -2.0%, under the 5% target.', allow)).toBe(true)
    // $300,000 was never in the item → injected/hallucinated figure.
    expect(validateSegmentNumbers('Margin is off by $300,000 this year.', allow)).toBe(false)
  })

  it('assembleSegments swaps an injected wrong figure back to the template text', () => {
    const payload = schoolPayload([ITEM_MARGIN])
    const parsed: ParsedNarration = {
      opening: 'Good morning. 1 thing needs a decision today — 1 critical, 0 to watch.',
      items: [{ id: 'metric:operating_margin', text: 'Your margin is down $300,000 — a big miss.' }],
      closing: 'Want me to open it?',
    }
    const segs = assembleSegments(payload, 'morning', parsed)
    const item = segs.find((s) => s.kind === 'item')!
    // Falls back to the value-safe template ("title. why"), NOT the $300,000 hallucination.
    expect(item.text).toContain(ITEM_MARGIN.title)
    expect(item.text).toContain(ITEM_MARGIN.why)
    expect(item.text).not.toContain('300,000')
  })

  it('rejects a sentiment SIGN-FLIP: -2.0% narrated as +2.0% (B1)', () => {
    const allow = allowedItemTokens(ITEM_MARGIN) // {-2%, 0%, 5%}
    // A correct restatement keeps the sign.
    expect(validateSegmentNumbers('Margin is -2.0%, below the 5% mark.', allow)).toBe(true)
    // Dropping the sign turns a risk-band loss into an apparent gain — must be caught.
    expect(validateSegmentNumbers('Margin improved to 2.0%, above the 5% target.', allow)).toBe(false)
    // End-to-end: the flipped segment is swapped for the (accurate, negative) template.
    const payload = schoolPayload([ITEM_MARGIN])
    const parsed: ParsedNarration = {
      opening: '',
      closing: '',
      items: [{ id: 'metric:operating_margin', text: 'Great news — margin is up 2.0%, comfortably above the 5% target.' }],
    }
    const item = assembleSegments(payload, 'morning', parsed).find((s) => s.kind === 'item')!
    expect(item.text).toContain(ITEM_MARGIN.why)
    expect(item.text).not.toContain('up 2.0%')
  })

  it('rejects a UNIT swap: a bare count narrated with $ or a scale word (B1)', () => {
    const cashItem: NarrationSourceItem = {
      id: 'metric:days_cash',
      severity: 'warn',
      source: 'metric',
      title: 'Days Cash on Hand is on watch',
      why: 'Days Cash on Hand is 5 days, under the 60 days healthy target.',
      link: '/analytics',
      dueDate: null,
      voice: 'decision',
    }
    const allow = allowedItemTokens(cashItem) // {5, 60}
    expect(validateSegmentNumbers('Only about 5 days of cushion left.', allow)).toBe(true)
    expect(validateSegmentNumbers('Only about $5k of runway left.', allow)).toBe(false)
    expect(validateSegmentNumbers('Only about 5 million dollars of runway.', allow)).toBe(false)
  })

  it('keeps a segment whose figures all come from the item', () => {
    const payload = schoolPayload([ITEM_MARGIN])
    const parsed: ParsedNarration = {
      opening: '',
      items: [{ id: 'metric:operating_margin', text: 'Operating margin sits at -2.0%, under the 5% healthy mark.' }],
      closing: '',
    }
    const segs = assembleSegments(payload, 'morning', parsed)
    const item = segs.find((s) => s.kind === 'item')!
    expect(item.text).toBe('Operating margin sits at -2.0%, under the 5% healthy mark.')
  })
})

describe('narration.compose — structural enforcement', () => {
  it('drops an invented item id (never appears as a segment)', () => {
    const payload = schoolPayload([ITEM_MARGIN])
    const parsed: ParsedNarration = {
      opening: '',
      items: [
        { id: 'metric:operating_margin', text: 'Operating margin is -2.0%.' },
        { id: 'metric:INVENTED', text: 'A totally made-up crisis.' },
      ],
      closing: '',
    }
    const segs = assembleSegments(payload, 'morning', parsed)
    const itemSegs = segs.filter((s) => s.kind === 'item')
    expect(itemSegs).toHaveLength(1)
    expect(itemSegs[0].kind === 'item' && itemSegs[0].itemId).toBe('metric:operating_margin')
    expect(segs.some((s) => s.text.includes('made-up'))).toBe(false)
  })

  it('template-fills a server item the LLM skipped', () => {
    const payload = schoolPayload([ITEM_MARGIN, ITEM_POLICY])
    const parsed: ParsedNarration = {
      opening: '',
      items: [{ id: 'metric:operating_margin', text: 'Operating margin is -2.0%.' }],
      closing: '',
    }
    const segs = assembleSegments(payload, 'morning', parsed)
    const policy = segs.find((s) => s.kind === 'item' && s.itemId === 'governance:policies-overdue')!
    expect(policy.text).toContain(ITEM_POLICY.title)
    expect(policy.text).toContain(ITEM_POLICY.why)
    // dueDate rendered into the template ("Jul 15, 2026").
    expect(policy.text).toContain('Jul 15, 2026')
  })
})

describe('narration.compose — governance voice guard', () => {
  it('flags an imperative opening', () => {
    expect(violatesGovernanceVoice('Reconcile the scholarship funds now.')).toBe(true)
    expect(violatesGovernanceVoice('Worth reviewing with leadership before the next meeting.')).toBe(false)
  })

  it('rejects an imperative governance segment and uses the advisory template', () => {
    const payload = schoolPayload([ITEM_POLICY])
    const parsed: ParsedNarration = {
      opening: '',
      items: [{ id: 'governance:policies-overdue', text: 'Reconcile the policy register immediately.' }],
      closing: '',
    }
    const segs = assembleSegments(payload, 'morning', parsed)
    const item = segs.find((s) => s.kind === 'item')!
    expect(item.text).not.toContain('Reconcile')
    expect(item.text).toContain(ITEM_POLICY.why)
  })
})

describe('narration.compose — deterministic template', () => {
  it('template narration is composed only of verbatim server strings', () => {
    const payload = schoolPayload([ITEM_MARGIN, ITEM_POLICY])
    const segs = buildTemplateNarration(payload, 'morning')
    const opening = segs.find((s) => s.kind === 'opening')!
    expect(opening.text).toBe('Good morning. 2 things need a decision today — 1 critical, 1 to watch.')
    for (const item of [ITEM_MARGIN, ITEM_POLICY]) {
      const seg = segs.find((s) => s.kind === 'item' && s.itemId === item.id)!
      expect(seg.text).toContain(item.title)
      expect(seg.text).toContain(item.why)
    }
    // Owner/decision closing, no board wording.
    expect(segs.find((s) => s.kind === 'closing')!.text).toContain('turn one into a task')
  })

  it('zero-items template is the all-clear brief (no item segments)', () => {
    const payload = schoolPayload([])
    const segs = buildTemplateNarration(payload, 'afternoon')
    expect(segs.filter((s) => s.kind === 'item')).toHaveLength(0)
    expect(segs.find((s) => s.kind === 'opening')!.text).toBe(
      "Good afternoon. You're all caught up — nothing needs a decision today.",
    )
    expect(segs.find((s) => s.kind === 'closing')).toBeTruthy()
  })

  it('viewer (board) template uses advisory opening + governance closing', () => {
    const payload = schoolPayload([ITEM_POLICY], { lens: 'viewer', lensLabel: 'Board view' })
    const segs = buildTemplateNarration(payload, 'morning')
    expect(segs.find((s) => s.kind === 'opening')!.text).toContain('the board should be aware')
    expect(segs.find((s) => s.kind === 'closing')!.text).toContain('awareness ahead of the next meeting')
  })

  it('viewer lens NEVER trusts the LLM closing — advisory template only (S2)', () => {
    const payload = schoolPayload([ITEM_POLICY], { lens: 'viewer', lensLabel: 'Board view' })
    const parsed: ParsedNarration = {
      opening: '',
      items: [],
      // A perfectly value-safe-numeric closing that nonetheless offers a WRITE action.
      closing: 'Want me to turn one of these into a task for you?',
    }
    const closing = assembleSegments(payload, 'morning', parsed).find((s) => s.kind === 'closing')!
    expect(closing.text).not.toContain('task')
    expect(closing.text).toContain('awareness ahead of the next meeting')
  })
})

describe('narration.compose — org attribution + not-reported aside', () => {
  it('prepends the school name to an org item that omits it, and emits the not-reported aside', () => {
    const orgItem: NarrationSourceItem = { ...ITEM_MARGIN, id: 's1:metric:operating_margin', schoolName: "St. Anne's" }
    const payload: NarrationPayload = {
      scope: 'org',
      lens: 'owner',
      lensLabel: 'Leadership view',
      summary: { total: 1, critical: 1, warn: 0, info: 0 },
      items: [orgItem],
      orgMeta: { schoolsReporting: 1, schoolCount: 3, notReported: ['Holy Cross', 'Sacred Heart'] },
      omittedItemCount: 0,
    }
    const parsed: ParsedNarration = {
      opening: '',
      items: [{ id: 's1:metric:operating_margin', text: 'Operating margin is -2.0%, under the 5% mark.' }],
      closing: '',
    }
    const segs = assembleSegments(payload, 'morning', parsed)
    const item = segs.find((s) => s.kind === 'item')!
    expect(item.text.startsWith("At St. Anne's:")).toBe(true)
    const aside = segs.find((s) => s.kind === 'aside')!
    expect(aside.text).toContain('Holy Cross and Sacred Heart')
  })

  it('allows the digits inside an org school name (e.g. "PS 121") without falling to template', () => {
    const orgItem: NarrationSourceItem = { ...ITEM_MARGIN, id: 's7:metric:operating_margin', schoolName: 'PS 121' }
    const payload: NarrationPayload = {
      scope: 'org',
      lens: 'owner',
      lensLabel: 'Leadership view',
      summary: { total: 1, critical: 1, warn: 0, info: 0 },
      items: [orgItem],
      orgMeta: { schoolsReporting: 1, schoolCount: 1, notReported: [] },
      omittedItemCount: 0,
    }
    const parsed: ParsedNarration = {
      opening: '',
      closing: '',
      items: [{ id: 's7:metric:operating_margin', text: 'At PS 121, operating margin is -2.0%, under the 5% mark.' }],
    }
    const item = assembleSegments(payload, 'morning', parsed).find((s) => s.kind === 'item')!
    // The "121" from the school name doesn't trip the numeric guard → LLM text kept.
    expect(item.text).toBe('At PS 121, operating margin is -2.0%, under the 5% mark.')
  })
})

describe('narration.compose — content hash', () => {
  it('is stable for the same items and invalidates when an item changes', () => {
    const items = [ITEM_MARGIN, ITEM_POLICY]
    const summary = { total: 2, critical: 1, warn: 1, info: 0 }
    const a = hashBriefingItems(items, summary)
    const b = hashBriefingItems([{ ...ITEM_MARGIN }, { ...ITEM_POLICY }], { ...summary })
    expect(a).toBe(b)
    const changed = hashBriefingItems(
      [{ ...ITEM_MARGIN, why: ITEM_MARGIN.why.replace('-2.0%', '-3.5%') }, ITEM_POLICY],
      summary,
    )
    expect(changed).not.toBe(a)
  })
})

describe('narration.compose — tolerant JSON parse', () => {
  it('strips code fences and surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"opening":"hi","items":[{"id":"x","text":"y"}],"closing":"bye"}\n```\nHope that helps.'
    const parsed = parseNarrationJson(raw)
    expect(parsed).toEqual({ opening: 'hi', items: [{ id: 'x', text: 'y' }], closing: 'bye' })
  })

  it('returns null on hard garbage', () => {
    expect(parseNarrationJson('the model refused to answer')).toBeNull()
    expect(parseNarrationJson('{not valid json at all')).toBeNull()
  })
})
