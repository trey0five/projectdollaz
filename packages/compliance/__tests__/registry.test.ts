import { describe, it, expect } from 'vitest'
import { RULE_REGISTRY, RULE_BY_ID } from '../src/registry.js'

const PROGRAMS = ['FTC', 'FES_EO', 'FES_UA']

describe('rule registry', () => {
  it('every rule id is unique', () => {
    const ids = RULE_REGISTRY.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('RULE_BY_ID indexes every rule', () => {
    expect(Object.keys(RULE_BY_ID).length).toBe(RULE_REGISTRY.length)
    for (const r of RULE_REGISTRY) expect(RULE_BY_ID[r.id]).toBe(r)
  })

  it("each rule's programs is 'all' or a subset of the three tiers", () => {
    for (const r of RULE_REGISTRY) {
      if (r.programs === 'all') continue
      for (const p of r.programs) expect(PROGRAMS).toContain(p)
    }
  })

  it('the FES-UA-only rules are scoped to exactly [FES_UA]', () => {
    for (const id of ['fesua_50k_cap', 'fesua_dormancy']) {
      expect(RULE_BY_ID[id].programs).toEqual(['FES_UA'])
    }
  })

  it('does not include SFO-level duties as school rules', () => {
    const ids = RULE_REGISTRY.map((r) => r.id)
    expect(ids).not.toContain('feseo_14day')
    expect(ids).not.toContain('sfo_admin_cap')
  })
})
