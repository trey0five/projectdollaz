import { describe, it, expect } from 'vitest'
import { evaluateCompliance, groupBySection } from '../src/evaluate.js'
import { summarize } from '../src/summarize.js'
import { buildFacts, cleanFinancials, fullPassInputs, nonEducationFinancials } from './fixtures.js'

describe('determinism / reproducibility', () => {
  it('evaluating the same facts twice yields byte-identical findings', () => {
    const facts = buildFacts(fullPassInputs, nonEducationFinancials)
    const a = evaluateCompliance(facts)
    const b = evaluateCompliance(facts)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('summarize is reproducible', () => {
    const facts = buildFacts(fullPassInputs, cleanFinancials)
    const a = summarize(evaluateCompliance(facts), facts)
    const b = summarize(evaluateCompliance(facts), facts)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('groupBySection is reproducible and in canonical order', () => {
    const facts = buildFacts({ ...fullPassInputs, programs: ['FTC', 'FES_UA'] }, cleanFinancials)
    const groups = groupBySection(evaluateCompliance(facts))
    const sections = groups.map((g) => g.section)
    const order = ['I', 'II', 'III', 'IV', 'V', 'VI', 'ELIGIBILITY']
    // sections appear in canonical order (subset, but monotonic).
    let last = -1
    for (const s of sections) {
      const idx = order.indexOf(s)
      expect(idx).toBeGreaterThan(last)
      last = idx
    }
  })
})
