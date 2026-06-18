// Hand-built ComplianceFacts fixtures — NOT sample-data file contents. Each
// builder constructs the minimal facts a rule path needs.
import type {
  ComplianceFacts,
  ComplianceFinancials,
  ComplianceInputs,
  Program,
} from '../src/types.js'

const ZERO_EXPENSE_LINES = {
  instructional: 0,
  facilities: 0,
  fixedOther: 0,
  intlExp: 0,
  bus: 0,
  food: 0,
  studActExp: 0,
  athletics: 0,
  admin: 0,
  restricted: 0,
}

/** A balanced snapshot with clean financials and no non-education expenses. */
export const cleanFinancials: ComplianceFinancials = {
  balanced: true,
  hasSnapshot: true,
  totalExpenses: 10_420_000,
  netAssets: 5_000_000,
  cash: 2_000_000,
  daysCashOnHand: 90,
  operatingResult: 250_000,
  expenseLines: { ...ZERO_EXPENSE_LINES, instructional: 8_000_000, admin: 2_420_000 },
}

/** Same as clean but the TB does not balance. */
export const unbalancedFinancials: ComplianceFinancials = {
  ...cleanFinancials,
  balanced: false,
}

/** No snapshot for the period — AUTO rules must return needs_data. */
export const noSnapshotFinancials: ComplianceFinancials = {
  balanced: false,
  hasSnapshot: false,
  totalExpenses: 0,
  netAssets: null,
  cash: null,
  daysCashOnHand: null,
  operatingResult: 0,
  expenseLines: { ...ZERO_EXPENSE_LINES },
}

/** Financials carrying non-education expense categories (athletics/studAct/bus/food). */
export const nonEducationFinancials: ComplianceFinancials = {
  ...cleanFinancials,
  expenseLines: {
    ...ZERO_EXPENSE_LINES,
    instructional: 6_000_000,
    athletics: 120_000,
    studActExp: 80_000,
    bus: 200_000,
    food: 50_000,
  },
}

/** Financials with prudential red flags (deficit + negative net assets + low cash). */
export const redFlagFinancials: ComplianceFinancials = {
  balanced: true,
  hasSnapshot: true,
  totalExpenses: 1_000_000,
  netAssets: -50_000,
  cash: -10_000,
  daysCashOnHand: 5,
  operatingResult: -200_000,
  expenseLines: { ...ZERO_EXPENSE_LINES, instructional: 1_000_000 },
}

/** Low totalExpenses so coverage fails against a larger scholarship figure. */
export const lowExpenseFinancials: ComplianceFinancials = {
  ...cleanFinancials,
  totalExpenses: 100_000,
}

/** Build a ComplianceFacts with the given inputs + financials. Programs resolved from inputs. */
export function buildFacts(
  inputs: ComplianceInputs,
  financials: ComplianceFinancials = cleanFinancials,
): ComplianceFacts {
  return {
    inputs,
    financials,
    programs: inputs.programs ?? [],
  }
}

/** A fully-populated, all-passing intake (no FES-UA). */
export const fullPassInputs: ComplianceInputs = {
  scholarshipFundsReceived: 300_000,
  programs: ['FTC'] as Program[],
  fundsAtInsuredInstitution: true,
  avgDailyBalanceOver250k: false,
  bankRatingReviewedTopTwo: true,
  reconciledWithin60Days: true,
  reconciliationIndependentlyReviewed: true,
  doeStatusApproved: true,
  yearsInOperation: 5,
  suretyBondPosted: false,
  fesuaAnyAccountOver50k: false,
}

/** An empty intake — every intake rule should return needs_data. */
export const emptyInputs: ComplianceInputs = {}
