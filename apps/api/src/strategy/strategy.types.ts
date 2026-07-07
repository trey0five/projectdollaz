// The FROZEN COMPUTED payload shape (the LOCKED CONTRACT). Returned byte-shaped by
// BOTH `plans/:planId/progress` and `active/progress`; the `summary` block feeds the
// briefing STEP 2.13 + Penny get_plan_status. Do NOT rename a field — the web
// engineer codes against these exact names. Fractions are 0..1 (web ×100 for
// display); every money/metric Decimal is coerced to a JS number server-side.
import type { PaceStatus } from './strategy-progress.js'
import type { InitiativeStatus } from './strategy.constants.js'

export interface GoalCounts {
  total: number
  onTrack: number
  atRisk: number
  behind: number
  achieved: number
  noData: number
}

export interface InitiativeStatusCounts {
  planned: number
  in_progress: number
  blocked: number
  done: number
  cancelled: number
}

export interface TrendPoint {
  date: string
  value: number | null
  expected: number | null
}

export interface MilestoneView {
  id: string
  label: string
  done: boolean
}

export interface GoalComputed {
  id: string
  title: string
  description: string | null
  goalType: string
  orderIndex: number
  owner: { userId: string; name: string } | null
  metricKey: string | null
  metricLabel: string | null
  unit: string | null
  baseline: number | null
  current: number | null
  target: number | null
  formattedBaseline: string | null
  formattedCurrent: string | null
  formattedTarget: string | null
  pctToTarget: number | null
  expectedPct: number | null
  paceStatus: PaceStatus
  bandStatus: string | null
  overshoot: boolean
  startDate: string | null
  targetDate: string | null
  trend: TrendPoint[]
  dataAsOf: string | null
  initiativeCount: number
  initiativeStatusCounts: InitiativeStatusCounts
  linkedTaskCounts: { total: number; done: number } | null
  milestones: MilestoneView[] | null
  manualProgressPct: number | null
}

export interface PillarComputed {
  id: string
  name: string
  description: string | null
  orderIndex: number
  progressPct: number | null
  paceStatus: PaceStatus
  goalCounts: GoalCounts
  goals: GoalComputed[]
}

export interface BehindPaceGoal {
  title: string
  pillar: string
  metricKey: string | null
  metricLabel: string | null
  formattedCurrent: string | null
  formattedTarget: string | null
  targetDate: string | null
}

export interface StaleInitiativeView {
  title: string
  ownerName: string | null
  status: InitiativeStatus | string
  staleDays: number
}

export interface StrategySummary {
  overallProgressPct: number | null
  overallPaceStatus: PaceStatus
  behindPaceGoalCount: number
  atRiskGoalCount: number
  staleInitiativeCount: number
  reviewDueThisMonth: boolean
  nextReviewDate: string | null
  behindPaceGoals: BehindPaceGoal[]
  staleInitiatives: StaleInitiativeView[]
}

export interface PlanComputed {
  id: string
  name: string
  mission: string | null
  status: string
  fyStartYear: number
  fyEndYear: number
  startDate: string | null
  endDate: string | null
  adoptedAt: string | null
  nextReviewDate: string | null
  overallProgressPct: number | null
  overallPaceStatus: PaceStatus
  goalCounts: GoalCounts
  dataAsOf: string | null
}

export interface StrategyProgressPayload {
  hasPlan: true
  plan: PlanComputed
  summary: StrategySummary
  pillars: PillarComputed[]
}

export interface NoPlanPayload {
  hasPlan: false
}

export type StrategyComputed = StrategyProgressPayload | NoPlanPayload
