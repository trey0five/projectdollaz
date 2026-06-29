// ─────────────────────────────────────────────────────────────
// @finrep/analytics — Phase-2 enrollment×tuition DRIVER MODEL.
//
// PURE, TOTAL, NEVER-THROWS single source of truth for the driver budget:
// assumptions in -> computed category budget + KPIs + even-12-month spread out.
// Imported by BOTH the API (authoritative save) AND the web (live preview), so
// the math lives here exactly once and the two call sites cannot drift.
//
// SCOPE (v2, user-locked):
//  - Tuition = Σ_grade enrollment[g] × rate[bandOf(g)]; fees fold INTO tuition.
//  - Salaries = headcount × avgSalary BY ROLE (teachers→instructional,
//    admin→admin, facilities→facilities); benefits = Σsalaries × benefitsPct
//    → fixedOther.
//  - Driver expense categories = role salary/benefit term + grown non-salary
//    supplement (the supplement is an OVERRIDE; default 0 — we never fabricate a
//    prior salary/non-salary split, which budgetContext doesn't carry).
//  - Every non-driver line auto-grows from prior actual × (1+inflation%),
//    individually overridable.
//  - Annual spread evenly across 12 months (months sum EXACTLY to annual).
// ─────────────────────────────────────────────────────────────
import type { ExpenseLineKey, RevenueLineKey } from './types.js'
import { REVENUE_LINE_KEYS, EXPENSE_LINE_KEYS } from './adapt.js'

export type RevenueKey = RevenueLineKey
export type ExpenseKey = ExpenseLineKey

// ── Grade keys (the enrollment grid) and rate bands (4, not 14) ──────────────

/** Enrollment grid keys — the columns the UI collects. Fixed order = deterministic Σ. */
export const GRADE_KEYS = [
  'PK3',
  'PK4',
  'K',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const
export type GradeKey = (typeof GRADE_KEYS)[number]

/**
 * Tuition rate bands — collapse the 15 grades into 5 rate inputs. The band keys ARE
 * the `tuitionRates` keys, so `tuitionRates[bandOf(g)]` is a direct lookup.
 *  - prek3 : part-time PreK (PK3 — 3-year-olds)
 *  - prek5 : full-day PreK (PK4 / VPK)
 *  - elem  : K–5
 *  - middle: 6–8
 *  - high  : 9–12 (Upper School)
 * (Band boundaries are a v2 decision adapted from the workbook's PreK split; if
 * a school needs finer tiers, only `bandOf` + `TUITION_BANDS` change.)
 */
export const TUITION_BANDS = ['prek3', 'prek5', 'elem', 'middle', 'high'] as const
export type TuitionBand = (typeof TUITION_BANDS)[number]

/** Total map grade → rate band. Exhaustive over GradeKey. */
export function bandOf(g: GradeKey): TuitionBand {
  switch (g) {
    case 'PK3':
      return 'prek3'
    case 'PK4':
      return 'prek5'
    case 'K':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
      return 'elem'
    case '6':
    case '7':
    case '8':
      return 'middle'
    case '9':
    case '10':
    case '11':
    case '12':
      return 'high'
    default: {
      // Exhaustiveness guard — unreachable for a valid GradeKey.
      const _never: never = g
      return _never
    }
  }
}

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface DriverAssumptions {
  /** All 15 grade keys; a missing/blank grade is treated as 0. */
  enrollmentByGrade: Partial<Record<GradeKey, number>>
  /** 5 band rates; a missing band is treated as 0. */
  tuitionRates: Partial<Record<TuitionBand, number>>
  /** 3-way program split as percentages. Normalized in compute (sum need not be exactly 100). */
  tuitionProgramSplit: { parent: number; ftc: number; fes: number }
  /** Per-student fee (404/405); folds into the tuition category. */
  feePerStudent: number
  staffing: {
    teachers: { count: number; avgSalary: number }
    admin: { count: number; avgSalary: number }
    facilities: { count: number; avgSalary: number }
    /** Benefits load as a percent of total role salaries. */
    benefitsPct: number
  }
  /** Percent applied to non-driver prior actuals (and per-line override growth). */
  inflationPct: number
  /**
   * Per-category overrides. For a NON-driver line the override is the final
   * category amount (replaces the grown prior). For a DRIVER line
   * (instructional/admin/facilities/fixedOther) the override is the NON-SALARY
   * supplement ADDED to the salary/benefit term. Unknown keys are ignored.
   */
  overrides?: Partial<Record<RevenueKey | ExpenseKey, number>>
}

/** Minimal prior-actuals slice (decoupled from the API's full BudgetContext). */
export interface DriverPriorContext {
  priorRevenue: Partial<Record<RevenueKey, number>>
  priorExpense: Partial<Record<ExpenseKey, number>>
}

export interface DriverBudgetResult {
  revenue: Record<RevenueKey, number>
  expense: Record<ExpenseKey, number>
  detail: {
    grossTuition: number
    tuitionByProgram: { parent: number; ftc: number; fes: number }
    fees: number
    salaries: { teachers: number; admin: number; facilities: number; total: number }
    benefits: number
  }
  kpis: {
    enrollmentTotal: number
    costPerPupil: number | null
    netTuitionPerStudent: number | null
    /** salaries.total / totalExpense; 0..1; null when totalExpense === 0. */
    salariesPctOfExpense: number | null
    /** revenue.tuition / totalRevenue; 0..1; null when totalRevenue === 0. */
    netTuitionPctOfRevenue: number | null
    totalRevenue: number
    totalExpense: number
    netIncome: number
  }
  /** Even 12-month split (present only when computeDriverBudget is asked for it). */
  months?: {
    revenue: Record<RevenueKey, number[]>
    expense: Record<ExpenseKey, number[]>
  }
}

export interface ComputeDriverOptions {
  /** When true, include the even-12-month spread in the result. */
  includeMonths?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Driver expense lines whose category total is salary/benefit term + grown supplement. */
const DRIVER_EXPENSE_KEYS = new Set<ExpenseKey>([
  'instructional',
  'admin',
  'facilities',
  'fixedOther',
])

/**
 * Even 12-month cent distribution. Largest-remainder by cents so the 12 months
 * sum EXACTLY to round2(annual) — no `round(annual/12)*12 ≠ annual` leak.
 */
export function evenMonths(annual: number): number[] {
  const cents = Math.round(num(annual) * 100)
  const base = Math.trunc(cents / 12)
  let rem = cents - base * 12 // signed leftover cents (sign follows `cents`)
  const step = rem >= 0 ? 1 : -1
  rem = Math.abs(rem)
  const out: number[] = []
  for (let i = 0; i < 12; i++) {
    const c = base + (i < rem ? step : 0)
    out.push(c / 100)
  }
  return out
}

/** Map the API's BudgetContext-like object into the minimal DriverPriorContext. */
export function toDriverPriorContext(ctx: {
  prior?: { revenue?: Record<string, number>; expense?: Record<string, number> } | null
} | null | undefined): DriverPriorContext {
  return {
    priorRevenue: (ctx?.prior?.revenue ?? {}) as Partial<Record<RevenueKey, number>>,
    priorExpense: (ctx?.prior?.expense ?? {}) as Partial<Record<ExpenseKey, number>>,
  }
}

/** Seed a blank assumptions object (used by the web form's initial state + tests). */
export function defaultAssumptions(): DriverAssumptions {
  const enrollmentByGrade: Partial<Record<GradeKey, number>> = {}
  for (const g of GRADE_KEYS) enrollmentByGrade[g] = 0
  return {
    enrollmentByGrade,
    tuitionRates: { prek3: 0, prek5: 0, elem: 0, middle: 0, high: 0 },
    tuitionProgramSplit: { parent: 100, ftc: 0, fes: 0 },
    feePerStudent: 0,
    staffing: {
      teachers: { count: 0, avgSalary: 0 },
      admin: { count: 0, avgSalary: 0 },
      facilities: { count: 0, avgSalary: 0 },
      benefitsPct: 0,
    },
    inflationPct: 0,
    overrides: {},
  }
}

// ── The contract ──────────────────────────────────────────────────────────────

/**
 * Compute the driver budget. Pure, total, never throws. Money rounded to 2dp at
 * the boundary; KPI ratios returned as 0..1 fractions (UI formats as %).
 */
export function computeDriverBudget(
  assumptions: DriverAssumptions,
  prior: DriverPriorContext,
  options: ComputeDriverOptions = {},
): DriverBudgetResult {
  const overrides = assumptions.overrides ?? {}
  const inflation = 1 + num(assumptions.inflationPct) / 100
  const grow = (x: unknown): number => round2(num(x) * inflation)

  // ── Enrollment + tuition ────────────────────────────────────────────────
  let enrollmentTotal = 0
  let grossTuition = 0
  for (const g of GRADE_KEYS) {
    const e = num(assumptions.enrollmentByGrade?.[g])
    enrollmentTotal += e
    grossTuition += e * num(assumptions.tuitionRates?.[bandOf(g)])
  }
  grossTuition = round2(grossTuition)

  // Program split as normalized weights, residual-conserved so
  // parent+ftc+fes === grossTuition to the cent regardless of input sum.
  const sp = assumptions.tuitionProgramSplit ?? { parent: 100, ftc: 0, fes: 0 }
  const wSum = num(sp.parent) + num(sp.ftc) + num(sp.fes)
  let pParent: number
  let pFtc: number
  let pFes: number
  if (wSum > 0) {
    pParent = round2((grossTuition * num(sp.parent)) / wSum)
    pFtc = round2((grossTuition * num(sp.ftc)) / wSum)
    pFes = round2(grossTuition - pParent - pFtc) // residual absorbs rounding
  } else {
    // Degenerate split → all parent (never NaN).
    pParent = grossTuition
    pFtc = 0
    pFes = 0
  }

  const fees = round2(num(assumptions.feePerStudent) * enrollmentTotal)
  const tuition = round2(grossTuition + fees)

  // ── Salaries + benefits ──────────────────────────────────────────────────
  const st = assumptions.staffing
  const teacherSal = round2(num(st?.teachers?.count) * num(st?.teachers?.avgSalary))
  const adminSal = round2(num(st?.admin?.count) * num(st?.admin?.avgSalary))
  const facilSal = round2(num(st?.facilities?.count) * num(st?.facilities?.avgSalary))
  const salariesTotal = round2(teacherSal + adminSal + facilSal)
  const benefits = round2((salariesTotal * num(st?.benefitsPct)) / 100)

  // ── Revenue categories ────────────────────────────────────────────────────
  const revenue = {} as Record<RevenueKey, number>
  for (const k of REVENUE_LINE_KEYS) {
    if (k === 'tuition') {
      revenue[k] = tuition
      continue
    }
    // Non-driver revenue: override wins, else grown prior.
    revenue[k] =
      overrides[k] !== undefined ? round2(num(overrides[k])) : grow(prior.priorRevenue?.[k])
  }

  // ── Expense categories ────────────────────────────────────────────────────
  const expense = {} as Record<ExpenseKey, number>
  for (const k of EXPENSE_LINE_KEYS) {
    if (DRIVER_EXPENSE_KEYS.has(k)) {
      // Driver category = salary/benefit term + non-salary supplement (override; default 0).
      const supplement = overrides[k] !== undefined ? round2(num(overrides[k])) : 0
      let base = 0
      if (k === 'instructional') base = teacherSal
      else if (k === 'admin') base = adminSal
      else if (k === 'facilities') base = facilSal
      else if (k === 'fixedOther') base = benefits
      expense[k] = round2(base + supplement)
      continue
    }
    // Non-driver expense: override wins, else grown prior.
    expense[k] =
      overrides[k] !== undefined ? round2(num(overrides[k])) : grow(prior.priorExpense?.[k])
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalRevenue = round2(
    (Object.values(revenue) as number[]).reduce((s, v) => s + v, 0),
  )
  const totalExpense = round2(
    (Object.values(expense) as number[]).reduce((s, v) => s + v, 0),
  )
  const netIncome = round2(totalRevenue - totalExpense)

  const kpis = {
    enrollmentTotal,
    costPerPupil: enrollmentTotal > 0 ? round2(totalExpense / enrollmentTotal) : null,
    netTuitionPerStudent: enrollmentTotal > 0 ? round2(tuition / enrollmentTotal) : null,
    salariesPctOfExpense: totalExpense > 0 ? salariesTotal / totalExpense : null,
    netTuitionPctOfRevenue: totalRevenue > 0 ? tuition / totalRevenue : null,
    totalRevenue,
    totalExpense,
    netIncome,
  }

  const result: DriverBudgetResult = {
    revenue,
    expense,
    detail: {
      grossTuition,
      tuitionByProgram: { parent: pParent, ftc: pFtc, fes: pFes },
      fees,
      salaries: {
        teachers: teacherSal,
        admin: adminSal,
        facilities: facilSal,
        total: salariesTotal,
      },
      benefits,
    },
    kpis,
  }

  if (options.includeMonths) {
    const mRev = {} as Record<RevenueKey, number[]>
    for (const k of REVENUE_LINE_KEYS) mRev[k] = evenMonths(revenue[k])
    const mExp = {} as Record<ExpenseKey, number[]>
    for (const k of EXPENSE_LINE_KEYS) mExp[k] = evenMonths(expense[k])
    result.months = { revenue: mRev, expense: mExp }
  }

  return result
}
