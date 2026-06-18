// Eligibility gate — a participating school must have operated ≥ 3 school years
// OR have posted a surety bond / LOC equal to one quarter's scholarship funds.
// INTAKE: yearsInOperation + suretyBondPosted. Severity `gate`.
import type { Rule } from '../types.js'
import { has } from './util.js'

const CITE = 's.1002.421(1)(f)1. (2024) — 3-year / surety-bond eligibility'
const MIN_YEARS = 3

export const eligibility3yrOrBond: Rule = {
  id: 'eligibility_3yr_or_bond',
  section: 'ELIGIBILITY',
  title: 'Operated ≥ 3 years or surety bond posted',
  citation: CITE,
  severityOnFail: 'gate',
  kind: 'intake',
  programs: 'all',
  evaluate(facts) {
    const years = facts.inputs.yearsInOperation
    if (!has(years)) {
      return {
        status: 'needs_data',
        detail: 'Enter the number of school years in operation to evaluate the eligibility gate.',
        citation: CITE,
      }
    }
    if (years >= MIN_YEARS) {
      return {
        status: 'pass',
        detail: `Operated ${years} school years (≥ ${MIN_YEARS}) — the eligibility gate is satisfied without a surety bond.`,
        citation: CITE,
      }
    }
    const bond = facts.inputs.suretyBondPosted
    if (!has(bond)) {
      return {
        status: 'needs_data',
        detail: `In operation ${years} years (< ${MIN_YEARS}) — attest whether a surety bond / LOC equal to one quarter's scholarship funds has been posted.`,
        citation: CITE,
      }
    }
    if (bond) {
      return {
        status: 'pass',
        detail: `In operation ${years} years (< ${MIN_YEARS}) but a surety bond / LOC equal to one quarter's scholarship funds has been posted — gate satisfied.`,
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: `In operation only ${years} years (< ${MIN_YEARS}) and no surety bond / LOC posted — eligibility gate not met (reportable).`,
      citation: CITE,
    }
  },
}
