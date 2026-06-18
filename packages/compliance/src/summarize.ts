// Pure rollup of findings -> ComplianceSummary. Deterministic; no clock/random.
import type {
  ComplianceCounts,
  ComplianceFacts,
  ComplianceSummary,
  Finding,
} from './types.js'
import { FL_SCHOLARSHIP_AUP } from './ruleset.js'
import { has } from './rules/util.js'

const AUP_THRESHOLD = 250_000

/**
 * Roll a set of findings up into a summary. `facts` is used only to derive the
 * `requiresAup` flag from scholarshipFundsReceived > $250k (the SAME condition
 * the aup_trigger rule keys off) so the UI header reads a boolean, not a status.
 */
export function summarize(findings: Finding[], facts: ComplianceFacts): ComplianceSummary {
  const counts: ComplianceCounts = {
    pass: 0,
    reportable: 0,
    material: 0,
    needs_data: 0,
    manual: 0,
    not_applicable: 0,
    watch: 0,
  }
  for (const f of findings) counts[f.status] += 1

  const scholarships = facts.inputs.scholarshipFundsReceived
  const requiresAup = has(scholarships) && scholarships > AUP_THRESHOLD

  return {
    requiresAup,
    counts,
    hasMaterial: counts.material > 0,
    rulesetVersion: FL_SCHOLARSHIP_AUP.version,
    statuteYear: FL_SCHOLARSHIP_AUP.statuteYear,
  }
}
