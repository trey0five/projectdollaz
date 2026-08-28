import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// PENNY COVERAGE PHASE 1 — the enrollment and academic-cohort reads.
//
// EVERY ASSERTION HERE IS ABOUT STRUCTURE, NOT INSTRUCTION. The pattern the whole
// phase rests on is that an honest answer should be the only representable one:
//
//   · a SUPPRESSED cell loses the `value` KEY ENTIRELY, so there is no field to
//     quote, mis-read as zero, or helpfully fill in;
//   · a DIVERGED headcount publishes no single school total anywhere, so Penny
//     cannot pick the wrong one — there is nothing to pick from;
//   · an INCOMPARABLE year-over-year drops delta AND deltaPct, so the readings
//     are both present and the subtraction is not;
//   · peer anonymity on the org path is FORCED BY THE HANDLER, never taken from
//     the model's arguments.
//
// A prompt line can be ignored by a model having a bad day. A missing key cannot.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'user-1', email: 'head@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' as const }
const SINKS = {
  onChart: vi.fn(),
  onAdvisory: vi.fn(),
  onProposal: vi.fn(),
  onNavigate: vi.fn(),
  onApplied: vi.fn(),
  onGuide: vi.fn(),
}

const shown = (n: number) => ({ value: n, suppressed: false })
const withheld = () => ({ value: null, suppressed: true })
const missing = () => ({ value: null, suppressed: false })

function view(over: Record<string, unknown> = {}) {
  return {
    scope: 'school',
    schoolId: 'school-1',
    period: { id: 'period-1', label: 'FY 2026', periodEndDate: '2026-06-30' },
    asOf: { observedOn: '2026-08-01', provider: 'roster', source: 'roster', staleDays: 2, stale: false },
    tiles: [
      { key: 'enrollment_headcount', label: 'Enrollment', unit: 'count', value: 435, status: 'good', available: true },
      { key: 'enrollment_vs_plan', label: 'Enrollment vs Plan', unit: 'percent', value: -0.0333, status: 'watch', available: true },
    ],
    trend: {
      points: [
        { observedOn: '2025-09-15', total: 440, provider: 'roster' },
        { observedOn: '2026-08-01', total: 436, provider: 'roster' },
      ],
      planTotal: 450,
    },
    yoy: {
      basis: 'dated',
      current: { label: '2026-08-01', total: 436 },
      prior: { label: '2025-09-15', total: 440 },
      alignedWithinDays: 45,
      comparable: false,
      alignmentNote: "Last year's nearest reading is 45 days off this one in the school calendar.",
      delta: null,
      deltaPct: null,
    },
    gradeByYear: null,
    ladder: {
      observedOn: '2026-08-01',
      total: 436,
      rows: [
        { grade: 'K', count: shown(52), share: shown(0.12) },
        { grade: '1', count: withheld(), share: withheld() },
      ],
      narrowestRung: null,
      narrowestRungWithheldReason: 'At least one grade is too small to show.',
    },
    cohortSize: {
      cohorts: [
        {
          id: 2018,
          label: 'Class of 2030',
          graduationYear: 2030,
          startGrade: '3',
          endGrade: '5',
          startYear: 2024,
          endYear: 2026,
          legs: [
            { grade: '3', schoolYear: 2024, count: shown(48) },
            { grade: '4', schoolYear: 2025, count: missing() },
            { grade: '5', schoolYear: 2026, count: shown(41) },
          ],
          netChange: -7,
          direction: 'shrank',
        },
      ],
      maxCount: 48,
      window: 3,
      requestedWindow: 3,
      availableWindows: [2, 3],
      endYear: 2026,
      gradeSpan: { low: 'K', high: '8', gradeDepth: 9, yearDepth: 3, maxWindow: 3 },
      panelsAvailable: 7,
      truncated: false,
      reason: null,
    },
    vsPlan: {
      rows: [
        { grade: 'K', actual: shown(52), plan: shown(56), gap: shown(-4), gapPct: shown(-0.071) },
        { grade: '1', actual: withheld(), plan: withheld(), gap: withheld(), gapPct: withheld() },
      ],
      totals: { actual: 436, plan: 450, gap: -14, gapPct: -0.0311, tileGapPct: -0.0333, agreesWithTile: false },
      planSource: 'driver_budget',
      planFailed: false,
    },
    planFailed: false,
    reconciliation: { promoted: 435, currentReading: 436, diverged: true },
    demographics: null,
    mix: {
      status: { enrolled: 436, waitlist: 3, withdrawn: 1, graduated: 0 },
      flags: { iep: shown(28), plan504: withheld(), ell: withheld(), any: shown(41) },
      datedCoverage: { withStartDate: 400, total: 436, complete: false },
      newThisYear: withheld(),
    },
    notes: [
      'These figures are counted live from your student register as it stands on 2026-08-01.',
      'The headcount promoted to FY 2026 is 435, but the reading on this page counts 436.',
    ],
    unavailable: [
      {
        key: 'capacity_utilization',
        label: 'Percent full / capacity',
        reason: 'Building and per-grade capacity are not recorded anywhere yet.',
      },
    ],
    minCell: 5,
    ...over,
  }
}

function cohortPayload(over: Record<string, unknown> = {}) {
  return {
    empty: false,
    school: { id: 'school-1', name: 'St Example', level: 'elementary' },
    context: {
      endYear: 2026,
      testType: 'act',
      family: 'act',
      scoreType: 'scale',
      scoreRange: { min: 1, max: 36 },
      materialGap: 1,
      measures: 'Each panel follows ONE group of children across consecutive grades…',
      window: 3,
      requestedWindow: 3,
      availableWindows: [2, 3],
      gradeSpan: { low: 9, high: 12 },
      seriesBasis: 'reported-composite',
      reason: null,
    },
    panels: [
      {
        key: 'p1',
        cohortId: 2014,
        label: 'Grades 9 → 11',
        focus: {
          schoolId: 'school-1',
          isFocus: true,
          startGrade: '9',
          endGrade: '11',
          startYear: 2024,
          endYear: 2026,
          legs: [
            { gradeLevel: '9', schoolYear: 2024, value: 21.4, tested: 60, state: 'observed' },
            { gradeLevel: '10', schoolYear: 2025, value: null, tested: null, state: 'missing' },
            { gradeLevel: '11', schoolYear: 2026, value: 21.0, tested: 58, state: 'observed' },
          ],
          observedLegs: 2,
          complete: false,
          netChange: -0.4,
          netChangeUnavailable: null,
          // A 0.4-point fall on an ACT composite is BELOW the material gap, so
          // the engine calls it 'held'. This is verify-check #14.
          direction: 'held',
        },
        peers: [
          { schoolId: null, label: 'School B', isFocus: false, legs: [], netChange: 1.2, direction: 'gained' },
        ],
        summary: null,
      },
    ],
    matrix: null,
    availableCohorts: [],
    hidePeerNames: true,
    ...over,
  }
}

function makeService(over: { licensed?: boolean; view?: Record<string, unknown>; cohorts?: Record<string, unknown> } = {}) {
  // Parameters DECLARED so `mock.calls[0][1]` type-checks — the docker image
  // build compiles specs, and an untyped mock has an empty call-args tuple.
  const analytics = vi.fn(async (_schoolId: string, _q?: Record<string, unknown>) => over.view ?? view())
  const cohorts = vi.fn(async (_schoolId: string, _q?: Record<string, unknown>) => over.cohorts ?? cohortPayload())
  const billing = { isEntitledForModule: vi.fn(async () => over.licensed ?? true) }

  const arity = AssistantService.length
  const args: unknown[] = Array(arity).fill({} as never)
  args[arity - 6] = { analytics }
  args[arity - 5] = { cohorts }
  args[arity - 2] = billing
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, analytics, cohorts, billing }
}

const run = (svc: AssistantService, name: string, args: Record<string, unknown> = {}) =>
  (
    svc as unknown as {
      runToolCall: (tc: unknown, ctx: unknown, sinks: unknown) => Promise<Record<string, unknown>>
    }
  ).runToolCall({ id: 't1', function: { name, arguments: JSON.stringify(args) } }, CTX, SINKS)

describe('get_enrollment_analytics — structural honesty', () => {
  it('★ a SUPPRESSED cell OMITS the `value` key entirely — there is no field to quote', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics', { section: 'plan' })
    const rows = (res.vsPlan as { rows: Record<string, unknown>[] }).rows
    const hidden = rows[1] as { actual: Record<string, unknown> }
    expect(hidden.actual).toEqual({ suppressed: true })
    expect(hidden.actual, 'a `value: null` beside suppressed is a field to mis-read').not.toHaveProperty(
      'value',
    )
  })

  it('a MISSING cell keeps `value: null` — missing and withheld are different absences', async () => {
    const { svc } = makeService({
      view: view({
        vsPlan: {
          rows: [{ grade: 'K', actual: missing(), plan: shown(56), gap: missing(), gapPct: missing() }],
          totals: { actual: 0, plan: 56, gap: -56, gapPct: -1, tileGapPct: null, agreesWithTile: true },
          planSource: 'driver_budget',
          planFailed: false,
        },
        reconciliation: { promoted: 435, currentReading: 435, diverged: false },
      }),
    })
    const res = await run(svc, 'get_enrollment_analytics', { section: 'plan' })
    const rows = (res.vsPlan as { rows: { actual: Record<string, unknown> }[] }).rows
    expect(rows[0].actual).toEqual({ value: null })
  })

  it('★ reconciliation.diverged publishes NO single school headcount anywhere', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics', { section: 'plan' })

    // The tile that answers "how many students do we have" is gone.
    const tiles = res.tiles as { key: string }[]
    expect(tiles.map((t) => t.key)).not.toContain('enrollment_headcount')
    // …and so is the total derived from the contested reading.
    const totals = (res.vsPlan as { totals: Record<string, unknown> }).totals
    expect(totals).not.toHaveProperty('actual')
    expect(totals).not.toHaveProperty('gap')
    expect(totals).not.toHaveProperty('gapPct')
    expect(totals.withheld).toBe('headcount_reconciliation')
    // What IS published is the PAIR, so both figures can be relayed and neither
    // is the answer.
    expect(res.reconciliation).toEqual({ promoted: 435, currentReading: 436, diverged: true })
  })

  it('the diverged rule also strips the ladder total and the LATEST trend point', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics', { section: 'trend' })
    expect(res.ladder).not.toHaveProperty('total')
    const pts = (res.trend as { points: Record<string, unknown>[] }).points
    // Historical readings are not contested and keep their totals; the latest one
    // IS the contested figure and loses it.
    expect(pts[0]).toHaveProperty('total', 440)
    expect(pts[1]).not.toHaveProperty('total')
  })

  it('★ F1 — section:"mix" carries NO field equal to EITHER contested headcount', async () => {
    // The fixture diverges 435 (promoted) against 436 (register). The mix view
    // restates the contested register count twice — status.enrolled and
    // datedCoverage.total (whose withStartDate numerator equals it on complete
    // coverage) — and shipping either would reopen the door the tile, ladder
    // total and vs-plan actual already closed. Assert on VALUES, not key names:
    // outside the reconciliation pair, no numeric field anywhere in the payload
    // may equal either figure.
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics', { section: 'mix' })

    const numbersIn = (
      node: unknown,
      path = '',
      out: { path: string; value: number }[] = [],
    ): { path: string; value: number }[] => {
      if (node == null) return out
      if (typeof node === 'number') out.push({ path, value: node })
      else if (Array.isArray(node)) node.forEach((v, i) => numbersIn(v, `${path}[${i}]`, out))
      else if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          // The PAIR is the one published answer — both figures, neither a winner.
          if (path === '' && k === 'reconciliation') continue
          numbersIn(v, path ? `${path}.${k}` : k, out)
        }
      }
      return out
    }
    const offenders = numbersIn(res).filter((n) => n.value === 435 || n.value === 436)
    expect(offenders, 'a single-headcount field leaked beside the reconciliation pair').toEqual([])

    // The withheld shapes say WHY, and every non-headcount signal survives.
    const mix = res.mix as Record<string, unknown>
    expect(mix.status).toEqual({
      waitlist: 3,
      withdrawn: 1,
      graduated: 0,
      withheld: 'headcount_reconciliation',
    })
    expect(mix.datedCoverage).toEqual({ complete: false, withheld: 'headcount_reconciliation' })
    expect((mix.flags as Record<string, unknown>).iep).toEqual({ value: 28 })
  })

  it('when the two AGREE, the mix section keeps its status and coverage totals', async () => {
    const { svc } = makeService({
      view: view({ reconciliation: { promoted: 436, currentReading: 436, diverged: false } }),
    })
    const res = await run(svc, 'get_enrollment_analytics', { section: 'mix' })
    const mix = res.mix as Record<string, unknown>
    expect(mix.status).toEqual({ enrolled: 436, waitlist: 3, withdrawn: 1, graduated: 0 })
    expect(mix.datedCoverage).toEqual({ withStartDate: 400, total: 436, complete: false })
  })

  it('when the two AGREE, the headcount is published normally', async () => {
    const { svc } = makeService({
      view: view({ reconciliation: { promoted: 436, currentReading: 436, diverged: false } }),
    })
    const res = await run(svc, 'get_enrollment_analytics', { section: 'plan' })
    expect((res.tiles as { key: string }[]).map((t) => t.key)).toContain('enrollment_headcount')
    expect((res.vsPlan as { totals: Record<string, unknown> }).totals).toHaveProperty('actual', 436)
  })

  it('★ yoy.comparable false DROPS delta AND deltaPct, keeping both readings and the note', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics', { section: 'trend' })
    const yoy = res.yoy as Record<string, unknown>
    expect(yoy).not.toHaveProperty('delta')
    expect(yoy).not.toHaveProperty('deltaPct')
    expect(yoy.comparable).toBe(false)
    expect(yoy.alignmentNote).toMatch(/45 days off/)
    // Withheld, not hidden: the two readings are both here.
    expect(yoy.current).toEqual({ label: '2026-08-01', total: 436 })
    expect(yoy.prior).toEqual({ label: '2025-09-15', total: 440 })
  })

  it('a COMPARABLE yoy keeps its change', async () => {
    const { svc } = makeService({
      view: view({
        yoy: {
          basis: 'annual',
          current: { label: 'FY 2026', total: 436 },
          prior: { label: 'FY 2025', total: 440 },
          alignedWithinDays: null,
          comparable: true,
          alignmentNote: null,
          delta: -4,
          deltaPct: -0.0091,
        },
      }),
    })
    const res = await run(svc, 'get_enrollment_analytics', { section: 'trend' })
    expect(res.yoy).toMatchObject({ delta: -4, deltaPct: -0.0091 })
  })

  it('unavailable[] ships VERBATIM and no key exists for any of it', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics')
    expect(res.unavailable).toEqual([
      {
        key: 'capacity_utilization',
        label: 'Percent full / capacity',
        reason: 'Building and per-grade capacity are not recorded anywhere yet.',
      },
    ])
    expect(JSON.stringify(res)).not.toMatch(/capacityUtilization|percentFull|"full"/)
  })

  it('notes[] and minCell ship VERBATIM — the server authors them, Penny relays them', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics')
    expect(res.minCell).toBe(5)
    expect(res.notes).toEqual(view().notes)
  })

  it('a cohort entry pairs netChange with the SERVER’s direction and the floor note', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_enrollment_analytics', { section: 'cohorts' })
    const cs = res.cohortSize as { cohorts: Record<string, unknown>[]; moveFloorNote: string }
    expect(cs.cohorts[0]).toMatchObject({ netChange: -7, direction: 'shrank' })
    // A bare delta invites "24 → 25 is growth"; the pair plus the floor does not.
    expect(cs.moveFloorNote).toMatch(/movement floor/)
  })

  it('the SECTION VALVE keeps each answer small and says what else exists', async () => {
    const { svc } = makeService()
    const dflt = await run(svc, 'get_enrollment_analytics')
    expect(dflt).toHaveProperty('vsPlan')
    expect(dflt).not.toHaveProperty('cohortSize')
    expect(dflt).not.toHaveProperty('mix')
    expect(dflt.moreSections).toMatch(/cohorts \| trend \| mix/)

    const mix = await run(svc, 'get_enrollment_analytics', { section: 'mix' })
    expect(mix).toHaveProperty('mix')
    expect(mix).not.toHaveProperty('vsPlan')
    // Support flags are suppressed HARD — one ELL child in a small school is a name.
    expect((mix.mix as { flags: Record<string, unknown> }).flags.ell).toEqual({ suppressed: true })
    expect((mix.mix as { newThisYear: unknown }).newThisYear).toEqual({ suppressed: true })
  })

  it('every section stays under the 8000-character truncation', async () => {
    const { svc } = makeService()
    for (const section of [undefined, 'summary', 'plan', 'cohorts', 'trend', 'mix']) {
      const res = await run(svc, 'get_enrollment_analytics', section ? { section } : {})
      expect(JSON.stringify(res).length, `section ${section ?? 'default'} is too large`).toBeLessThan(8000)
    }
  })

  it('coerces the model’s numeric `years` to the DTO’s string vocabulary', async () => {
    const { svc, analytics } = makeService()
    await run(svc, 'get_enrollment_analytics', { years: 3 })
    expect(analytics.mock.calls[0][1]).toMatchObject({ years: '3' })
    // Out of range → dropped, never passed through to 400 the read.
    await run(svc, 'get_enrollment_analytics', { years: 12 })
    expect(analytics.mock.calls[1][1]).not.toHaveProperty('years')
  })

  it('MODULE GATE: unlicensed → a refusal with nothing to improvise from', async () => {
    const { svc, analytics } = makeService({ licensed: false })
    const res = await run(svc, 'get_enrollment_analytics')
    expect(res.available).toBe(false)
    expect(res.reason).toBe('not_licensed')
    expect(res).not.toHaveProperty('tiles')
    expect(analytics).not.toHaveBeenCalled()
  })
})

describe('get_academic_cohorts', () => {
  it('★ FORCES hidePeerNames — anonymity is a server decision or it is not one', async () => {
    const { svc, cohorts } = makeService()
    // Even asked explicitly to reveal them.
    await run(svc, 'get_academic_cohorts', { scope: 'org', hidePeerNames: false })
    expect(cohorts.mock.calls[0][1]).toMatchObject({ hidePeerNames: true, scope: 'org' })
  })

  it('ships context VERBATIM, including materialGap and the `measures` sentence', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_academic_cohorts')
    const ctx = res.context as Record<string, unknown>
    expect(ctx.materialGap).toBe(1)
    // Server-authored. Without it Penny would describe the ACT scale from memory,
    // which is wrong on every TerraNova school in the tenancy.
    expect(ctx.measures).toMatch(/Each panel follows ONE group of children/)
    expect(ctx.scoreRange).toEqual({ min: 1, max: 36 })
    expect(ctx.window).toBe(3)
    expect(ctx.requestedWindow).toBe(3)
  })

  it('★ a sub-material fall is `held`, and the direction rides WITH the netChange', async () => {
    // Verify-check #14: a 0.4-point ACT fall must not be narrated as a slight
    // decline. The engine already decided; the payload must not let Penny redo it.
    const { svc } = makeService()
    const res = await run(svc, 'get_academic_cohorts')
    const panel = (res.panels as Record<string, unknown>[])[0]
    expect(panel.netChange).toBe(-0.4)
    expect(panel.direction).toBe('held')
  })

  it('returns the FOCUS line only — peers are bulk and are anonymised anyway', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_academic_cohorts', { scope: 'org' })
    const panel = (res.panels as Record<string, unknown>[])[0]
    expect(panel).not.toHaveProperty('peers')
    expect(JSON.stringify(res)).not.toContain('School B')
    expect(res.peersNote).toMatch(/anonymously/)
  })

  it('keeps each leg’s state, so a missing year is never read as a score', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_academic_cohorts')
    const legs = (res.panels as { legs: Record<string, unknown>[] }[])[0].legs
    expect(legs[1]).toMatchObject({ grade: '10', value: null, state: 'missing' })
  })

  it('drops the matrix — a second, wider projection of the same panels', async () => {
    const { svc, cohorts } = makeService()
    await run(svc, 'get_academic_cohorts')
    expect(cohorts.mock.calls[0][1]).toMatchObject({ includeMatrix: false })
  })

  it('MODULE GATE: unlicensed academics → a refusal, and the service is never called', async () => {
    const { svc, cohorts } = makeService({ licensed: false })
    const res = await run(svc, 'get_academic_cohorts')
    expect(res.available).toBe(false)
    expect(res.reason).toBe('not_licensed')
    expect(res).not.toHaveProperty('panels')
    expect(cohorts).not.toHaveBeenCalled()
  })

  it('stays under the 8000-character truncation', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_academic_cohorts')
    expect(JSON.stringify(res).length).toBeLessThan(8000)
  })
})
