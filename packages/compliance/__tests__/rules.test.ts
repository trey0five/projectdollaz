import { describe, it, expect } from 'vitest'
import { RULE_BY_ID } from '../src/registry.js'
import type { FindingStatus } from '../src/types.js'
import {
  buildFacts,
  cleanFinancials,
  emptyInputs,
  fullPassInputs,
  lowExpenseFinancials,
  nonEducationFinancials,
  noSnapshotFinancials,
  redFlagFinancials,
  unbalancedFinancials,
} from './fixtures.js'

/** Evaluate one rule by id against the given facts. */
function evalRule(id: string, facts: ReturnType<typeof buildFacts>): {
  status: FindingStatus
  detail: string
  citation: string
} {
  const rule = RULE_BY_ID[id]
  expect(rule, `rule ${id} exists`).toBeTruthy()
  return rule.evaluate(facts)
}

describe('balanced_books (§II)', () => {
  it('pass when TB balances', () => {
    expect(evalRule('balanced_books', buildFacts({}, cleanFinancials)).status).toBe('pass')
  })
  it('reportable when TB does not balance', () => {
    expect(evalRule('balanced_books', buildFacts({}, unbalancedFinancials)).status).toBe('reportable')
  })
  it('needs_data when no snapshot', () => {
    expect(evalRule('balanced_books', buildFacts({}, noSnapshotFinancials)).status).toBe('needs_data')
  })
})

describe('expenses_ge_scholarships (§V)', () => {
  it('needs_data when scholarship figure missing', () => {
    expect(evalRule('expenses_ge_scholarships', buildFacts({}, cleanFinancials)).status).toBe('needs_data')
  })
  it('pass when expenses cover scholarships', () => {
    const r = evalRule('expenses_ge_scholarships', buildFacts({ scholarshipFundsReceived: 300_000 }, cleanFinancials))
    expect(r.status).toBe('pass')
  })
  it('reportable when scholarships exceed expenses', () => {
    const r = evalRule('expenses_ge_scholarships', buildFacts({ scholarshipFundsReceived: 300_000 }, lowExpenseFinancials))
    expect(r.status).toBe('reportable')
  })
  it('needs_data when no snapshot even with scholarship figure', () => {
    const r = evalRule('expenses_ge_scholarships', buildFacts({ scholarshipFundsReceived: 300_000 }, noSnapshotFinancials))
    expect(r.status).toBe('needs_data')
  })
})

describe('non_education_expenses (§V)', () => {
  it('pass when no non-education categories carry a balance', () => {
    expect(evalRule('non_education_expenses', buildFacts({}, cleanFinancials)).status).toBe('pass')
  })
  it('reportable and lists categories when non-education expenses present', () => {
    const r = evalRule('non_education_expenses', buildFacts({}, nonEducationFinancials))
    expect(r.status).toBe('reportable')
    expect(r.detail).toContain('Athletics')
    expect(r.detail).toContain('Student activities')
    expect(r.detail).toContain('Transportation')
    expect(r.detail).toContain('Food service')
  })
  it('needs_data when no snapshot', () => {
    expect(evalRule('non_education_expenses', buildFacts({}, noSnapshotFinancials)).status).toBe('needs_data')
  })
})

describe('red_flags (prudential)', () => {
  it('pass when financials are clean', () => {
    expect(evalRule('red_flags', buildFacts({}, cleanFinancials)).status).toBe('pass')
  })
  it('watch on each red flag', () => {
    const r = evalRule('red_flags', buildFacts({}, redFlagFinancials))
    expect(r.status).toBe('watch')
    expect(r.detail).toContain('negative net assets')
    expect(r.detail).toContain('negative cash')
    expect(r.detail).toContain('operating deficit')
    expect(r.detail).toContain('low days cash')
  })
  it('needs_data when no snapshot', () => {
    expect(evalRule('red_flags', buildFacts({}, noSnapshotFinancials)).status).toBe('needs_data')
  })
})

describe('aup_trigger (threshold)', () => {
  it('needs_data when scholarship figure missing', () => {
    expect(evalRule('aup_trigger', buildFacts({})).status).toBe('needs_data')
  })
  it('required (manual) when > $250k', () => {
    const r = evalRule('aup_trigger', buildFacts({ scholarshipFundsReceived: 300_000 }))
    expect(r.status).toBe('manual')
    expect(r.detail).toContain('REQUIRED')
    expect(r.detail).toContain('September 15')
  })
  it('not required (manual) when <= $250k', () => {
    const r = evalRule('aup_trigger', buildFacts({ scholarshipFundsReceived: 200_000 }))
    expect(r.status).toBe('manual')
    expect(r.detail).toContain('not required')
  })
})

describe('fdic_insured (§III.A)', () => {
  it('needs_data when missing', () => {
    expect(evalRule('fdic_insured', buildFacts({})).status).toBe('needs_data')
  })
  it('pass when true', () => {
    expect(evalRule('fdic_insured', buildFacts({ fundsAtInsuredInstitution: true })).status).toBe('pass')
  })
  it('reportable when false', () => {
    expect(evalRule('fdic_insured', buildFacts({ fundsAtInsuredInstitution: false })).status).toBe('reportable')
  })
})

describe('bank_rating (§III.A)', () => {
  it('needs_data when avgDailyBalanceOver250k missing', () => {
    expect(evalRule('bank_rating', buildFacts({})).status).toBe('needs_data')
  })
  it('pass when balance not over $250k (review not required)', () => {
    expect(evalRule('bank_rating', buildFacts({ avgDailyBalanceOver250k: false })).status).toBe('pass')
  })
  it('needs_data when over $250k but review flag missing', () => {
    expect(evalRule('bank_rating', buildFacts({ avgDailyBalanceOver250k: true })).status).toBe('needs_data')
  })
  it('reportable when over $250k and not reviewed', () => {
    const r = evalRule('bank_rating', buildFacts({ avgDailyBalanceOver250k: true, bankRatingReviewedTopTwo: false }))
    expect(r.status).toBe('reportable')
  })
  it('pass when over $250k and reviewed top-two', () => {
    const r = evalRule('bank_rating', buildFacts({ avgDailyBalanceOver250k: true, bankRatingReviewedTopTwo: true }))
    expect(r.status).toBe('pass')
  })
})

describe('reconciliation_60day (§III.B)', () => {
  it('needs_data when one flag is true and the other missing (no failure yet)', () => {
    expect(evalRule('reconciliation_60day', buildFacts({ reconciledWithin60Days: true })).status).toBe('needs_data')
  })
  it('material when one flag is explicitly false even if the other is missing', () => {
    expect(evalRule('reconciliation_60day', buildFacts({ reconciledWithin60Days: false })).status).toBe('material')
  })
  it('pass when both true', () => {
    const r = evalRule('reconciliation_60day', buildFacts({ reconciledWithin60Days: true, reconciliationIndependentlyReviewed: true }))
    expect(r.status).toBe('pass')
  })
  it('material when not reconciled within 60 days', () => {
    const r = evalRule('reconciliation_60day', buildFacts({ reconciledWithin60Days: false, reconciliationIndependentlyReviewed: true }))
    expect(r.status).toBe('material')
    expect(r.detail).toContain('Corrective Action Plan')
  })
  it('material when not independently reviewed', () => {
    const r = evalRule('reconciliation_60day', buildFacts({ reconciledWithin60Days: true, reconciliationIndependentlyReviewed: false }))
    expect(r.status).toBe('material')
  })
})

describe('doe_approved (§I)', () => {
  it('needs_data when missing', () => {
    expect(evalRule('doe_approved', buildFacts({})).status).toBe('needs_data')
  })
  it('pass when approved', () => {
    expect(evalRule('doe_approved', buildFacts({ doeStatusApproved: true })).status).toBe('pass')
  })
  it('reportable when not approved', () => {
    expect(evalRule('doe_approved', buildFacts({ doeStatusApproved: false })).status).toBe('reportable')
  })
})

describe('eligibility_3yr_or_bond (ELIGIBILITY gate)', () => {
  it('needs_data when years missing', () => {
    expect(evalRule('eligibility_3yr_or_bond', buildFacts({})).status).toBe('needs_data')
  })
  it('pass when >= 3 years', () => {
    expect(evalRule('eligibility_3yr_or_bond', buildFacts({ yearsInOperation: 5 })).status).toBe('pass')
  })
  it('needs_data when < 3 years and bond flag missing', () => {
    expect(evalRule('eligibility_3yr_or_bond', buildFacts({ yearsInOperation: 2 })).status).toBe('needs_data')
  })
  it('pass when < 3 years but bond posted', () => {
    const r = evalRule('eligibility_3yr_or_bond', buildFacts({ yearsInOperation: 2, suretyBondPosted: true }))
    expect(r.status).toBe('pass')
  })
  it('reportable when < 3 years and no bond', () => {
    const r = evalRule('eligibility_3yr_or_bond', buildFacts({ yearsInOperation: 2, suretyBondPosted: false }))
    expect(r.status).toBe('reportable')
  })
})

describe('fesua_50k_cap (UA only)', () => {
  it('not_applicable when FES-UA not in programs', () => {
    expect(evalRule('fesua_50k_cap', buildFacts({ programs: ['FTC'], fesuaAnyAccountOver50k: true })).status).toBe('not_applicable')
  })
  it('needs_data when FES-UA present but flag missing', () => {
    expect(evalRule('fesua_50k_cap', buildFacts({ programs: ['FES_UA'] })).status).toBe('needs_data')
  })
  it('pass when FES-UA and no account over $50k', () => {
    const r = evalRule('fesua_50k_cap', buildFacts({ programs: ['FES_UA'], fesuaAnyAccountOver50k: false }))
    expect(r.status).toBe('pass')
  })
  it('reportable when FES-UA and an account over $50k', () => {
    const r = evalRule('fesua_50k_cap', buildFacts({ programs: ['FES_UA'], fesuaAnyAccountOver50k: true }))
    expect(r.status).toBe('reportable')
  })
})

describe('deposit_tracing (§IV checklist)', () => {
  it('always manual with CPA guidance', () => {
    const r = evalRule('deposit_tracing', buildFacts(fullPassInputs))
    expect(r.status).toBe('manual')
    expect(r.detail).toContain('10 students or 5%')
  })
})

describe('fesua_dormancy (UA only checklist)', () => {
  it('not_applicable without FES-UA', () => {
    expect(evalRule('fesua_dormancy', buildFacts({ programs: ['FTC'] })).status).toBe('not_applicable')
  })
  it('manual with FES-UA', () => {
    const r = evalRule('fesua_dormancy', buildFacts({ programs: ['FES_UA'] }))
    expect(r.status).toBe('manual')
  })
})

describe('empty intake -> every intake rule needs_data (no false fail)', () => {
  it('intake rules are needs_data / not_applicable when nothing entered', () => {
    const facts = buildFacts(emptyInputs, cleanFinancials)
    for (const id of ['fdic_insured', 'bank_rating', 'reconciliation_60day', 'doe_approved', 'eligibility_3yr_or_bond', 'aup_trigger']) {
      const status = RULE_BY_ID[id].evaluate(facts).status
      expect(['needs_data', 'not_applicable'], `${id}`).toContain(status)
    }
  })
})
