import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { getMetric, type PeriodOperational } from '@finrep/analytics'
import { EnrollmentAnalyticsService } from './enrollment-analytics.service.js'
import { EnrollmentAnalyticsQueryDto } from './dto/enrollment-analytics.dto.js'
import { loneHiddenCellViolations } from '../students/aggregate-suppression.testkit.js'

// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentAnalyticsService — asserted against the codebase's own canonical
// fixture: 436 students in grades 9-12. That number is not arbitrary. The DTO
// records a real incident where 436 was entered as 1,200 and moved cost-per-pupil
// from $8,683 to $23,899, which is exactly why this page's job is to make one
// number reachable from three different reads and prove they agree.
//
// These assert VALUES, not shapes. A shape test passes when every figure on the
// page is wrong in the same way.
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL = 'a3e1b6f0-0000-4000-8000-000000000001'
const PERIOD = {
  id: 'b3e1b6f0-0000-4000-8000-000000000002',
  label: 'FY2026',
  periodEndDate: new Date('2026-06-30T00:00:00.000Z'),
  schoolId: SCHOOL,
}

/** The seed: 118 + 112 + 108 + 98 = 436, grades 9-12 only. */
const SEED_BY_GRADE = { '9': 118, '10': 112, '11': 108, '12': 98 }
const SEED_TOTAL = 436

/** The plan the school budgeted for the same year: 120+115+110+105 = 450. */
const SEED_PLAN_BY_GRADE = { '9': 120, '10': 115, '11': 110, '12': 105 }
const SEED_PLAN_TOTAL = 450

interface SnapRow {
  observedOn: string
  provider: string
  totalEnrolled: number
  byGrade: Record<string, number>
}

const snap = (observedOn: string, byGrade: Record<string, number>, provider = 'oneroster_csv'): SnapRow => ({
  observedOn,
  provider,
  totalEnrolled: Object.values(byGrade).reduce((a, b) => a + b, 0),
  byGrade,
})

interface Opts {
  snapshots?: SnapRow[]
  /** The current period's operational row; null => no tiles. */
  operational?: Record<string, unknown> | null
  /** The nearest-prior period's operational row (drives YoY + PoP deltas). */
  priorOperational?: (Record<string, unknown> & { fiscalPeriod?: { label: string } }) | null
  plan?: { planTotal: number; planByGrade: Record<string, number>; netRate: number | null; source: 'driver_budget' | 'planned_by_grade' } | null
  planFailed?: boolean
  planThrows?: boolean
  source?: 'roster' | 'snapshot'
  entitled?: Record<string, boolean>
  demographics?: Record<string, unknown> | null
  aggregate?: Record<string, unknown> | null
  studentCounts?: { withStartDate: number; total: number }
  period?: typeof PERIOD | null
  /**
   * Override what summary() answers, independently of the filed snapshots — the
   * roster-mode case where the live register is AHEAD of the last sync.
   */
  currentReading?: { observedOn: string; byGrade: Record<string, number> }
}

function makeService(opts: Opts) {
  const snapshots = opts.snapshots ?? [snap('2025-09-15', SEED_BY_GRADE)]
  const latest = snapshots[snapshots.length - 1]
  const source = opts.source ?? 'snapshot'
  const period = opts.period === undefined ? PERIOD : opts.period

  const prisma = {
    fiscalPeriod: { findFirst: vi.fn(async () => period) },
    enrollmentSnapshot: {
      findMany: vi.fn(async () =>
        snapshots.map((s) => ({
          observedOn: new Date(`${s.observedOn}T00:00:00.000Z`),
          provider: s.provider,
          totalEnrolled: s.totalEnrolled,
          byGrade: s.byGrade,
        })),
      ),
    },
    periodOperationalData: {
      findUnique: vi.fn(async () => opts.operational ?? null),
      findFirst: vi.fn(async () => opts.priorOperational ?? null),
    },
    student: {
      count: vi.fn(async (args: { where: { enrolledOn?: unknown } }) =>
        args.where.enrolledOn ? (opts.studentCounts?.withStartDate ?? 0) : (opts.studentCounts?.total ?? 0),
      ),
    },
  }

  const periods = {
    getOwnedPeriod: vi.fn(async () => period),
    resolveExistingForImport: vi.fn(async () => period),
  }
  const billing = {
    isEntitledForModule: vi.fn(async (_s: string, m: string) => opts.entitled?.[m] ?? true),
  }
  const reading = opts.currentReading
    ? snap(opts.currentReading.observedOn, opts.currentReading.byGrade, 'roster')
    : latest
  const enrollment = {
    summary: vi.fn(async () => ({
      latest: reading
        ? { observedOn: reading.observedOn, totalEnrolled: reading.totalEnrolled, byGrade: reading.byGrade }
        : null,
      vsPlan: null,
      provider: reading?.provider ?? null,
      supersededManual: null,
      source,
    })),
    demographics: vi.fn(async () => opts.demographics ?? null),
  }
  const students = { aggregate: vi.fn(async () => opts.aggregate ?? null) }
  const plan = {
    resolveDetailed: vi.fn(async () => {
      if (opts.planThrows) throw new Error('db down')
      return { plan: opts.plan ?? null, failed: opts.planFailed ?? false }
    }),
  }

  const svc = Object.create(EnrollmentAnalyticsService.prototype) as EnrollmentAnalyticsService
  const priv = svc as unknown as Record<string, unknown>
  priv.prisma = prisma
  priv.periods = periods
  priv.billing = billing
  priv.enrollment = enrollment
  priv.students = students
  priv.plan = plan
  return { svc, prisma, plan, billing }
}

const run = (opts: Opts, query: EnrollmentAnalyticsQueryDto = {}) =>
  makeService(opts).svc.analytics(SCHOOL, query)

/** The operational row for the seed year, as Prisma would hand it over. */
const seedOperational = (enrollment: number | null = SEED_TOTAL) => ({
  enrollment,
  enrollmentFte: null,
  studentsOnAid: null,
  financialAidTotal: null,
  teachingFte: 32,
  totalStaffFte: 48,
})

const seedPlan = {
  planTotal: SEED_PLAN_TOTAL,
  planByGrade: SEED_PLAN_BY_GRADE,
  netRate: 9000,
  source: 'driver_budget' as const,
}

// ── ONE NUMBER, THREE READS ──────────────────────────────────────────────────

describe('the headcount is ONE number reachable three ways', () => {
  it('the tile, the latest snapshot and the operational row all say 436', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })

    const tile = res.tiles.find((t) => t.key === 'enrollment_headcount')!
    expect(tile.available).toBe(true)
    // (1) the registry metric, computed off period_operational_data.enrollment
    expect(tile.value).toBe(SEED_TOTAL)
    // (2) the latest filed snapshot's total
    expect(res.ladder!.total).toBe(SEED_TOTAL)
    // (3) the grade grid, added up
    const gridTotal = res.gradeByYear!.cells.reduce((s, c) => s + (c.count.value ?? 0), 0)
    expect(gridTotal).toBe(SEED_TOTAL)
    // and the vs-plan table's own actual total
    expect(res.vsPlan!.totals.actual).toBe(SEED_TOTAL)
  })

  it('the headcount tile is NEUTRAL — size is not a grade', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.tiles.find((t) => t.key === 'enrollment_headcount')!.status).toBe('neutral')
  })

  it('only AVAILABLE tiles are returned — no row of em-dashes', async () => {
    // No plan and no prior year: vs-plan and YoY cannot resolve, so they are
    // absent rather than present-and-empty.
    const res = await run({ operational: seedOperational(), plan: null })
    expect(res.tiles.map((t) => t.key)).toEqual(['enrollment_headcount', 'student_teacher_ratio'])
    expect(res.tiles.every((t) => t.available)).toBe(true)
  })

  it('a school without the HR module loses the ratio tile, not the page', async () => {
    const res = await run({
      operational: seedOperational(),
      plan: seedPlan,
      entitled: { enrollment: true, hr: false },
    })
    expect(res.tiles.map((t) => t.key)).toEqual(['enrollment_headcount', 'enrollment_vs_plan'])
  })

  it('no operational row for the period => no tiles, and the page still renders', async () => {
    const res = await run({ operational: null, plan: seedPlan })
    expect(res.tiles).toEqual([])
    expect(res.ladder!.total).toBe(SEED_TOTAL)
  })
})

// ── THE GRADE GRID / LADDER ──────────────────────────────────────────────────

describe('the grade grid holds only grades the school HAS', () => {
  it('PK3..8 are ABSENT, not zeroed', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.gradeByYear!.grades).toEqual(['9', '10', '11', '12'])
    for (const absent of ['PK3', 'PK4', 'K', '1', '2', '3', '4', '5', '6', '7', '8']) {
      expect(res.gradeByYear!.cells.some((c) => c.grade === absent)).toBe(false)
      expect(res.ladder!.rows.some((r) => r.grade === absent)).toBe(false)
    }
  })

  it('grades come out in canonical order, never sorted by size', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.ladder!.rows.map((r) => r.grade)).toEqual(['9', '10', '11', '12'])
    // 12 is the smallest rung; a value-sorted ladder would have put it first.
    expect(res.ladder!.narrowestRung).toEqual({ grade: '12', count: 98 })
  })

  it('shares are computed server-side and add to 1', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    const shares = res.ladder!.rows.map((r) => r.share.value!)
    expect(shares[0]).toBeCloseTo(118 / 436, 12)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('one reading per DAY: a same-day roster sync replaces the morning import', async () => {
    // Both rows are dated 2025-09-15; the later-written one wins, and the day
    // appears once. Two points on one date would double-count that day in every
    // downstream total.
    const res = await run({
      snapshots: [
        snap('2025-09-15', { '9': 100, '10': 100 }, 'oneroster_csv'),
        snap('2025-09-15', SEED_BY_GRADE, 'roster'),
      ],
      operational: seedOperational(),
      plan: seedPlan,
    })
    expect(res.trend.points).toHaveLength(1)
    expect(res.trend.points[0]).toEqual({
      observedOn: '2025-09-15',
      total: SEED_TOTAL,
      provider: 'roster',
    })
  })

  it('trend points are DATED and carry the plan as a reference line', async () => {
    const res = await run({
      snapshots: [snap('2024-09-15', { '9': 110, '10': 110 }), snap('2025-09-15', SEED_BY_GRADE)],
      operational: seedOperational(),
      plan: seedPlan,
    })
    expect(res.trend.points.map((p) => p.observedOn)).toEqual(['2024-09-15', '2025-09-15'])
    expect(res.trend.planTotal).toBe(SEED_PLAN_TOTAL)
  })
})

// ── vs PLAN: the same arithmetic as the metric, or it is a bug ───────────────

describe('actual-vs-plan by grade', () => {
  it('the table total EQUALS the enrollment_vs_plan metric exactly', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    const tile = res.tiles.find((t) => t.key === 'enrollment_vs_plan')!

    // Independently: the registry's own compute on the same two inputs.
    const op: PeriodOperational = {
      enrollment: SEED_TOTAL,
      enrollmentPlan: SEED_PLAN_TOTAL,
      enrollmentFte: null,
      studentsOnAid: null,
      financialAidTotal: null,
      teachingFte: null,
      totalStaffFte: null,
    }
    // The registry def itself — no bundle needed, because enrollment_vs_plan
    // reads operational data only. This is the same call the service makes.
    const canonical = getMetric('enrollment_vs_plan').compute({} as never, undefined, op, undefined)

    // Not toBeCloseTo. The table and the tile are the SAME division; any
    // difference at all is a second implementation, not a rounding artifact.
    expect(res.vsPlan!.totals.gapPct).toBe(tile.value)
    expect(res.vsPlan!.totals.gapPct).toBe(canonical.value)
    expect(res.vsPlan!.totals.gap).toBe(SEED_TOTAL - SEED_PLAN_TOTAL)
    expect(res.vsPlan!.totals.gap).toBe(-14)
    // The table carries the tile's figure and states that they match, so a
    // reader never has to eyeball two percentages to find out.
    expect(res.vsPlan!.totals.tileGapPct).toBe(tile.value)
    expect(res.vsPlan!.totals.agreesWithTile).toBe(true)
  })

  it('when the register moved since the promote, the table SAYS it differs from the tile', async () => {
    // 435 promoted, 436 on the register: the tile divides 435 by the plan and
    // the table divides 436, and both are correct about different observations.
    // Live data produced exactly this — -3.33% over -3.11%.
    const res = await run({
      snapshots: [snap('2026-08-09', { '9': 118, '10': 112, '11': 105, '12': 100 })],
      currentReading: {
        observedOn: '2026-08-15',
        byGrade: { '9': 118, '10': 112, '11': 106, '12': 100 },
      },
      operational: seedOperational(435),
      plan: seedPlan,
    })
    const tile = res.tiles.find((t) => t.key === 'enrollment_vs_plan')!
    expect(tile.value).toBeCloseTo((435 - 450) / 450, 12)
    expect(res.vsPlan!.totals.actual).toBe(436)
    expect(res.vsPlan!.totals.gapPct).toBeCloseTo((436 - 450) / 450, 12)
    expect(res.vsPlan!.totals.agreesWithTile).toBe(false)
    // The rows still add up to the table's own total — a board table that does
    // not add up is worse than one that disagrees with a tile.
    const rowSum = res.vsPlan!.rows.reduce((t, r) => t + (r.actual.value ?? 0), 0)
    expect(rowSum).toBe(res.vsPlan!.totals.actual)
    expect(res.reconciliation!.diverged).toBe(true)
    expect(res.notes.some((n) => n.includes('why the tile and the vs-plan table differ'))).toBe(true)
  })

  it('names WHICH grades carry the miss, in canonical order', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.vsPlan!.rows.map((r) => [r.grade, r.gap.value])).toEqual([
      ['9', -2],
      ['10', -3],
      ['11', -2],
      ['12', -7],
    ])
    expect(res.vsPlan!.planSource).toBe('driver_budget')
    expect(res.vsPlan!.planFailed).toBe(false)
  })

  it('NO PLAN is an absence: vsPlan null, planFailed FALSE', async () => {
    const res = await run({ operational: seedOperational(), plan: null })
    expect(res.vsPlan).toBeNull()
    expect(res.planFailed).toBe(false)
    expect(res.notes.some((n) => n.includes('No enrollment plan has been entered'))).toBe(true)
  })

  it('a READ FAILURE is not an absence: planFailed TRUE, different copy', async () => {
    const res = await run({ operational: seedOperational(), plan: null, planFailed: true })
    expect(res.vsPlan).toBeNull()
    expect(res.planFailed).toBe(true)
    expect(res.notes.some((n) => n.includes('could not be read'))).toBe(true)
    expect(res.notes.some((n) => n.includes('No enrollment plan has been entered'))).toBe(false)
  })

  it('a THROWN plan read is caught and reported as a failure, never a 500', async () => {
    const res = await run({ operational: seedOperational(), planThrows: true })
    expect(res.planFailed).toBe(true)
    expect(res.vsPlan).toBeNull()
  })
})

// ── SUPPRESSION: the string-search gate ──────────────────────────────────────

/**
 * Strip every JSON string literal, then look for a bare `3` that is not part of a
 * longer number. Grade keys, dates and prose legitimately contain the character;
 * a masked COUNT would appear as a standalone numeric token, and that is the only
 * thing this may not find. A shape assertion would have passed while any one of
 * five readers serialised the raw map alongside the masked one.
 */
function leaksCount(body: unknown, n: number): boolean {
  const numbersOnly = JSON.stringify(body).replace(/"(\\.|[^"\\])*"/g, '""')
  return new RegExp(`(?<![\\d.])${n}(?![\\d.])`).test(numbersOnly)
}

describe('small-cell suppression', () => {
  const TINY_BY_GRADE = { '8': 3, '9': 118, '10': 112, '11': 108, '12': 98 }
  const TINY_PLAN = {
    planTotal: 461,
    planByGrade: { '8': 10, '9': 120, '10': 116, '11': 110, '12': 105 },
    netRate: null,
    source: 'planned_by_grade' as const,
  }
  const tiny = () =>
    run(
      {
        snapshots: [snap('2025-09-15', TINY_BY_GRADE)],
        operational: seedOperational(439),
        plan: TINY_PLAN,
      },
      { asOf: '2025-09-15' },
    )

  it('the raw 3 NEVER appears anywhere in the serialised body', async () => {
    const res = await tiny()
    // Sanity: the detector can see a number that IS present, so a green result
    // below means "absent", not "regex never matches anything".
    expect(leaksCount(res, 118)).toBe(true)
    expect(leaksCount(res, 3)).toBe(false)
  })

  it('the cell itself is blank and flagged, never zero and never interpolated', async () => {
    const res = await tiny()
    const g8 = res.ladder!.rows.find((r) => r.grade === '8')!
    expect(g8.count).toEqual({ value: null, suppressed: true })
    const gridCell = res.gradeByYear!.cells.find((c) => c.grade === '8')!
    expect(gridCell.count).toEqual({ value: null, suppressed: true })
  })

  it('the SHARE drops too — a masked count beside a live share is invertible', async () => {
    const res = await tiny()
    expect(res.ladder!.rows.find((r) => r.grade === '8')!.share).toEqual({
      value: null,
      suppressed: true,
    })
    // The unmasked rows keep theirs.
    expect(res.ladder!.rows.find((r) => r.grade === '9')!.share.value).toBeCloseTo(118 / 439, 12)
  })

  it('the PLAN and the GAP go with it — either one re-derives the actual', async () => {
    const res = await tiny()
    const row = res.vsPlan!.rows.find((r) => r.grade === '8')!
    expect(row.actual).toEqual({ value: null, suppressed: true })
    expect(row.plan).toEqual({ value: null, suppressed: true })
    expect(row.gap).toEqual({ value: null, suppressed: true })
    expect(row.gapPct).toEqual({ value: null, suppressed: true })
  })

  it('the narrowest-rung callout is WITHHELD — the smallest visible rung is not the smallest', async () => {
    const res = await tiny()
    expect(res.ladder!.narrowestRung).toBeNull()
    expect(res.ladder!.narrowestRungWithheldReason).toContain('not the smallest grade')
  })

  it('TOTALS still tell the truth — a whole-school figure identifies nobody', async () => {
    const res = await tiny()
    expect(res.ladder!.total).toBe(439)
    expect(res.vsPlan!.totals.actual).toBe(439)
    expect(res.vsPlan!.totals.plan).toBe(461)
  })

  it('the page says out loud that it is hiding something, and why', async () => {
    const res = await tiny()
    expect(res.notes.some((n) => n.includes('hidden because fewer than 5 students'))).toBe(true)
    expect(res.minCell).toBe(5)
  })
})

// ── COHORTS ──────────────────────────────────────────────────────────────────

describe('cohort size progression', () => {
  // SY2024 / SY2025 / SY2026 readings. Grade 10 is missing from SY2025 on
  // purpose, and grade 12 that year has 4 students (under the floor).
  const cohortSnaps = [
    snap('2023-09-15', { '9': 100, '11': 60 }),
    snap('2024-09-15', { '9': 102, '12': 4 }),
    snap('2025-09-15', { '11': 94 }),
  ]
  const cohorts = () =>
    run({ snapshots: cohortSnaps, operational: seedOperational(), plan: null }, { asOf: '2025-09-15' })

  it('a MISSING middle year keeps its slot as null and still nets from the ENDS', async () => {
    const res = await cohorts()
    const c = res.cohortSize!.cohorts.find((x) => x.id === 2015)!
    expect(c.legs.map((l) => [l.grade, l.schoolYear, l.count.value])).toEqual([
      ['9', 2024, 100],
      ['10', 2025, null], // no reading — a gap, not a zero
      ['11', 2026, 94],
    ])
    expect(c.legs[1].count.suppressed).toBe(false) // absent ≠ suppressed
    expect(c.netChange).toBe(-6)
    expect(c.direction).toBe('shrank')
    expect(c.label).toBe('Class of 2027')
  })

  it('a SUPPRESSED end makes netChange null — unknown minus a number is unknown', async () => {
    // The leavers' last year is on file but too small to publish. The panel is
    // still drawn — withholding a rung is a finding — and the net change is not.
    const res = await run(
      {
        snapshots: [snap('2024-09-15', { '11': 60 }), snap('2025-09-15', { '12': 4 })],
        operational: seedOperational(),
        plan: null,
      },
      { asOf: '2025-09-15' },
    )
    const c = res.cohortSize!.cohorts.find((x) => x.endGrade === '12')!
    expect(c.legs.map((l) => l.grade)).toEqual(['11', '12'])
    expect(c.legs[1].count).toEqual({ value: null, suppressed: true })
    expect(c.netChange).toBeNull()
    expect(c.direction).toBe('unknown')
  })

  it('a one-rung cohort is a dot, not a progression — it is dropped', async () => {
    const res = await cohorts()
    // SY2025's grade 9 (102 students) has no second reading yet.
    expect(res.cohortSize!.cohorts.some((c) => c.id === 2016)).toBe(false)
  })

  it('a move under the floor holds steady rather than claiming a direction', async () => {
    const res = await run(
      {
        snapshots: [snap('2023-09-15', { '9': 50 }), snap('2024-09-15', { '10': 51 })],
        operational: seedOperational(),
        plan: null,
      },
      { asOf: '2024-09-15' },
    )
    const c = res.cohortSize!.cohorts[0]
    expect(c.netChange).toBe(1)
    expect(c.direction).toBe('held')
  })

  it('ONE school year on file => no cohorts, and the page says why', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.cohortSize).toBeNull()
    expect(res.notes.some((n) => n.includes('Only one school year'))).toBe(true)
  })

  it('never LABELS itself retention — the only mention is the disclaimer', async () => {
    const res = await cohorts()
    // The explainer must say the word in order to deny it; no label, key or
    // direction anywhere else may. G9 118 → G10 112 is not "95% of those
    // children stayed": transfers in and out are invisible at this grain.
    expect(res.notes.some((n) => n.includes('not retention'))).toBe(true)
    // Scoped to the cohort payload: `unavailable` legitimately names TEACHER
    // retention as a thing we do not have, which is a different claim.
    expect(JSON.stringify(res.cohortSize).toLowerCase()).not.toContain('retention')
    expect(JSON.stringify(res.gradeByYear).toLowerCase()).not.toContain('retention')
  })
})

// ── COHORT LADDER LENGTH ─────────────────────────────────────────────────────
//
// The reader picks how many consecutive GRADES a panel follows, exactly as they
// do on the academics cohort view. The point of the control is comparability:
// every panel on screen must be the same length, or the short ones read as the
// steady ones. These assert the ENUMERATION (which ladders exist at a length),
// the CLAMP (a length the school cannot evidence is narrowed, and said so) and
// the invariant that survives all of it: legs.length === window, always.

describe('cohort ladder length', () => {
  const K8 = ['K', '1', '2', '3', '4', '5', '6', '7', '8']
  /** Five school years (SY2022..SY2026) of a full K-8 school. */
  const k8Snaps = ['2021-09-15', '2022-09-15', '2023-09-15', '2024-09-15', '2025-09-15'].map((d, i) =>
    snap(
      d,
      Object.fromEntries(K8.map((g, j) => [g, 40 + j + i])),
    ),
  )
  /** The same five years for a 9-12 school — four grades, no more. */
  const hsSnaps = ['2021-09-15', '2022-09-15', '2023-09-15', '2024-09-15', '2025-09-15'].map((d, i) =>
    snap(d, { '9': 118 + i, '10': 112 + i, '11': 108 + i, '12': 98 + i }),
  )

  const k8 = (q: EnrollmentAnalyticsQueryDto = {}) =>
    run({ snapshots: k8Snaps, operational: seedOperational(), plan: null }, { asOf: '2025-09-15', ...q })
  const hs = (q: EnrollmentAnalyticsQueryDto = {}) =>
    run({ snapshots: hsSnaps, operational: seedOperational(), plan: null }, { asOf: '2025-09-15', ...q })

  it('K-8 at FOUR grades: every run of four that fits, all ending in the same year', async () => {
    const res = await k8({ cohortWindow: 4 })
    const cs = res.cohortSize!
    expect(cs.window).toBe(4)
    // Grades K..8 hold six four-grade runs: 3rd through 8th as the END rung.
    expect(cs.cohorts.map((c) => `${c.startGrade}→${c.endGrade}`)).toEqual([
      'K→3',
      '1→4',
      '2→5',
      '3→6',
      '4→7',
      '5→8',
    ])
    // ANCHORED ON ONE END YEAR — the comparison is between classes, not vintages.
    expect(new Set(cs.cohorts.map((c) => c.endYear))).toEqual(new Set([2026]))
    expect(cs.cohorts.every((c) => c.legs.length === 4)).toBe(true)
  })

  it('the SAME school at TWO grades is a different, longer set of shorter panels', async () => {
    const res = await k8({ cohortWindow: 2 })
    const cs = res.cohortSize!
    expect(cs.window).toBe(2)
    expect(cs.cohorts.map((c) => `${c.startGrade}→${c.endGrade}`)).toEqual([
      'K→1',
      '1→2',
      '2→3',
      '3→4',
      '4→5',
      '5→6',
      '6→7',
      '7→8',
    ])
    expect(cs.cohorts.every((c) => c.legs.length === 2)).toBe(true)
  })

  it('a 9-12 school at four grades has EXACTLY ONE ladder — its whole span', async () => {
    const res = await hs({ cohortWindow: 4 })
    const cs = res.cohortSize!
    expect(cs.cohorts).toHaveLength(1)
    const [c] = cs.cohorts
    expect([c.startGrade, c.endGrade]).toEqual(['9', '12'])
    expect(c.legs.map((l) => l.schoolYear)).toEqual([2023, 2024, 2025, 2026])
    // The leavers sat 119 in grade 9 (SY2023) and 102 in grade 12 (SY2026).
    expect(c.legs.map((l) => l.count.value)).toEqual([119, 114, 111, 102])
    expect(c.netChange).toBe(-17)
    expect(c.direction).toBe('shrank')
  })

  it('a five-grade window on a 9-12 school is CLAMPED to four, and says which was asked', async () => {
    const res = await hs({ cohortWindow: 5 })
    const cs = res.cohortSize!
    expect(cs.requestedWindow).toBe(5)
    expect(cs.window).toBe(4)
    expect(cs.availableWindows).toEqual([2, 3, 4])
    expect(cs.gradeSpan).toMatchObject({ low: '9', high: '12', gradeDepth: 4, yearDepth: 5, maxWindow: 4 })
    expect(cs.cohorts.every((c) => c.legs.length === 4)).toBe(true)
  })

  it('YEARS bind as hard as grades: three years of history cannot evidence a five-grade walk', async () => {
    const res = await run(
      { snapshots: k8Snaps.slice(-3), operational: seedOperational(), plan: null },
      { asOf: '2025-09-15', cohortWindow: 5 },
    )
    const cs = res.cohortSize!
    expect(cs.gradeSpan.gradeDepth).toBe(9) // the grades are all there
    expect(cs.gradeSpan.yearDepth).toBe(3) // the history is not
    expect(cs.window).toBe(3)
    expect(cs.availableWindows).toEqual([2, 3])
  })

  it('unasked, the window is the LONGEST the data supports — no history is thrown away', async () => {
    const cs = (await k8()).cohortSize!
    expect(cs.window).toBe(5)
    expect(cs.requestedWindow).toBe(5)
    expect(cs.availableWindows).toEqual([2, 3, 4, 5])
    // Not "narrowed": the view must only say that when the server really did.
    expect(cs.requestedWindow > cs.window).toBe(false)
  })

  it('a rung with no reading KEEPS ITS SLOT — the ladder never shortens itself', async () => {
    // SY2025 was never filed. The four-grade panels still have four legs.
    const res = await run(
      {
        snapshots: [...k8Snaps.slice(0, 3), k8Snaps[4]],
        operational: seedOperational(),
        plan: null,
      },
      { asOf: '2025-09-15', cohortWindow: 4 },
    )
    const cs = res.cohortSize!
    expect(cs.cohorts.every((c) => c.legs.length === 4)).toBe(true)
    const gaps = cs.cohorts.flatMap((c) => c.legs.filter((l) => l.schoolYear === 2025))
    expect(gaps.length).toBeGreaterThan(0)
    // Absent, not zero and not suppressed — and never interpolated.
    expect(gaps.every((l) => l.count.value === null && l.count.suppressed === false)).toBe(true)
  })

  it('the shared scale is the max over the panels drawn, and the panel count is honest', async () => {
    const cs = (await k8({ cohortWindow: 2 })).cohortSize!
    const drawn = cs.cohorts.flatMap((c) => c.legs.map((l) => l.count.value)).filter((v): v is number => v !== null)
    expect(cs.maxCount).toBe(Math.max(...drawn))
    expect(cs.panelsAvailable).toBe(8)
    expect(cs.truncated).toBe(false)
  })

  it('a length that finds nothing keeps the CONTROL alive rather than nulling the block', async () => {
    // Two years, two grades that never line up into a ladder of two.
    const res = await run(
      {
        snapshots: [snap('2023-09-15', { '9': 100 }), snap('2024-09-15', { '12': 90 })],
        operational: seedOperational(),
        plan: null,
      },
      { asOf: '2024-09-15' },
    )
    const cs = res.cohortSize!
    expect(cs.cohorts).toHaveLength(0)
    expect(cs.availableWindows.length).toBeGreaterThan(0)
    expect(cs.reason).toBeTruthy()
  })

  it('the DTO refuses a length nobody can draw: 6 is a 400, 5 is a number', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    const meta = { type: 'query' as const, metatype: EnrollmentAnalyticsQueryDto }
    await expect(pipe.transform({ cohortWindow: '6' }, meta)).rejects.toBeInstanceOf(BadRequestException)
    await expect(pipe.transform({ cohortWindow: '1' }, meta)).rejects.toBeInstanceOf(BadRequestException)
    // The query string carries text; the DTO hands the service a number.
    const ok = (await pipe.transform({ cohortWindow: '5' }, meta)) as EnrollmentAnalyticsQueryDto
    expect(ok.cohortWindow).toBe(5)
  })
})

// ── YEAR-OVER-YEAR: like with like, or say it can't ──────────────────────────

describe('year-over-year comparability', () => {
  it('DATED: readings 3 days apart in the school calendar compare, +16 (+3.81%)', async () => {
    const res = await run(
      {
        snapshots: [snap('2025-09-15', { '9': 105, '10': 105, '11': 105, '12': 105 }), snap('2026-09-12', SEED_BY_GRADE)],
        operational: seedOperational(),
        priorOperational: null,
        plan: null,
      },
      { asOf: '2026-09-12' },
    )
    expect(res.yoy!.basis).toBe('dated')
    expect(res.yoy!.alignedWithinDays).toBe(3)
    expect(res.yoy!.comparable).toBe(true)
    expect(res.yoy!.delta).toBe(16)
    expect(res.yoy!.deltaPct).toBeCloseTo(0.0381, 4)
    expect(res.yoy!.alignmentNote).toBeNull()
  })

  it('shift the prior reading four months and the delta is WITHHELD, with a reason', async () => {
    const res = await run(
      {
        snapshots: [snap('2026-01-20', { '9': 105, '10': 105, '11': 105, '12': 105 }), snap('2026-09-12', SEED_BY_GRADE)],
        operational: seedOperational(),
        priorOperational: null,
        plan: null,
      },
      { asOf: '2026-09-12' },
    )
    expect(res.yoy!.comparable).toBe(false)
    expect(res.yoy!.alignedWithinDays).toBe(130)
    // Both totals are still published — what is refused is the SUBTRACTION.
    expect(res.yoy!.current!.total).toBe(436)
    expect(res.yoy!.prior!.total).toBe(420)
    expect(res.yoy!.delta).toBeNull()
    expect(res.yoy!.deltaPct).toBeNull()
    expect(res.yoy!.alignmentNote).toContain('not a like-for-like comparison')
    expect(res.notes).toContain(res.yoy!.alignmentNote)
  })

  it('ANNUAL basis wins when both years have a canonical headcount', async () => {
    const res = await run({
      operational: seedOperational(),
      priorOperational: { ...seedOperational(420), fiscalPeriod: { label: 'FY2025' } },
      plan: null,
    })
    expect(res.yoy!.basis).toBe('annual')
    // Same point in the year BY CONSTRUCTION — there is no day to align.
    expect(res.yoy!.alignedWithinDays).toBeNull()
    expect(res.yoy!.comparable).toBe(true)
    expect(res.yoy!.delta).toBe(16)
    expect(res.yoy!.prior!.label).toBe('FY2025')
    // And the annual pair lights the YoY tile from the SAME two numbers.
    const tile = res.tiles.find((t) => t.key === 'enrollment_change_yoy')!
    expect(tile.value).toBeCloseTo(16 / 420, 12)
  })

  it('no prior year at all => no YoY block, rather than a zero', async () => {
    const res = await run({ operational: seedOperational(), priorOperational: null, plan: null })
    expect(res.yoy).toBeNull()
  })
})

// ── FRESHNESS, MIX, AND WHAT WE WILL NOT DRAW ────────────────────────────────

describe('as-of and freshness', () => {
  it('dates itself from the real observation, never from the clock', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan }, { asOf: '2025-09-20' })
    expect(res.asOf).toEqual({
      observedOn: '2025-09-15',
      provider: 'oneroster_csv',
      source: 'snapshot',
      staleDays: 5,
      stale: false,
    })
  })

  it('past 45 days it flags itself stale and says so in words', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan }, { asOf: '2025-12-01' })
    expect(res.asOf!.stale).toBe(true)
    expect(res.asOf!.staleDays).toBe(77)
    expect(res.notes.some((n) => n.includes('may not reflect'))).toBe(true)
  })

  it('no reading at all => asOf null and a CTA note, not an empty chart', async () => {
    const res = await run({ snapshots: [], operational: null, plan: null })
    expect(res.asOf).toBeNull()
    expect(res.trend.points).toEqual([])
    expect(res.gradeByYear).toBeNull()
    expect(res.ladder).toBeNull()
    expect(res.notes.some((n) => n.includes('No enrollment reading has been filed'))).toBe(true)
  })
})

describe('status & support mix (roster mode only)', () => {
  const aggregate = {
    counts: {
      status: { enrolled: 436, waitlist: 12, withdrawn: 7, graduated: 0 },
      flags: { iep: 41, plan504: 18, ell: 2, any: 55 },
    },
    kpis: { enrolled: 436, waitlist: 12, flagged: 55, newThisYear: 96 },
  }

  it('a FILE-derived school gets no mix block — a file’s statuses describe the file', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan, source: 'snapshot' })
    expect(res.mix).toBeNull()
    expect(res.notes.some((n) => n.includes('register lives here'))).toBe(true)
  })

  it('a thin support flag is suppressed hard — one ELL child is a name', async () => {
    const res = await run({
      operational: seedOperational(),
      plan: seedPlan,
      source: 'roster',
      aggregate,
      studentCounts: { withStartDate: 436, total: 436 },
    })
    expect(res.mix!.flags.iep).toEqual({ value: 41, suppressed: false })
    expect(res.mix!.flags.ell).toEqual({ value: null, suppressed: true })
  })

  it('“new this year” is WITHHELD when start dates are missing, never reported as 0', async () => {
    // The OneRoster importer writes enrolledOn: null, so this register has none.
    const res = await run({
      operational: seedOperational(),
      plan: seedPlan,
      source: 'roster',
      aggregate: { ...aggregate, kpis: { ...aggregate.kpis, newThisYear: 0 } },
      studentCounts: { withStartDate: 0, total: 436 },
    })
    expect(res.mix!.datedCoverage).toEqual({ withStartDate: 0, total: 436, complete: false })
    expect(res.mix!.newThisYear).toEqual({ value: null, suppressed: true })
    expect(res.notes.some((n) => n.includes('withheld rather than reported'))).toBe(true)
  })
})

describe('what this page will not fake', () => {
  it('names every deferred chart WITH the reason, rather than omitting it', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.unavailable.map((u) => u.key)).toEqual([
      'capacity_utilization',
      'average_class_size',
      'chronic_absence',
      'faith_participation',
      'teacher_retention',
    ])
    for (const u of res.unavailable) expect(u.reason.length).toBeGreaterThan(30)
  })

  it('demographic cells under the floor are masked and lose their share', async () => {
    const res = await run({
      operational: seedOperational(),
      plan: seedPlan,
      demographics: {
        observedOn: '2025-09-15',
        source: 'snapshot',
        totalEnrolled: 436,
        race: { counts: { white: 300, hispanic: 132, native: 4 }, shares: {}, diversityIndex: 0.51 },
        gender: null,
        ethnicity: null,
      },
    })
    const cells = res.demographics!.race!.cells
    expect(cells.find((c) => c.key === 'white')!.count.value).toBe(300)
    expect(cells.find((c) => c.key === 'native')!.count).toEqual({ value: null, suppressed: true })
    expect(cells.find((c) => c.key === 'native')!.share).toEqual({ value: null, suppressed: true })
    expect(res.demographics!.race!.diversityIndex).toBe(0.51)
  })
})

// ── ONE READING, EVERY VIEW (the defect a live call found, not a fixture) ────

describe('the live register and the filed snapshot cannot disagree on one page', () => {
  // Real shape from the seeded school: the last sync filed grade 11 = 105
  // (total 435) and promoted 435, but the register has since gained a student —
  // grade 11 = 106, total 436. Before the reading was folded into the series the
  // ladder printed 106 and the heatmap printed 105, side by side.
  const drifted = () =>
    run(
      {
        snapshots: [snap('2026-08-09', { '9': 118, '10': 112, '11': 105, '12': 100 })],
        currentReading: {
          observedOn: '2026-08-15',
          byGrade: { '9': 118, '10': 112, '11': 106, '12': 100 },
        },
        operational: seedOperational(435),
        source: 'roster',
        aggregate: {
          counts: {
            status: { enrolled: 436, waitlist: 0, withdrawn: 8, graduated: 0 },
            flags: { iep: 0, plan504: 0, ell: 0, any: 0 },
          },
          kpis: { enrolled: 436, waitlist: 0, flagged: 0, newThisYear: 0 },
        },
        studentCounts: { withStartDate: 436, total: 436 },
        plan: null,
      },
      { asOf: '2026-08-15' },
    )

  it('the ladder and the grade grid quote the SAME grade 11', async () => {
    const res = await drifted()
    const ladder11 = res.ladder!.rows.find((r) => r.grade === '11')!.count.value
    const latestYear = Math.max(...res.gradeByYear!.years)
    const grid11 = res.gradeByYear!.cells.find(
      (c) => c.grade === '11' && c.schoolYear === latestYear,
    )!.count.value
    expect(ladder11).toBe(106)
    expect(grid11).toBe(ladder11)
  })

  it('the current reading joins the trend as its own dated point', async () => {
    const res = await drifted()
    expect(res.trend.points.map((p) => [p.observedOn, p.total])).toEqual([
      ['2026-08-09', 435],
      ['2026-08-15', 436],
    ])
  })

  it('the promoted-vs-onscreen gap is REPORTED, not silently shown as two numbers', async () => {
    const res = await drifted()
    expect(res.tiles.find((t) => t.key === 'enrollment_headcount')!.value).toBe(435)
    expect(res.ladder!.total).toBe(436)
    expect(res.reconciliation).toEqual({ promoted: 435, currentReading: 436, diverged: true })
    expect(res.notes.some((n) => n.includes('register has changed since the last promote'))).toBe(
      true,
    )
  })

  it('when they agree the page says nothing about it', async () => {
    const res = await run({ operational: seedOperational(), plan: seedPlan })
    expect(res.reconciliation).toEqual({
      promoted: SEED_TOTAL,
      currentReading: SEED_TOTAL,
      diverged: false,
    })
    expect(res.notes.some((n) => n.includes('register has changed'))).toBe(false)
  })
})

// ── COMPLEMENTARY suppression on the grade × year grid ───────────────────────
// The privacy page promises complementary suppression everywhere outside the
// register. The heatmap tooltip prints each column's "School total", so a year
// with exactly ONE <5 grade was total − visible cells: the hidden count, exactly.
// Now each column runs the roster aggregate's own suppressDimension (a
// companion hides with a lone small cell) AND a column with any hidden cell
// publishes NO total.
describe('grade × year grid — complementary suppression per column', () => {
  const YEAR_OK = { '9': 110, '10': 110, '11': 100, '12': 90 } // 410, nothing small
  const YEAR_LEAKY = { '9': 118, '10': 112, '11': 108, '12': 3 } // one <5 grade
  const leaky = () =>
    run(
      {
        snapshots: [snap('2024-09-15', YEAR_OK), snap('2025-09-15', YEAR_LEAKY)],
        operational: seedOperational(341),
        plan: null,
      },
      { asOf: '2025-09-15' },
    )
  const column = (res: Awaited<ReturnType<typeof leaky>>, year: number) =>
    Object.fromEntries(
      res.gradeByYear!.cells.filter((c) => c.schoolYear === year).map((c) => [c.grade, c.count.suppressed ? c.count : c.count.value]),
    )
  const totalOf = (res: Awaited<ReturnType<typeof leaky>>, year: number) =>
    res.gradeByYear!.observedByYear.find((o) => o.schoolYear === year)!.total

  it('a lone <5 grade takes a COMPANION with it (the smallest visible grade)', async () => {
    const res = await leaky()
    const col = column(res, 2026)
    expect(col['12']).toEqual({ value: null, suppressed: true })
    expect(col['11']).toEqual({ value: null, suppressed: true }) // 108 — smallest visible
    expect(col['9']).toBe(118)
    expect(col['10']).toBe(112)
  })

  it('that column publishes NO school total; the clean column keeps its total', async () => {
    const res = await leaky()
    expect(totalOf(res, 2026)).toBeNull()
    expect(totalOf(res, 2025)).toBe(410)
    // The clean column is untouched — every grade visible.
    expect(Object.values(column(res, 2025)).every((v) => typeof v === 'number')).toBe(true)
  })

  it('the raw 3 appears nowhere in the body, and no column is subtractable (testkit rule)', async () => {
    const res = await leaky()
    // The body-wide detector cannot tell a small COUNT from a small tally
    // (`cohortSize.gradeSpan.gradeDepth` is 4 grades, `panelsAvailable` is 3
    // panels), so the leak check is scoped to the surfaces that carry grade
    // counts: the grid and the ladder.
    expect(leaksCount(res.gradeByYear, 118)).toBe(true)
    expect(leaksCount(res.gradeByYear, 3)).toBe(false)
    expect(leaksCount(res.ladder, 3)).toBe(false)
    for (const y of res.gradeByYear!.years) {
      expect(loneHiddenCellViolations(`gradeByYear.${y}`, column(res, y), totalOf(res, y), { requirePair: true })).toEqual([])
    }
  })

  it('the testkit rule itself sees the leak the old payload had (proves the check is live)', () => {
    expect(
      loneHiddenCellViolations('y', { '9': 118, '10': 112, '11': 108, '12': { value: null, suppressed: true } }, 341),
    ).toHaveLength(1)
    expect(loneHiddenCellViolations('y', { '9': 118, '12': { value: null, suppressed: true } }, null)).toEqual([])
  })
})
