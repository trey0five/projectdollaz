import { describe, expect, it } from 'vitest'
import { StrategyPlanDrafterService } from './strategy-plan-drafter.service.js'
import type { DraftGoal, DraftPlanTree } from './strategy-plan-drafter.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// StrategyPlanDrafterService — the DETERMINISTIC "Penny drafts the plan" generator.
// Verifies (WITHOUT booting Nest/Prisma) that band-derived targets, direction, skip
// rules, the empty-school starter, percent-stays-0..1, and self-validation all hold.
// The only collaborator that touches IO is StrategyProgressService.resolveCurrentMetrics,
// which we stub with a fake metric map.
// ─────────────────────────────────────────────────────────────────────────────

/** Build a fake MetricResult-ish entry (only the fields the drafter reads). */
const m = (value: number | null, available = true) => ({ available, value })

/** A drafter wired to a fixed resolveCurrentMetrics result. */
function makeDrafter(
  metrics: { periodId: string; date: Date; byKey: Map<string, { available: boolean; value: number | null }> } | null,
) {
  const progress = {
    resolveCurrentMetrics: async () => metrics,
  }
  return new StrategyPlanDrafterService({} as never, progress as never)
}

/** Flatten every goal in a tree. */
function allGoals(tree: DraftPlanTree): DraftGoal[] {
  return tree.pillars.flatMap((p) => p.goals)
}
function metricGoal(tree: DraftPlanTree, key: string): DraftGoal | undefined {
  return allGoals(tree).find((g) => g.goalType === 'metric' && g.metricKey === key)
}

const DATE = new Date('2026-06-30T00:00:00.000Z')

describe('StrategyPlanDrafterService.draft — band-derived targets + direction', () => {
  it('days_cash risk → target 60 (raise), discount_rate risk → target 0.20 (lower)', async () => {
    const byKey = new Map<string, { available: boolean; value: number | null }>([
      ['days_cash_on_hand', m(20)], // below the 30 risk frontier → risk (higher-is-better)
      ['tuition_discount_rate', m(0.4)], // above 0.35 risk frontier → risk (lower-is-better)
    ])
    const tree = await makeDrafter({ periodId: 'p1', date: DATE, byKey }).draft('s1', { fyStartYear: 2026, fyEndYear: 2028 })

    const cash = metricGoal(tree, 'days_cash_on_hand')
    expect(cash?.targetValue).toBe(60)
    expect(cash?.targetDate).toBe('2028-06-30')
    expect(cash?.bandStatus).toBe('risk')
    expect(cash?.formattedCurrent).toBe('20')
    expect(cash?.formattedTarget).toBe('60')
    expect(cash?.rationale).toContain('below')

    const disc = metricGoal(tree, 'tuition_discount_rate')
    expect(disc?.targetValue).toBe(0.2) // RAW 0..1, never ×100
    expect(disc?.bandStatus).toBe('risk')
    expect(disc?.rationale).toContain('above')
  })

  it('a percent/share target stays a RAW 0..1 fraction', async () => {
    const byKey = new Map([['operating_margin', m(-0.02)]]) // below 0.03 good → risk
    const tree = await makeDrafter({ periodId: 'p1', date: DATE, byKey }).draft('s1')
    const goal = metricGoal(tree, 'operating_margin')
    expect(goal?.targetValue).toBe(0.03)
    expect(goal!.targetValue!).toBeLessThanOrEqual(1)
    expect(goal?.formattedTarget).toBe('3.0%')
  })
})

describe('StrategyPlanDrafterService.draft — skip rules', () => {
  it('skips a metric that is already good', async () => {
    const byKey = new Map([['days_cash_on_hand', m(120)]]) // >= 60 → good
    const tree = await makeDrafter({ periodId: 'p1', date: DATE, byKey }).draft('s1')
    expect(metricGoal(tree, 'days_cash_on_hand')).toBeUndefined()
    // All metrics good → no metric goals → falls back to the starter (never empty).
    expect(tree.isStarter).toBe(true)
  })

  it('skips an unavailable metric (no target invented)', async () => {
    const byKey = new Map<string, { available: boolean; value: number | null }>([
      ['days_cash_on_hand', m(null, false)], // unavailable
      ['operating_margin', m(-0.05)], // risk → yields a goal
    ])
    const tree = await makeDrafter({ periodId: 'p1', date: DATE, byKey }).draft('s1')
    expect(metricGoal(tree, 'days_cash_on_hand')).toBeUndefined()
    expect(metricGoal(tree, 'operating_margin')).toBeDefined()
    expect(tree.isStarter).toBe(false)
  })
})

describe('StrategyPlanDrafterService.draft — structure + self-validation', () => {
  it('empty school (no metrics) → milestone-only starter', async () => {
    const tree = await makeDrafter(null).draft('s1', { fyStartYear: 2026, fyEndYear: 2028 })
    expect(tree.isStarter).toBe(true)
    expect(tree.dataAsOf).toBeNull()
    const goals = allGoals(tree)
    expect(goals.length).toBeGreaterThan(0)
    expect(goals.every((g) => g.goalType === 'milestone')).toBe(true)
    // A milestone-only tree carries NO fabricated numbers.
    expect(goals.every((g) => g.metricKey === undefined)).toBe(true)
  })

  it('only emits non-empty pillars and produces valid counts + FY-derived name', async () => {
    const byKey = new Map<string, { available: boolean; value: number | null }>([
      ['days_cash_on_hand', m(43)], // Financial Sustainability → watch (above the 30 risk floor, below the 60 good target)
      ['student_teacher_ratio', m(20)], // People & Culture, above 16 → risk
      ['enrollment_change_yoy', m(0.05)], // >= 0 good → skipped (Enrollment pillar drops)
    ])
    const tree = await makeDrafter({ periodId: 'p1', date: DATE, byKey }).draft('s1', {
      fyStartYear: 2026,
      fyEndYear: 2028,
    })
    const pillarNames = tree.pillars.map((p) => p.name)
    expect(pillarNames).toContain('Financial Sustainability')
    expect(pillarNames).toContain('People & Culture')
    expect(pillarNames).not.toContain('Enrollment & Program') // empty → dropped
    expect(tree.pillars.every((p) => p.goals.length > 0)).toBe(true)
    expect(tree.counts.pillars).toBe(tree.pillars.length)
    expect(tree.counts.goals).toBe(allGoals(tree).length)
    expect(tree.name).toBe('FY2026–FY2028 Strategic Plan')
    expect(tree.dataAsOf).toBe('2026-06-30')
  })

  it('orders goals risk-before-watch within a pillar', async () => {
    const byKey = new Map<string, { available: boolean; value: number | null }>([
      ['operating_margin', m(0.01)], // between 0 and 0.03 → watch
      ['days_cash_on_hand', m(20)], // below 30 → risk
    ])
    const tree = await makeDrafter({ periodId: 'p1', date: DATE, byKey }).draft('s1')
    const fin = tree.pillars.find((p) => p.name === 'Financial Sustainability')!
    expect(fin.goals[0].bandStatus).toBe('risk')
    expect(fin.goals[0].metricKey).toBe('days_cash_on_hand')
  })
})
