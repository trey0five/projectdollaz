// Phase 2C — pure checklist builder tests: stable item set + ids + ordering,
// citation-grounding per procedure, the fixed DOCUMENTS group, and determinism.
import { describe, it, expect } from 'vitest'
import {
  buildYearEndChecklist,
  type ChecklistItem,
} from '../src/checklist.js'
import { RULE_REGISTRY } from '../src/registry.js'
import { SECTION_ORDER } from '../src/evaluate.js'

const DOCUMENT_IDS = [
  'doc_bank_statements_reconciliations',
  'doc_doe_approval_letter',
  'doc_scholarship_disbursement_records',
  'doc_student_subledgers',
  'doc_general_ledger_trial_balance',
  'doc_prior_year_aup_cap',
  'doc_surety_bond_loc',
]

function allItems(): ChecklistItem[] {
  return buildYearEndChecklist().flatMap((g) => g.items)
}

describe('buildYearEndChecklist', () => {
  it('never throws', () => {
    expect(() => buildYearEndChecklist()).not.toThrow()
  })

  it('produces one procedure item per rule plus the fixed document list', () => {
    const items = allItems()
    const procedures = items.filter((i) => i.kind === 'procedure')
    const documents = items.filter((i) => i.kind === 'document')
    expect(procedures.length).toBe(RULE_REGISTRY.length)
    expect(documents.length).toBe(DOCUMENT_IDS.length)
    expect(items.length).toBe(RULE_REGISTRY.length + DOCUMENT_IDS.length)
  })

  it('emits a chk_<ruleId> procedure for every rule with relatedRuleId set', () => {
    const items = allItems()
    for (const rule of RULE_REGISTRY) {
      const match = items.filter((i) => i.id === `chk_${rule.id}`)
      expect(match.length).toBe(1)
      expect(match[0].relatedRuleId).toBe(rule.id)
      expect(match[0].kind).toBe('procedure')
      expect(match[0].section).toBe(rule.section)
      expect(match[0].label).toBe(rule.title)
    }
  })

  it('grounds every procedure item guidance in its rule citation', () => {
    const procedures = allItems().filter((i) => i.kind === 'procedure')
    for (const item of procedures) {
      const rule = RULE_REGISTRY.find((r) => r.id === item.relatedRuleId)!
      expect(item.guidance).toContain(rule.citation)
    }
  })

  it('places the DOCUMENTS group last with the exact fixed id list', () => {
    const groups = buildYearEndChecklist()
    const last = groups[groups.length - 1]
    expect(last.section).toBe('DOCUMENTS')
    expect(last.items.map((i) => i.id)).toEqual(DOCUMENT_IDS)
    for (const item of last.items) {
      expect(item.kind).toBe('document')
      expect(item.relatedRuleId).toBeUndefined()
    }
  })

  it('has unique ids matching the chk_/doc_ prefix convention', () => {
    const items = allItems()
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of items) {
      if (item.kind === 'procedure') expect(item.id.startsWith('chk_')).toBe(true)
      else expect(item.id.startsWith('doc_')).toBe(true)
    }
  })

  it('orders groups by SECTION_ORDER then DOCUMENTS', () => {
    const sections = buildYearEndChecklist().map((g) => g.section)
    const procedureSections = sections.filter((s) => s !== 'DOCUMENTS')
    const expectedOrder = SECTION_ORDER.filter((s) => procedureSections.includes(s))
    expect(procedureSections).toEqual(expectedOrder)
    expect(sections[sections.length - 1]).toBe('DOCUMENTS')
  })

  it('orders procedure items within a group by RULE_REGISTRY order', () => {
    for (const group of buildYearEndChecklist()) {
      if (group.section === 'DOCUMENTS') continue
      const registryOrder = RULE_REGISTRY.filter((r) => r.section === group.section).map(
        (r) => `chk_${r.id}`,
      )
      expect(group.items.map((i) => i.id)).toEqual(registryOrder)
    }
  })

  it('is deterministic across calls', () => {
    expect(JSON.stringify(buildYearEndChecklist())).toBe(
      JSON.stringify(buildYearEndChecklist()),
    )
  })
})
