import { describe, expect, it } from 'vitest'
import {
  CURRENCY_LABEL,
  CURRENCY_RANK,
  REQUIREMENT_TAGS,
  SOURCE_REGISTERS,
  computeArtifactCurrency,
  computeEvidenceHealth,
  computeRequirementCurrency,
  expiringLeadDaysFor,
  isRequirementTag,
  isSourceRegister,
  verifiedPct,
  verifiedPctCurrent,
  type ArtifactInput,
  type RequirementInput,
} from '../src/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — the currency engine.
//
// The four defects this file exists to PIN:
//   • an undated artifact must be `unknown` — never `current` (false confidence)
//     and never `stale` (a fabricated accusation) — and must contribute to
//     NEITHER side of the health ratio;
//   • a non-platform requirement must stay `not_tracked` even when the school
//     has attached a dated, in-window copy;
//   • a source_interval requirement must delegate to the OWNING REGISTER, so
//     editing the register's interval moves the state with no second edit;
//   • the new verifiedPct must REDUCE to the Phase-A one, provably.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-01T12:34:56.000Z')

function req(over: Partial<RequirementInput> = {}): RequirementInput {
  return {
    tag: 'financial_audit',
    label: 'Annual external financial audit',
    windowMonths: 18,
    windowKind: 'fixed',
    dataAvailability: 'platform',
    sourceRegister: 'knowledge_document',
    ...over,
  }
}

function art(over: Partial<ArtifactInput> = {}): ArtifactInput {
  return {
    key: 'knowledge_document:doc-1',
    origin: 'auto',
    sourceType: 'knowledge_document',
    sourceRef: 'doc-1',
    label: 'FY27 Audit',
    effectiveDate: null,
    expiresAt: null,
    cycle: null,
    alsoInPortal: null,
    link: '/knowledge',
    autoLinkedNote: 'Auto-linked from your document store — you never entered this.',
    ...over,
  }
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

describe('vocabularies', () => {
  it('REQUIREMENT_TAGS is the 12 frozen evidence tags plus the 9 Phase-C additions', () => {
    expect(REQUIREMENT_TAGS).toHaveLength(21)
    expect(new Set(REQUIREMENT_TAGS).size).toBe(21)
    expect(REQUIREMENT_TAGS.slice(0, 12)).toEqual([
      'governance',
      'board_minutes',
      'policy_manual',
      'financial_audit',
      'budget',
      'strategic_plan',
      'enrollment_data',
      'staff_credentials',
      'safety_plan',
      'survey',
      'fiscal_resources',
      'marketing',
    ])
    expect(isRequirementTag('curriculum_review')).toBe(true)
    expect(isRequirementTag('nope')).toBe(false)
  })

  it('governance_report is deliberately NOT a source register (it has no date of its own)', () => {
    expect(isSourceRegister('governance_report')).toBe(false)
    expect(SOURCE_REGISTERS).toContain('policy')
    expect(SOURCE_REGISTERS).toContain('portal')
  })

  it('CURRENCY_LABEL covers every state with the frozen wording', () => {
    expect(CURRENCY_LABEL).toEqual({
      current: 'Current',
      expiring: 'Expiring',
      stale: 'Out of date',
      missing: 'Missing',
      unknown: 'Date unknown',
      not_tracked: 'Not tracked',
    })
  })
})

// ── ACCEPTANCE 1 — the undated rule ──────────────────────────────────────────

describe('the undated rule', () => {
  it('a fixed requirement whose only artifact has no effectiveDate is unknown, never current/stale', () => {
    const r = computeArtifactCurrency(req(), art(), NOW)
    expect(r.state).toBe('unknown')
    expect(r.basis).toBe('no_anchor')
    expect(r.expiresOn).toBeNull()
    expect(r.daysUntilExpiry).toBeNull()
    expect(r.message).toBe(
      "We found FY27 Audit, but we don't know which period it covers. Tell us and we'll track when it goes stale — we won't guess.",
    )
  })

  it('unknown contributes to NEITHER the numerator nor the denominator of health', () => {
    const undated = computeRequirementCurrency(req(), [art()], NOW)
    const good = computeRequirementCurrency(
      req({ tag: 'budget', label: 'Board-approved operating budget', windowMonths: 12 }),
      [art({ key: 'period_budget:p1', effectiveDate: '2026-06-30' })],
      NOW,
    )
    const health = computeEvidenceHealth([undated, good])
    expect(undated.state).toBe('unknown')
    expect(good.state).toBe('current')
    expect(health.rated).toBe(1)
    expect(health.unknown).toBe(1)
    expect(health.evidenceHealthPct).toBe(100)
    expect(health.basis).toBe('Based on 1 of 2 required artifacts. 1 undated excluded.')
  })

  it('a requirement with no artifact at all is missing, and IS rated', () => {
    const r = computeRequirementCurrency(req(), [], NOW)
    expect(r.state).toBe('missing')
    expect(r.basis).toBe('no_artifact')
    expect(r.message).toBe('No Annual external financial audit on file.')
    expect(r.autoSatisfied).toBe(false)
    expect(computeEvidenceHealth([r]).rated).toBe(1)
  })
})

// ── not_tracked ──────────────────────────────────────────────────────────────

describe('not_tracked — the honest hole', () => {
  it('external says "tracked in your accreditor portal"; intake/integration say "isn\'t tracked yet"', () => {
    const external = computeArtifactCurrency(
      req({
        label: 'Cognia self-assessment / self-study',
        dataAvailability: 'external',
        sourceRegister: 'portal',
        notTrackedReason: "Your accreditor's portal remains the authoritative repository for this.",
      }),
      null,
      NOW,
    )
    expect(external.state).toBe('not_tracked')
    expect(external.basis).toBe('not_tracked')
    expect(external.message).toContain('tracked in your accreditor portal')
    expect(external.message).toBe(
      "Cognia self-assessment / self-study is tracked in your accreditor portal — KYRO doesn't hold it. Your accreditor's portal remains the authoritative repository for this.",
    )

    const intake = computeArtifactCurrency(
      req({ label: 'Staff evaluation cycle records', dataAvailability: 'intake', sourceRegister: 'staff_evaluation_register' }),
      null,
      NOW,
    )
    expect(intake.message).toBe("Staff evaluation cycle records isn't tracked yet.")

    const integration = computeArtifactCurrency(
      req({ label: 'Balanced assessment results', dataAvailability: 'integration', sourceRegister: 'lms' }),
      null,
      NOW,
    )
    expect(integration.message).toContain("isn't tracked yet")
    expect(integration.message).toBe(
      "Balanced assessment results isn't tracked yet — it needs a system KYRO isn't connected to.",
    )
  })

  it('not_tracked SURVIVES an attached, dated, in-window artifact', () => {
    const r = computeRequirementCurrency(
      req({ dataAvailability: 'external', sourceRegister: 'portal' }),
      [art({ origin: 'attached', key: 'evidence:e1', effectiveDate: '2026-07-01', alsoInPortal: true })],
      NOW,
    )
    expect(r.state).toBe('not_tracked')
    // The copy is still listed, with its date and its portal flag.
    expect(r.artifacts).toHaveLength(1)
    expect(r.artifacts[0].effectiveDate).toBe('2026-07-01')
    expect(r.alsoInPortal).toBe(true)
  })

  it('notTracked is excluded from rated, and health is NULL (never 0) when nothing is rated', () => {
    const rows = [
      computeRequirementCurrency(req({ dataAvailability: 'intake', sourceRegister: 'maintenance_item' }), [], NOW),
      computeRequirementCurrency(req({ tag: 'pd_records', dataAvailability: 'intake', sourceRegister: 'professional_development' }), [], NOW),
    ]
    const health = computeEvidenceHealth(rows)
    expect(health.rated).toBe(0)
    expect(health.evidenceHealthPct).toBeNull()
    expect(health.notTracked).toBe(2)
    expect(health.basis).toBe('Based on 0 of 2 required artifacts. 2 not tracked in KYRO excluded.')
  })
})

// ── ACCEPTANCE 3 — cycle delegation ──────────────────────────────────────────

describe('source_interval delegation, verbatim', () => {
  const policyReq = req({
    tag: 'policy_manual',
    label: 'Board policy manual',
    windowKind: 'source_interval',
    windowMonths: null,
    sourceRegister: 'policy',
  })
  const withCycle = (reviewIntervalMonths: number, lastReviewedDate: string | null) =>
    art({
      key: 'policy:p1',
      sourceType: 'policy',
      sourceRef: 'p1',
      label: 'Board Policy Manual (Governance)',
      cycle: { kind: 'policy_review', adoptedDate: '2020-01-01', lastReviewedDate, reviewIntervalMonths, status: 'active' },
    })

  it('maps all four computeReviewStatus outcomes and takes nextReviewDate as expiresOn', () => {
    // current: reviewed a year ago on a 60-month cycle.
    const current = computeArtifactCurrency(policyReq, withCycle(60, '2025-08-01'), NOW)
    expect(current.state).toBe('current')
    expect(current.basis).toBe('source_interval')
    expect(current.expiresOn).toBe('2030-08-01')
    expect(current.message).toBe('Current — next review due 2030-08-01.')

    // due-soon (≤ DUE_SOON_DAYS = 60): reviewed 2025-09-15 on a 12-month cycle.
    const dueSoon = computeArtifactCurrency(policyReq, withCycle(12, '2025-09-15'), NOW)
    expect(dueSoon.state).toBe('expiring')
    expect(dueSoon.expiresOn).toBe('2026-09-15')
    expect(dueSoon.message).toBe('Expires in 45 days, on 2026-09-15.')

    // overdue.
    const overdue = computeArtifactCurrency(policyReq, withCycle(12, '2025-01-01'), NOW)
    expect(overdue.state).toBe('stale')
    expect(overdue.expiresOn).toBe('2026-01-01')
    expect(overdue.message).toBe('Out of date by 212 days — expired 2026-01-01.')

    // unknown: no anchor date at all → the cycle authority declined, and so do we.
    const unknown = computeArtifactCurrency(
      policyReq,
      art({
        key: 'policy:p2',
        label: 'Undated policy',
        cycle: { kind: 'policy_review', adoptedDate: null, lastReviewedDate: null, reviewIntervalMonths: 12, status: 'active' },
      }),
      NOW,
    )
    expect(unknown.state).toBe('unknown')
    expect(unknown.expiresOn).toBeNull()
  })

  it('changing ONLY reviewIntervalMonths flips the state — no other input moves', () => {
    const long = computeArtifactCurrency(policyReq, withCycle(24, '2025-08-01'), NOW)
    const short = computeArtifactCurrency(policyReq, withCycle(6, '2025-08-01'), NOW)
    expect(long.state).toBe('current')
    expect(short.state).toBe('stale')
  })

  it('plan_term: a past endDate is stale; a null endDate is unknown, never current', () => {
    const planReq = req({
      tag: 'strategic_plan',
      label: 'Current strategic plan',
      windowKind: 'source_interval',
      windowMonths: null,
      sourceRegister: 'strategic_plan',
    })
    const past = computeArtifactCurrency(
      planReq,
      art({ key: 'strategic_plan:pl1', label: 'Plan 2020-2025', cycle: { kind: 'plan_term', endDate: '2025-06-30' } }),
      NOW,
    )
    expect(past.state).toBe('stale')
    expect(past.basis).toBe('source_interval')

    const open = computeArtifactCurrency(
      planReq,
      art({ key: 'strategic_plan:pl2', label: 'Plan 2026-2031', cycle: { kind: 'plan_term', endDate: null } }),
      NOW,
    )
    expect(open.state).toBe('unknown')
    expect(open.basis).toBe('no_anchor')
  })
})

// ── The anchor ladder ────────────────────────────────────────────────────────

describe('the anchor-priority ladder', () => {
  it('expiresAt beats a cycle beats an effectiveDate', () => {
    const sourceIntervalReq = req({
      tag: 'policy_manual',
      label: 'Board policy manual',
      windowKind: 'source_interval',
      windowMonths: null,
      sourceRegister: 'policy',
    })
    const cycle = {
      kind: 'policy_review' as const,
      adoptedDate: '2020-01-01',
      lastReviewedDate: '2025-08-01',
      reviewIntervalMonths: 60,
      status: 'active',
    }
    // 1 — explicit expiry wins over a perfectly current cycle.
    const explicit = computeArtifactCurrency(
      sourceIntervalReq,
      art({ key: 'policy:p1', expiresAt: '2025-01-01', cycle, effectiveDate: '2026-07-01' }),
      NOW,
    )
    expect(explicit.basis).toBe('explicit_expiry')
    expect(explicit.state).toBe('stale')

    // 2 — the cycle wins over effectiveDate.
    const viaCycle = computeArtifactCurrency(
      sourceIntervalReq,
      art({ key: 'policy:p1', cycle, effectiveDate: '1999-01-01' }),
      NOW,
    )
    expect(viaCycle.basis).toBe('source_interval')
    expect(viaCycle.state).toBe('current')

    // 3 — a FIXED requirement ignores the cycle and uses effectiveDate + window.
    const viaFixed = computeArtifactCurrency(
      req({ windowMonths: 18 }),
      art({ cycle, effectiveDate: '2026-01-31' }),
      NOW,
    )
    expect(viaFixed.basis).toBe('fixed_window')
    expect(viaFixed.expiresOn).toBe('2027-07-31')
    expect(viaFixed.state).toBe('current')
  })

  it('expiringLeadDaysFor: 6→60, 12→90, 18→90, 24→90, 60→90', () => {
    expect(expiringLeadDaysFor(6)).toBe(60)
    expect(expiringLeadDaysFor(12)).toBe(90)
    expect(expiringLeadDaysFor(18)).toBe(90)
    expect(expiringLeadDaysFor(24)).toBe(90)
    expect(expiringLeadDaysFor(60)).toBe(90)
  })

  it('a 6-month window: day 70 current, day 150 expiring, day 190 stale', () => {
    const six = req({ tag: 'board_minutes', label: 'Approved board minutes', windowMonths: 6, sourceRegister: 'meeting' })
    // effectiveDate + 6mo = expiry; NOW is 2026-08-01.
    const at = (effectiveDate: string) => computeArtifactCurrency(six, art({ effectiveDate }), NOW).state
    expect(at('2026-05-23')).toBe('current') // expiry 2026-11-23 → 114 days out (> 60 lead)
    expect(at('2026-03-04')).toBe('expiring') // expiry 2026-09-04 → 34 days out (<= 60)
    expect(at('2026-01-23')).toBe('stale') // expiry 2026-07-23 → -9 days
  })
})

// ── Ranking across artifacts ─────────────────────────────────────────────────

describe('CURRENCY_RANK ordering across artifacts', () => {
  it('{stale, unknown} → the group reads unknown (the weaker claim, not the worse one)', () => {
    const r = computeRequirementCurrency(
      req(),
      [
        art({ key: 'knowledge_document:old', label: 'FY19 Audit', effectiveDate: '2019-06-30' }),
        art({ key: 'knowledge_document:new', label: 'FY27 Audit' }),
      ],
      NOW,
    )
    expect(r.state).toBe('unknown')
    expect(r.artifacts.map((a) => a.state)).toEqual(['unknown', 'stale'])
    expect(CURRENCY_RANK.unknown).toBeLessThan(CURRENCY_RANK.stale)
  })

  it('{current, stale} → current', () => {
    const r = computeRequirementCurrency(
      req(),
      [
        art({ key: 'knowledge_document:old', effectiveDate: '2019-06-30' }),
        art({ key: 'knowledge_document:new', effectiveDate: '2026-06-30' }),
      ],
      NOW,
    )
    expect(r.state).toBe('current')
  })

  it('attached beats auto on a tie, and drives autoSatisfied', () => {
    const attached = art({ key: 'knowledge_document:doc-1', origin: 'attached', effectiveDate: '2026-06-30' })
    const auto = art({ key: 'knowledge_document:doc-2', origin: 'auto', effectiveDate: '2026-06-30' })
    const r = computeRequirementCurrency(req(), [auto, attached], NOW)
    expect(r.artifacts[0].key).toBe('knowledge_document:doc-1')
    expect(r.autoSatisfied).toBe(false)

    const autoOnly = computeRequirementCurrency(req(), [auto], NOW)
    expect(autoOnly.autoSatisfied).toBe(true)
  })

  it('alsoInPortal: true wins, false is reported, unasserted stays NULL', () => {
    expect(computeRequirementCurrency(req(), [art({ effectiveDate: '2026-06-30' })], NOW).alsoInPortal).toBeNull()
    expect(
      computeRequirementCurrency(req(), [art({ effectiveDate: '2026-06-30', alsoInPortal: false })], NOW).alsoInPortal,
    ).toBe(false)
    expect(
      computeRequirementCurrency(
        req(),
        [art({ key: 'a', effectiveDate: '2026-06-30', alsoInPortal: false }), art({ key: 'b', effectiveDate: '2026-06-30', alsoInPortal: true })],
        NOW,
      ).alsoInPortal,
    ).toBe(true)
  })
})

// ── Health basis composition ─────────────────────────────────────────────────

describe('computeEvidenceHealth basis composition', () => {
  const row = (state: string) =>
    ({ state, tag: 't', label: 'l' }) as unknown as Parameters<typeof computeEvidenceHealth>[0][number]

  it('all four clause combinations', () => {
    expect(computeEvidenceHealth([row('current'), row('missing')]).basis).toBe(
      'Based on 2 of 2 required artifacts.',
    )
    expect(computeEvidenceHealth([row('current'), row('unknown')]).basis).toBe(
      'Based on 1 of 2 required artifacts. 1 undated excluded.',
    )
    expect(computeEvidenceHealth([row('current'), row('not_tracked')]).basis).toBe(
      'Based on 1 of 2 required artifacts. 1 not tracked in KYRO excluded.',
    )
    expect(computeEvidenceHealth([row('current'), row('unknown'), row('not_tracked')]).basis).toBe(
      'Based on 1 of 3 required artifacts. 1 undated and 1 not tracked in KYRO excluded.',
    )
  })

  it('empty input → null pct, never 0', () => {
    const h = computeEvidenceHealth([])
    expect(h.evidenceHealthPct).toBeNull()
    expect(h.basis).toBe('Based on 0 of 0 required artifacts.')
  })
})

// ── The verifiedPct reduction ────────────────────────────────────────────────

describe('verifiedPctCurrent', () => {
  it('reduces byte-identically to the Phase-A verifiedPct when nothing is provably stale', () => {
    const leaves = Array.from({ length: 40 }, (_, i) => ({
      standardId: `s${i}`,
      code: `C-${i}`,
      rubricScore: null,
      evidenceCount: i % 3, // 0,1,2 repeating
    }))
    const currency = leaves.map((l) => ({
      standardId: l.standardId,
      evidenceCount: l.evidenceCount,
      currentEvidenceCount: l.evidenceCount,
    }))
    expect(verifiedPctCurrent(currency)).toBe(verifiedPct(leaves))
  })

  it('drops a leaf whose every artifact is provably stale', () => {
    const leaves = [
      { standardId: 'a', evidenceCount: 1, currentEvidenceCount: 1 },
      { standardId: 'b', evidenceCount: 2, currentEvidenceCount: 0 },
    ]
    expect(verifiedPctCurrent(leaves)).toBe(50)
  })

  it('empty → 0', () => {
    expect(verifiedPctCurrent([])).toBe(0)
  })
})

// ── Determinism ──────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('two identical calls stringify identically and deep-frozen inputs are not mutated', () => {
    const r = deepFreeze(req())
    const artifacts = deepFreeze([
      art({ key: 'a', effectiveDate: '2026-06-30' }),
      art({ key: 'b' }),
    ])
    const one = computeRequirementCurrency(r, artifacts, NOW)
    const two = computeRequirementCurrency(r, artifacts, NOW)
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(artifacts[0].key).toBe('a')
  })
})
