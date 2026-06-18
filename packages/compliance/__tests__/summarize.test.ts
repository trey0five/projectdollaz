import { describe, it, expect } from 'vitest'
import { evaluateCompliance } from '../src/evaluate.js'
import { summarize } from '../src/summarize.js'
import { FL_SCHOLARSHIP_AUP } from '../src/ruleset.js'
import { buildFacts, cleanFinancials, fullPassInputs } from './fixtures.js'

describe('summarize', () => {
  it('counts every status and carries the ruleset version + statute year', () => {
    const facts = buildFacts(fullPassInputs, cleanFinancials)
    const findings = evaluateCompliance(facts)
    const summary = summarize(findings, facts)

    const total = Object.values(summary.counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(findings.length)
    expect(summary.rulesetVersion).toBe(FL_SCHOLARSHIP_AUP.version)
    expect(summary.statuteYear).toBe(FL_SCHOLARSHIP_AUP.statuteYear)
  })

  it('hasMaterial true when reconciliation is material', () => {
    const facts = buildFacts(
      { ...fullPassInputs, reconciledWithin60Days: false },
      cleanFinancials,
    )
    const findings = evaluateCompliance(facts)
    const summary = summarize(findings, facts)
    expect(summary.hasMaterial).toBe(true)
    expect(summary.counts.material).toBeGreaterThanOrEqual(1)
  })

  it('hasMaterial false when no material findings', () => {
    const facts = buildFacts(fullPassInputs, cleanFinancials)
    const summary = summarize(evaluateCompliance(facts), facts)
    expect(summary.hasMaterial).toBe(false)
  })

  it('requiresAup true when scholarship funds > $250k', () => {
    const facts = buildFacts({ scholarshipFundsReceived: 300_000 }, cleanFinancials)
    expect(summarize(evaluateCompliance(facts), facts).requiresAup).toBe(true)
  })

  it('requiresAup false at/below $250k or when missing', () => {
    const at = buildFacts({ scholarshipFundsReceived: 250_000 }, cleanFinancials)
    const missing = buildFacts({}, cleanFinancials)
    expect(summarize(evaluateCompliance(at), at).requiresAup).toBe(false)
    expect(summarize(evaluateCompliance(missing), missing).requiresAup).toBe(false)
  })
})
