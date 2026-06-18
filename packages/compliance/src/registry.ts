// ─────────────────────────────────────────────────────────────
// The rule registry — a stable, ordered list of every FL-scholarship-AUP rule.
// Adding a rule = ONE entry here + ONE test. Each rule is pure and never throws.
//
// TIER SCOPING: the FES-UA-only rules (fesua_50k_cap, fesua_dormancy) declare
// programs:['FES_UA'] and return `not_applicable` unless the resolved program
// list includes FES_UA.
//
// DELIBERATELY EXCLUDED — SFO-level duties, NOT per-school checks (background
// only, per the research doc): FES-EO 14-day SUFS payment (SBE 6A-6.0952) and
// the SFO 3% admin-expense cap / separate-accounts requirement (s.1002.395(6)(m),
// (l)1.). These are obligations of Step Up For Students, not the school, so they
// are not in the registry.
// ─────────────────────────────────────────────────────────────
import type { Rule } from './types.js'
import { balancedBooks } from './rules/balancedBooks.js'
import { expensesGeScholarships } from './rules/expensesGeScholarships.js'
import { nonEducationExpenses } from './rules/nonEducationExpenses.js'
import { redFlags } from './rules/redFlags.js'
import { aupTrigger } from './rules/aupTrigger.js'
import { fdicInsured } from './rules/fdicInsured.js'
import { bankRating } from './rules/bankRating.js'
import { reconciliation60Day } from './rules/reconciliation60Day.js'
import { doeApproved } from './rules/doeApproved.js'
import { eligibility3yrOrBond } from './rules/eligibility3yrOrBond.js'
import { fesua50kCap } from './rules/fesua50kCap.js'
import { depositTracing } from './rules/depositTracing.js'
import { fesuaDormancy } from './rules/fesuaDormancy.js'

/** Every rule, in stable evaluation order (drives the deterministic findings order). */
export const RULE_REGISTRY: readonly Rule[] = [
  // §I
  doeApproved,
  // §II
  balancedBooks,
  // §III
  fdicInsured,
  bankRating,
  reconciliation60Day,
  // §IV
  depositTracing,
  // §V
  aupTrigger,
  expensesGeScholarships,
  nonEducationExpenses,
  // §VI / prudential
  redFlags,
  // Eligibility gate
  eligibility3yrOrBond,
  fesua50kCap,
  fesuaDormancy,
]

/** Rule lookup by id. */
export const RULE_BY_ID: Record<string, Rule> = Object.fromEntries(
  RULE_REGISTRY.map((r) => [r.id, r]),
)
