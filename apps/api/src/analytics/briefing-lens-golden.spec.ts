import { describe, expect, it } from 'vitest'
import { applyLens, COMPLIANCE_ORDER, SOURCE_RANK, type Lens } from './briefing-lens.js'
import { EARLY_WARNING_BRIEFABLE_RULE_IDS, type AttentionItem } from './briefing.service.js'
import golden from './__fixtures__/lens-preexisting.golden.json' with { type: 'json' }

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — ACCEPTANCE CRITERION 4, SECOND HALF:
//
//   "the accountant-lens snapshot for all pre-existing ids stays byte-identical."
//
// THE FIXTURE WAS GENERATED ON THE PRE-PHASE-E CODE AND COMMITTED BEFORE THE FIRST
// LENS EDIT. That ordering is the whole proof. A golden regenerated after the
// change proves that the change agrees with itself, which is not a claim anybody
// needs.
//
// It contains EVERY pre-existing item id — every METRIC_KEYS metric item and every
// entry in the pre-Phase-E COMPLIANCE_ORDER — in three severity arrangements:
//
//   mixed        severities round-robin, so cross-source pairs are exercised at
//                every severity
//   allWarn      MAXIMUM tie pressure: every item ties on severity, so the source
//                weight and the COMPLIANCE_ORDER index decide the whole array
//   allCritical  the same, at the other end of the severity ladder
//
// `allWarn` is the case that matters. If the fractional weight insertion or the
// COMPLIANCE_ORDER block insertion had perturbed ANY pre-existing pair, that array
// would move.
// ─────────────────────────────────────────────────────────────────────────────

const LENSES: Lens[] = ['owner', 'accountant', 'viewer']
const g = golden as unknown as {
  inputs: Record<string, AttentionItem[]>
  outputs: Record<string, Record<string, AttentionItem[]>>
}

describe('briefing-lens — the pre-Phase-E golden is BYTE-IDENTICAL', () => {
  it('the fixture covers every pre-existing id', () => {
    // A guard on the guard: a truncated fixture would pass every assertion below.
    expect(Object.keys(g.inputs).sort()).toEqual(['allCritical', 'allWarn', 'mixed'])
    expect(g.inputs.mixed.length).toBeGreaterThan(40)
  })

  for (const variant of ['mixed', 'allWarn', 'allCritical']) {
    for (const lens of LENSES) {
      it(`${variant} / ${lens} lens re-runs to the committed golden`, () => {
        expect(applyLens(g.inputs[variant], lens)).toEqual(g.outputs[variant][lens])
      })
    }
  }

  it('the ORDER of ids is unchanged, id for id, on the tie-pressure fixture', () => {
    for (const lens of LENSES) {
      expect(applyLens(g.inputs.allWarn, lens).map((i) => i.id)).toEqual(
        g.outputs.allWarn[lens].map((i) => i.id),
      )
    }
  })

  it('no pre-existing item gained, lost or changed a VALUE-BEARING field', () => {
    for (const lens of LENSES) {
      const after = applyLens(g.inputs.mixed, lens)
      const before = g.outputs.mixed[lens]
      expect(after).toHaveLength(before.length)
      after.forEach((a, i) => {
        const b = before[i]
        for (const k of ['id', 'severity', 'source', 'metricKey', 'value', 'title', 'link', 'dueDate', 'why', 'voice'] as const) {
          expect(a[k], `${lens}/${a.id}/${k}`).toEqual(b[k])
        }
      })
    }
  })
})

describe('briefing-lens — the Phase-E additions are ADDITIVE', () => {
  it('every pre-existing SOURCE_RANK value is unchanged', () => {
    // The pre-Phase-E table, re-typed literally so a silent renumber fails here.
    expect({ ...SOURCE_RANK, earlywarning: undefined }).toMatchObject({
      data: 0,
      compliance: 1,
      enrollment: 2,
      cash: 3,
      governance: 4,
      accreditation: 5,
      facilities: 6,
      advancement: 7,
      strategy: 8,
      hr: 9,
      planning: 10,
      workflow: 11,
      metric: 12,
    })
    expect(SOURCE_RANK.earlywarning).toBe(13)
  })

  it('the early-warning COMPLIANCE_ORDER ids sit as ONE contiguous block after accreditation', () => {
    // Eleven at Phase E; AIC Phase F appended three to the SAME block and AIC
    // Phase K appended two more (neither opened a second one). The assertion that
    // matters — CONTIGUITY, and the block's two neighbours — is what is pinned.
    const EARLY_WARNING_BLOCK = 16
    const start = COMPLIANCE_ORDER.indexOf('earlywarning:acc-assurance-gap')
    expect(COMPLIANCE_ORDER[start - 1]).toBe('accreditation:review-approaching')
    const block = COMPLIANCE_ORDER.slice(start, start + EARLY_WARNING_BLOCK)
    expect(block.every((id) => id.startsWith('earlywarning:'))).toBe(true)
    expect(COMPLIANCE_ORDER[start + EARLY_WARNING_BLOCK]).toBe('facilities:maintenance-backlog')
    // No stragglers elsewhere in the array.
    expect(COMPLIANCE_ORDER.filter((id) => id.startsWith('earlywarning:'))).toHaveLength(
      EARLY_WARNING_BLOCK,
    )
  })

  it('every BRIEFABLE rule id has a COMPLIANCE_ORDER entry', () => {
    // The defect this pins: a briefable rule with no entry gets index -1 from the
    // comparator and sorts AHEAD of the whole curated block — the arbitrary ordering
    // the block exists to prevent. Derived from the briefable list, so a Phase-G
    // rule that forgets its entry fails HERE rather than reordering a briefing.
    for (const ruleId of EARLY_WARNING_BRIEFABLE_RULE_IDS) {
      expect(COMPLIANCE_ORDER, ruleId).toContain(`earlywarning:${ruleId.toLowerCase()}`)
    }
  })

  it('the RELATIVE order of every pre-existing COMPLIANCE_ORDER pair is preserved', () => {
    // Derived from the golden's own input ids rather than re-typed: the fixture is
    // the record of what existed before.
    const preExisting = g.inputs.mixed
      .map((i) => i.id)
      .filter((id) => COMPLIANCE_ORDER.includes(id) && !id.startsWith('earlywarning:'))
    const idx = preExisting.map((id) => COMPLIANCE_ORDER.indexOf(id))
    for (let i = 1; i < idx.length; i += 1) expect(idx[i]).toBeGreaterThan(idx[i - 1])
  })
})
