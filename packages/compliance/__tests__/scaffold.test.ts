import { describe, it, expect } from 'vitest'
import type { Finding } from '../src/types.js'
import {
  scaffoldCorrectiveActionPlan,
  CAP_TEMPLATES,
  GENERIC_TEMPLATE,
} from '../src/scaffold.js'

// Hand-built findings (NOT sample-data) — minimal shape the scaffold reads.
function finding(over: Partial<Finding> & Pick<Finding, 'id' | 'status'>): Finding {
  return {
    id: over.id,
    section: over.section ?? 'III',
    title: over.title ?? 'Test rule',
    kind: over.kind ?? 'intake',
    severityOnFail: over.severityOnFail ?? 'material',
    programs: over.programs ?? 'all',
    status: over.status,
    detail: over.detail ?? 'observation text',
    citation: over.citation ?? '§X',
  }
}

const reconMaterial = finding({
  id: 'reconciliation_60day',
  status: 'material',
  section: 'III',
  title: '60-day reconciliation',
  citation: '§III.B',
  detail: 'Reconciliations not completed within 60 days.',
})

const expensesReportable = finding({
  id: 'expenses_ge_scholarships',
  status: 'reportable',
  section: 'V',
  title: 'Expenses ≥ scholarships',
  citation: '§V',
  detail: 'Scholarship funds exceed education expenses.',
})

const passFinding = finding({ id: 'fdic_insured', status: 'pass', section: 'III' })
const needsData = finding({ id: 'doe_approved', status: 'needs_data', section: 'I' })
const watch = finding({ id: 'red_flags', status: 'watch', section: 'VI' })

describe('scaffoldCorrectiveActionPlan', () => {
  it('material-only when includeReportable:false', () => {
    const out = scaffoldCorrectiveActionPlan(
      [reconMaterial, expensesReportable, passFinding],
      { includeReportable: false },
    )
    expect(out.map((e) => e.ruleId)).toEqual(['reconciliation_60day'])
    expect(out[0].severity).toBe('material')
  })

  it('includeReportable (default true) also pulls reportable findings', () => {
    const out = scaffoldCorrectiveActionPlan([reconMaterial, expensesReportable])
    expect(out.map((e) => e.ruleId).sort()).toEqual([
      'expenses_ge_scholarships',
      'reconciliation_60day',
    ])
    const exp = out.find((e) => e.ruleId === 'expenses_ge_scholarships')!
    expect(exp.severity).toBe('reportable')
  })

  it('excludes pass/needs_data/manual/not_applicable/watch', () => {
    const out = scaffoldCorrectiveActionPlan([
      passFinding,
      needsData,
      watch,
      finding({ id: 'aup_trigger', status: 'not_applicable' }),
      finding({ id: 'bank_rating', status: 'manual' }),
    ])
    expect(out).toEqual([])
  })

  it('each templated rule yields its specific corrective action + citation', () => {
    const out = scaffoldCorrectiveActionPlan([reconMaterial])
    expect(out[0].suggestedCorrectiveAction).toBe(
      CAP_TEMPLATES.reconciliation_60day.correctiveAction,
    )
    expect(out[0].suggestedCorrectiveAction).toContain('documented monthly bank-reconciliation')
    expect(out[0].citation).toBe('§III.B')
    expect(out[0].suggestedResponsibleParty).toBe('Business Manager / Head of School')
  })

  it('unknown ruleId falls back to GENERIC_TEMPLATE', () => {
    const unknown = finding({ id: 'totally_made_up_rule', status: 'material' })
    const out = scaffoldCorrectiveActionPlan([unknown])
    expect(out[0].suggestedCorrectiveAction).toBe(GENERIC_TEMPLATE.correctiveAction)
    expect(out[0].suggestedRootCause).toBe(GENERIC_TEMPLATE.rootCause)
  })

  it('empty findings -> []', () => {
    expect(scaffoldCorrectiveActionPlan([])).toEqual([])
  })

  it('observation === finding.detail and severity mirrors status', () => {
    const out = scaffoldCorrectiveActionPlan([reconMaterial, expensesReportable])
    const recon = out.find((e) => e.ruleId === 'reconciliation_60day')!
    expect(recon.observation).toBe('Reconciliations not completed within 60 days.')
    expect(recon.severity).toBe('material')
    const exp = out.find((e) => e.ruleId === 'expenses_ge_scholarships')!
    expect(exp.observation).toBe('Scholarship funds exceed education expenses.')
    expect(exp.severity).toBe('reportable')
  })

  it('deterministic + ordered by section then ruleId', () => {
    const a = finding({ id: 'doe_approved', status: 'material', section: 'I' })
    const b = finding({ id: 'non_education_expenses', status: 'material', section: 'V' })
    const c = finding({ id: 'expenses_ge_scholarships', status: 'reportable', section: 'V' })
    const input = [b, c, a, reconMaterial]
    const first = scaffoldCorrectiveActionPlan(input)
    const second = scaffoldCorrectiveActionPlan(input)
    expect(first).toEqual(second)
    // I (doe) -> III (recon) -> V (expenses_ge before non_education by ruleId)
    expect(first.map((e) => e.ruleId)).toEqual([
      'doe_approved',
      'reconciliation_60day',
      'expenses_ge_scholarships',
      'non_education_expenses',
    ])
  })

  it('does not mutate the input array or its findings', () => {
    const input = [reconMaterial, expensesReportable]
    const copy = JSON.parse(JSON.stringify(input))
    scaffoldCorrectiveActionPlan(input)
    expect(input).toEqual(copy)
  })
})
