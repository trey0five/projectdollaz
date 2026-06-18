// Pure evaluation: run every rule against the facts and produce Findings. Stable
// order (registry order), deterministic, no clock/random, no mutation.
import type { ComplianceFacts, Finding, Section } from './types.js'
import { RULE_REGISTRY } from './registry.js'

/** Evaluate the whole ruleset against a fact bundle. */
export function evaluateCompliance(facts: ComplianceFacts): Finding[] {
  return RULE_REGISTRY.map((rule) => {
    const result = rule.evaluate(facts)
    return {
      id: rule.id,
      section: rule.section,
      title: rule.title,
      kind: rule.kind,
      severityOnFail: rule.severityOnFail,
      programs: rule.programs,
      status: result.status,
      detail: result.detail,
      citation: result.citation,
    }
  })
}

/** Canonical section render order. */
export const SECTION_ORDER: readonly Section[] = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'ELIGIBILITY',
]

/** Group findings by section, in canonical order (empty sections omitted). */
export function groupBySection(
  findings: Finding[],
): { section: Section; findings: Finding[] }[] {
  return SECTION_ORDER.map((section) => ({
    section,
    findings: findings.filter((f) => f.section === section),
  })).filter((g) => g.findings.length > 0)
}
