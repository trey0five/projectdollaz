import { Injectable } from '@nestjs/common'
import {
  bandsFor,
  formatMetricValue,
  getMetric,
  healthStatus,
  isMetricKey,
  METRIC_KEYS,
  resolveDisplayUnit,
  type MetricKey,
  type MetricUnit,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { StrategyProgressService } from './strategy-progress.service.js'
import { MIX_METRIC_KEYS } from './strategy.constants.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 Strategic Planning v2 — "Penny drafts the plan".
//
// DETERMINISTIC draft generator. NO LLM: every number AND every string comes from
// the rule layer + the canonical @finrep/analytics registry. This is what makes the
// draft VALUE-SAFE (each metric goal's current/target is the ONE dashboard value,
// byte-identical to the analytics dashboard) and REPRODUCIBLE (same school + clock →
// same tree). LLM prose-polish (mission/title wording) is deliberately DEFERRED.
//
// BOOT-SAFETY (the #1 crash-loop risk on this feature class — "Cannot access 'X'
// before initialization"): this service injects **PrismaService + StrategyProgressService
// + the PURE @finrep/analytics functions ONLY**. It NEVER injects AnalyticsService /
// OperationalService / InsightService / BriefingService. It rides the existing acyclic
// StrategyModule (which imports no AnalyticsModule) — no new module edge.
//
// The output is the FROZEN §SEAM tree (the LOCKED CONTRACT): a display-rich draft the
// Penny confirm-card renders directly and the apply path creates. Percent/share
// `targetValue` is a RAW 0..1 fraction (never ×100). Display fields (metricLabel/
// formatted*/bandStatus/unit) are precomputed here (server formats once) and IGNORED
// by the create path.
// ─────────────────────────────────────────────────────────────────────────────

/** One drafted goal (§SEAM). Metric goals carry the binding + precomputed display. */
export interface DraftGoal {
  title: string
  goalType: 'metric' | 'milestone'
  /** metric goals only — a canonical single-value banded key (never a mix key). */
  metricKey?: string
  /** metric goals only — RAW 0..1 for fraction (percent/share) metrics. */
  targetValue?: number
  /** metric goals only — fyEnd(fyEndYear) as yyyy-mm-dd. */
  targetDate?: string
  /** milestone goals only — [{label}]; metric goals: null. */
  milestones?: { label: string }[] | null
  /** Grounded, quotes current→target (metric goals). */
  rationale: string | null
  orderIndex: number
  // ── DISPLAY-ONLY (card reads these; the create path ignores them) ──
  metricLabel?: string | null
  formattedCurrent?: string | null
  formattedTarget?: string | null
  /** 'watch' | 'risk' (metric goals only). */
  bandStatus?: string | null
  unit?: string | null
}

/** One drafted pillar (§SEAM). ONLY pillars with ≥1 goal are emitted. */
export interface DraftPillar {
  name: string
  description: string | null
  orderIndex: number
  goals: DraftGoal[]
}

/** The FROZEN §SEAM draft tree the confirm-card renders + the apply path creates. */
export interface DraftPlanTree {
  name: string
  mission: string | null
  fyStartYear: number
  fyEndYear: number
  /** The metric period end (for the trust banner) | null. */
  dataAsOf: string | null
  /** true = milestone-only (no live financials yet). */
  isStarter: boolean
  pillars: DraftPillar[]
  counts: { pillars: number; goals: number }
}

export interface DraftOptions {
  /** Plan horizon in fiscal years (clamped 1..5). Default 3. */
  horizonYears?: number
  name?: string
  mission?: string
  fyStartYear?: number
  fyEndYear?: number
  /** Free-text steer (e.g. "lean into enrollment growth"). Accepted; deterministic
   *  v1 does not branch on it — LLM-steered drafting is DEFERRED. */
  focus?: string
}

/** The fixed pillar → candidate-metric map (drop empties). Candidates are the BANDED
 *  bindable keys only; the 5 unbanded bindable keys get NO auto-target (never invent a
 *  $ target). enrollment_vs_plan is banded but needs a plan threaded to compute (not
 *  available here) → excluded from the candidate set. */
const PILLAR_METRICS: { name: string; keys: MetricKey[] }[] = [
  {
    name: 'Financial Sustainability',
    keys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'tuition_discount_rate',
    ],
  },
  { name: 'Enrollment & Program', keys: ['enrollment_change_yoy'] },
  { name: 'People & Culture', keys: ['student_teacher_ratio'] },
]

/** Deterministic goal titles per metric (direction-aware). Falls back to a generic. */
const GOAL_TITLE: Partial<Record<string, (target: string) => string>> = {
  operating_margin: (t) => `Reach a ${t} operating margin`,
  days_cash_on_hand: (t) => `Reach ${t} days cash on hand`,
  months_operating_reserve: (t) => `Build ${t} months of operating reserve`,
  tuition_dependency: (t) => `Reduce tuition dependency to ${t}`,
  tuition_discount_rate: (t) => `Bring the tuition discount rate to ${t}`,
  enrollment_change_yoy: () => 'Return enrollment to year-over-year growth',
  student_teacher_ratio: (t) => `Reach a ${t} student–teacher ratio`,
}

/** Optional milestone goals that ride EXISTING (non-empty) pillars — capped at 2 total,
 *  in pillar order. Milestones carry NO numbers, so they are always value-safe. */
const PILLAR_MILESTONE: Record<string, DraftGoal> = {
  'Financial Sustainability': {
    title: 'Establish a quarterly financial review cadence',
    goalType: 'milestone',
    milestones: [
      { label: 'Adopt the plan with the board' },
      { label: 'Set quarterly review dates' },
      { label: 'Assign an owner to each metric goal' },
    ],
    rationale: null,
    orderIndex: 0,
  },
  'Enrollment & Program': {
    title: 'Launch an enrollment retention initiative',
    goalType: 'milestone',
    milestones: [
      { label: 'Analyze attrition by grade' },
      { label: 'Define a re-enrollment campaign' },
      { label: 'Set a retention target' },
    ],
    rationale: null,
    orderIndex: 0,
  },
}

/** yyyy-mm-dd for FY end (Jun 30 of fyEndYear) — Jul–Jun fiscal year. */
function fyEndIso(fyEndYear: number): string {
  return `${fyEndYear}-06-30`
}

/** yyyy-mm-dd for a Date (no timezone drift), or null. */
function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/** The FY (Jul–Jun) a date falls in: month >= July → this calendar year, else prior. */
function currentFyStartYear(d: Date): number {
  const y = d.getUTCFullYear()
  return d.getUTCMonth() >= 6 ? y : y - 1
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** METRIC_KEYS index for deterministic ordering (unknown → end). */
const METRIC_KEY_ORDER = new Map<string, number>(METRIC_KEYS.map((k, i) => [k, i]))

@Injectable()
export class StrategyPlanDrafterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: StrategyProgressService,
  ) {}

  /**
   * Draft a full strategic plan for a school from its LIVE metrics. Deterministic,
   * read-only (NO writes). Returns the frozen §SEAM tree; SELF-VALIDATES fail-closed
   * (a malformed/empty tree falls back to a milestone-only starter — never a
   * fabricated number, never an unusable tree).
   */
  async draft(schoolId: string, opts: DraftOptions = {}): Promise<DraftPlanTree> {
    const now = new Date()
    const horizon = clamp(
      Number.isFinite(opts.horizonYears) ? Math.trunc(opts.horizonYears as number) : 3,
      1,
      5,
    )
    const fyStartYear = this.clampYear(opts.fyStartYear) ?? currentFyStartYear(now)
    let fyEndYear = this.clampYear(opts.fyEndYear) ?? fyStartYear + horizon - 1
    if (fyEndYear < fyStartYear) fyEndYear = fyStartYear

    const name =
      typeof opts.name === 'string' && opts.name.trim()
        ? opts.name.trim().slice(0, 200)
        : `FY${fyStartYear}–FY${fyEndYear} Strategic Plan`
    const mission =
      typeof opts.mission === 'string' && opts.mission.trim()
        ? opts.mission.trim().slice(0, 4000)
        : `Sustain the school's financial health while strengthening enrollment, program, and people through FY${fyStartYear}–FY${fyEndYear}.`

    // ── Resolve the school's live metrics ONCE (one-period-one-compute) ──────────
    const metrics = await this.progress.resolveCurrentMetrics(schoolId)
    if (!metrics) {
      // Empty school (no snapshot) → milestone-only STARTER (never a fabricated number).
      return this.starterTree(name, mission, fyStartYear, fyEndYear, null)
    }
    const dataAsOf = isoDate(metrics.date)

    // ── Build metric goals per fixed pillar (drop empties) ───────────────────────
    const targetDate = fyEndIso(fyEndYear)
    const pillars: DraftPillar[] = []
    for (const spec of PILLAR_METRICS) {
      const goals: { goal: DraftGoal; status: string; order: number }[] = []
      for (const key of spec.keys) {
        const goal = this.buildMetricGoal(key, metrics.byKey.get(key), targetDate, fyEndYear)
        if (goal) {
          goals.push({ goal, status: goal.bandStatus ?? 'watch', order: METRIC_KEY_ORDER.get(key) ?? 999 })
        }
      }
      if (goals.length === 0) continue
      // Risk-before-watch, then METRIC_KEYS order — deterministic.
      goals.sort((a, b) => {
        const ra = a.status === 'risk' ? 0 : 1
        const rb = b.status === 'risk' ? 0 : 1
        if (ra !== rb) return ra - rb
        return a.order - b.order
      })
      pillars.push({
        name: spec.name,
        description: null,
        orderIndex: pillars.length,
        goals: goals.map((g, i) => ({ ...g.goal, orderIndex: i })),
      })
    }

    // ── Round the plan out with 1–2 milestone goals on EXISTING pillars (cap 2) ───
    let milestonesAdded = 0
    for (const pil of pillars) {
      if (milestonesAdded >= 2) break
      const tmpl = PILLAR_MILESTONE[pil.name]
      if (!tmpl) continue
      pil.goals.push({ ...tmpl, orderIndex: pil.goals.length })
      milestonesAdded += 1
    }

    const tree: DraftPlanTree = {
      name,
      mission,
      fyStartYear,
      fyEndYear,
      dataAsOf,
      isStarter: false,
      pillars,
      counts: this.countTree(pillars),
    }

    // SELF-VALIDATE (fail-closed): a malformed/empty tree → milestone-only starter.
    if (!this.isValidTree(tree)) {
      return this.starterTree(name, mission, fyStartYear, fyEndYear, dataAsOf)
    }
    return tree
  }

  /** Clamp a client-supplied FY year to the DTO's 2000..2100 window, or undefined. */
  private clampYear(y: number | undefined): number | undefined {
    if (typeof y !== 'number' || !Number.isFinite(y)) return undefined
    const v = Math.trunc(y)
    if (v < 2000 || v > 2100) return undefined
    return v
  }

  /**
   * Build ONE metric goal from a live MetricResult, or null when the metric is
   * unavailable OR already healthy (status 'good'). targetValue = bands.good (the
   * DIRECTION is encoded by the band — RAISE days_cash / LOWER discount_rate — no sign
   * math). Percent/share targets stay RAW 0..1. Display fields precomputed here.
   */
  private buildMetricGoal(
    key: MetricKey,
    result: { available: boolean; value: number | null } | undefined,
    targetDate: string,
    fyEndYear: number,
  ): DraftGoal | null {
    const bands = bandsFor(key)
    if (!bands) return null // never a candidate without a band
    if (!result || !result.available || result.value === null) return null // unavailable → skip
    const current = result.value
    const status = healthStatus(current, bands, true)
    if (status === 'good') return null // already healthy → no goal

    const def = getMetric(key)
    const displayUnit: MetricUnit = resolveDisplayUnit(key, def.unit)
    const targetValue = bands.good // raw (0..1 for fractions; natural unit otherwise)
    const formattedCurrent = formatMetricValue(current, displayUnit)
    const formattedTarget = formatMetricValue(targetValue, displayUnit)
    const title = (GOAL_TITLE[key] ?? ((t: string) => `Improve ${def.label} to ${t}`))(formattedTarget)
    const thresholdWord = bands.goodDirection === 'higher' ? 'below' : 'above'
    const rationale = `${def.label} is ${formattedCurrent} today (${thresholdWord} the ${formattedTarget} healthy threshold); targets ${formattedTarget} by FY${fyEndYear}.`

    return {
      title,
      goalType: 'metric',
      metricKey: key,
      targetValue,
      targetDate,
      milestones: null,
      rationale,
      orderIndex: 0,
      metricLabel: def.label,
      formattedCurrent,
      formattedTarget,
      bandStatus: status, // 'watch' | 'risk'
      unit: displayUnit,
    }
  }

  /** A milestone-only starter plan — one pillar, one setup goal (no numbers at all). */
  private starterTree(
    name: string,
    mission: string | null,
    fyStartYear: number,
    fyEndYear: number,
    dataAsOf: string | null,
  ): DraftPlanTree {
    const pillars: DraftPillar[] = [
      {
        name: 'Financial Foundations',
        description: null,
        orderIndex: 0,
        goals: [
          {
            title: 'Connect your financials to compute live targets',
            goalType: 'milestone',
            milestones: [
              { label: 'Connect QuickBooks or import a trial balance' },
              { label: 'Add enrollment & staffing figures' },
              { label: "Review Penny's computed goal targets" },
            ],
            rationale: null,
            orderIndex: 0,
          },
        ],
      },
    ]
    return {
      name,
      mission,
      fyStartYear,
      fyEndYear,
      dataAsOf,
      isStarter: true,
      pillars,
      counts: this.countTree(pillars),
    }
  }

  private countTree(pillars: DraftPillar[]): { pillars: number; goals: number } {
    let goals = 0
    for (const p of pillars) goals += p.goals.length
    return { pillars: pillars.length, goals }
  }

  /**
   * Fail-closed self-validation. Rejects a tree that would create a doomed/unsafe plan:
   * empty pillars, an empty pillar, a bad FY order, a non-metric-key binding, a mix
   * key, a non-finite target, or a fraction target outside 0..1.
   */
  private isValidTree(tree: DraftPlanTree): boolean {
    if (tree.fyEndYear < tree.fyStartYear) return false
    if (tree.pillars.length === 0) return false
    for (const pil of tree.pillars) {
      if (pil.goals.length === 0) return false
      for (const g of pil.goals) {
        if (g.goalType === 'metric') {
          const key = g.metricKey
          if (!key || !isMetricKey(key)) return false
          if ((MIX_METRIC_KEYS as readonly string[]).includes(key)) return false
          if (typeof g.targetValue !== 'number' || !Number.isFinite(g.targetValue)) return false
          const unit = getMetric(key).unit
          if ((unit === 'percent' || unit === 'share') && (g.targetValue < 0 || g.targetValue > 1)) {
            return false
          }
          if (!g.targetDate) return false
        } else if (g.goalType === 'milestone') {
          if (!Array.isArray(g.milestones) || g.milestones.length === 0) return false
        } else {
          return false
        }
      }
    }
    return true
  }
}
