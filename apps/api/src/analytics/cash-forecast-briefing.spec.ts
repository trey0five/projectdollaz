import { describe, expect, it, vi } from 'vitest'
import { BriefingService, namedGradeGaps } from './briefing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2.18 — the FORWARD cash projection, and the gate that is the whole point
// of it.
//
// THE TEST THIS FILE EXISTS FOR is "a revenue omission suppresses the shortfall
// item and emits forecast-incomplete instead". cashflow.service.ts records the
// live incident in its own header: a school with commitments recorded and no
// budget on file produced a projection holding every outflow and NONE of its
// tuition — "a catastrophic-looking trough that was an artefact of absent data".
// Narrating that trough as a dated, dollar-precise shortfall at the top of a
// head of school's morning briefing is the worst thing this product could say.
//
// Everything else here — the band-derived severity, the persist:false pin, the
// value-guard threading — protects that item once it IS legitimately emitted.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2026' }

/** A CashProjectionResult-ish, with only the fields STEP 2.18 reads. */
function projection(over: Record<string, unknown> = {}) {
  return {
    asOfDate: '2026-08-01',
    horizonEnd: '2026-10-31',
    granularity: 'week',
    openingCash: 400_000,
    buckets: [],
    lowestBalance: 82_000,
    lowestDate: '2026-09-20',
    endingBalance: 150_000,
    firstShortfallDate: '2026-09-14',
    shortfallAmount: 18_400,
    daysOfNotice: 44,
    monthsCashAtLowPoint: 0.9,
    byConfidence: {},
    totalReceipts: 900_000,
    totalDisbursements: 1_100_000,
    driversToLowPoint: [
      { category: 'payroll', amount: 640_000 },
      { category: 'debt_service', amount: 120_000 },
    ],
    nextReceiptAfterLow: { category: 'tuition', date: '2026-10-01', amount: 300_000 },
    receiptsBeforeLowPoint: 210_000,
    ...over,
  }
}

/** A ProjectionResponse-ish. */
function response(over: Record<string, unknown> = {}) {
  return {
    projection: projection(),
    opening: { openingCash: 400_000, asOfDate: '2026-08-01', source: 'keyed', tbCash: null, ageDays: 3, stale: false },
    dataTier: 'high',
    dataTierReason: 'QuickBooks is connected and 12 month-ends are on file.',
    disclaimer: 'Forecast confidence reflects the completeness of the data.',
    committedShare: 0.7,
    assumptions: {},
    blockedReason: null,
    sources: {},
    qboOpeningCash: null,
    omissions: [],
    flows: [],
    flowsTruncated: false,
    ...over,
  }
}

function makeService(over: {
  licensed?: boolean
  /** null = the service is absent entirely (older positional-arg mocks). */
  cashForecast?: ReturnType<typeof response> | null
  opening?: { openingCash: number | null; asOfDate: string | null; source: string | null; tbCash: number | null; ageDays: number | null; stale: boolean }
  projectSpy?: ReturnType<typeof vi.fn>
}) {
  const billing = { isEntitledForModule: async () => over.licensed ?? true }
  const analytics = {
    computeMetricsResponse: async () => ({ metrics: [] }),
    enrollmentSignalInputs: async () => ({ actual: null, plan: null, cash: {} }),
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const nulls = {
    compliance: { evaluateForPeriod: async () => null },
    reconciliation: { reconcileForPeriod: async () => null },
    checklist: { getChecklist: async () => null },
    corrective: { getPlan: async () => null },
    policies: { list: async () => ({ policies: [] }) },
    meetings: { listMeetings: async () => null },
    tasks: { listOpenForBriefing: async () => [] },
    accreditation: {
      listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }),
    },
    facilities: {
      listMaintenance: async () => ({
        items: [],
        summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 },
      }),
    },
    advancement: {
      listCampaigns: async () => ({
        campaigns: [],
        summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 },
      }),
    },
  }
  const project =
    over.projectSpy ?? vi.fn(async () => over.cashForecast ?? response())
  const cashForecast =
    over.cashForecast === null && !over.projectSpy
      ? undefined
      : {
          getOpening: async () =>
            over.opening ?? {
              openingCash: 400_000,
              asOfDate: '2026-08-01',
              source: 'keyed',
              tbCash: 612_000,
              ageDays: 3,
              stale: false,
            },
          project,
        }

  const svc = new BriefingService(
    periods as never,
    analytics as never,
    nulls.compliance as never,
    nulls.checklist as never,
    nulls.reconciliation as never,
    nulls.corrective as never,
    billing as never,
    nulls.policies as never,
    nulls.meetings as never,
    nulls.tasks as never,
    nulls.accreditation as never,
    nulls.facilities as never,
    nulls.advancement as never,
    { getActivePlanComputed: async () => ({ hasPlan: false }) } as never, // strategy
    { arApAgingSnapshot: { findFirst: async () => null } } as never, // prisma
    undefined as never, // planningSignals
    undefined as never, // enrollmentPlanSvc
    cashForecast as never, // cashForecast (LAST)
  )
  return { svc, project }
}

const cashItems = (items: { id: string }[]) => items.filter((i) => i.id.startsWith('cash:'))

describe('STEP 2.18 — the revenue-omission gate (the one that matters)', () => {
  // Each of these makes the projection MISS A RECEIPT, which is exactly the
  // condition under which its trough is deeper than reality.
  const REVENUE_OMISSIONS = [
    'tuition_no_billing_date',
    'tuition_no_enrollment',
    'tuition_no_rate',
    'no_budget_spread',
    'qbo_short_history',
    'qbo_history_unavailable',
  ]

  it.each(REVENUE_OMISSIONS)(
    'a %s omission SUPPRESSES the shortfall and emits forecast-incomplete instead',
    async (key) => {
      const message = `Import or enter a budget (${key}). The low point below is deeper than reality.`
      const { svc } = makeService({
        // A REAL breach is present — a $18,400 shortfall, 44 days out. Without
        // the gate this school gets a critical, dated alarm about a crisis that
        // is an artefact of the missing receipt.
        cashForecast: response({ omissions: [{ key, message }] }),
      })
      const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')

      expect(
        res.items.find((i) => i.id === 'cash:projected-shortfall'),
        'the shortfall item was narrated over incomplete revenue',
      ).toBeUndefined()

      const incomplete = res.items.find((i) => i.id === 'cash:forecast-incomplete')
      expect(incomplete, 'no forecast-incomplete item replaced it').toBeDefined()
      expect(incomplete!.severity).toBe('info')
      expect(incomplete!.source).toBe('cash')
      // f9(b): a NEUTRAL, board-safe paraphrase composed in the step — never the
      // omission's operator-voiced original (those open with imperatives like
      // "Import…", which the governance voice's guard rejects), and no digits
      // (an incomplete forecast has no figure worth allow-listing).
      expect(incomplete!.why, 'the operator-voiced message leaked through').not.toBe(message)
      expect(incomplete!.why).not.toMatch(/^\s*(Fix|Go|Reconcile|Import|Update|Create|Assign|Upload|Map)\b/im)
      expect(incomplete!.why).not.toMatch(/\d/)
      expect(incomplete!.why).toMatch(/low point/)
      if (key.startsWith('tuition_')) {
        expect(incomplete!.why).toMatch(/tuition revenue/)
      }
      // f9(c): the budget-spread omission covers spend AND receipts, so its
      // title must not claim a missing source of income specifically.
      if (key === 'no_budget_spread') {
        expect(incomplete!.title).toBe('The cash forecast is missing the operating budget')
        expect(incomplete!.title).not.toMatch(/source of income/)
      } else {
        expect(incomplete!.title).toBe('The cash forecast is missing a source of income')
      }
      expect(incomplete!.link).toBe('/cash-flow')
      // No date on this one: nothing is due, something is absent.
      expect(incomplete!.dueDate).toBeNull()
    },
  )

  it('f9(a) — NO breach means NO item at all: the explainer only replaces a suppressed alarm', async () => {
    // The forecast is missing tuition AND never breaches the reserve floor.
    // Before f9 this school saw an evergreen "your forecast is missing income"
    // line on every briefing forever — operator homework, not attention.
    const { svc } = makeService({
      cashForecast: response({
        omissions: [{ key: 'tuition_no_rate', message: 'Tuition is not in this forecast.' }],
        projection: projection({ firstShortfallDate: null, shortfallAmount: null }),
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(cashItems(res.items)).toHaveLength(0)
  })

  it('f9(a) — a breach the BAND calls healthy also emits neither item', async () => {
    // Six months of cash at the low point: the shortfall item would not have
    // fired, so there is no suppression to explain either.
    const { svc } = makeService({
      cashForecast: response({
        omissions: [{ key: 'tuition_no_rate', message: 'Tuition is not in this forecast.' }],
        projection: projection({ monthsCashAtLowPoint: 6 }),
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(cashItems(res.items)).toHaveLength(0)
  })

  it('an OUTFLOW-ONLY omission does NOT suppress the shortfall', async () => {
    // `no_commitments` makes a trough SHALLOWER than reality, never deeper —
    // the direction that cannot produce a false alarm. Suppressing on it would
    // mean the schools most in need of the warning never see it.
    const { svc } = makeService({
      cashForecast: response({
        omissions: [{ key: 'no_commitments', message: 'No commitments are recorded.' }],
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'cash:projected-shortfall')).toBeDefined()
    expect(res.items.find((i) => i.id === 'cash:forecast-incomplete')).toBeUndefined()
  })

  it('an UNCLASSIFIED omission key suppresses — the polarity that survives a future edit', async () => {
    // Somebody adds an omission next year and never reads this file. It must
    // suppress rather than silently re-enable a warning the data cannot support.
    const { svc } = makeService({
      cashForecast: response({
        omissions: [{ key: 'some_future_omission', message: 'Something new is missing.' }],
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'cash:projected-shortfall')).toBeUndefined()
    expect(res.items.find((i) => i.id === 'cash:forecast-incomplete')).toBeDefined()
  })
})

describe('STEP 2.18 — gates, severity and value-guard threading', () => {
  it('MODULE GATE: neither finance nor planning → zero cash-forecast items', async () => {
    const { svc } = makeService({ licensed: false })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(cashItems(res.items)).toHaveLength(0)
  })

  it('an ABSENT CashFlowService yields no item and no throw (fail-soft)', async () => {
    const { svc } = makeService({ cashForecast: null })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(cashItems(res.items)).toHaveLength(0)
  })

  it('NO STATED OPENING BALANCE → no item, and the TB figure is never substituted', async () => {
    // The balance-sheet cash total is not available operating cash. Starting a
    // forecast from it would overstate every week that followed.
    const { svc, project } = makeService({
      opening: { openingCash: null, asOfDate: null, source: null, tbCash: 612_000, ageDays: null, stale: false },
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(cashItems(res.items)).toHaveLength(0)
    expect(project, 'projected from a balance nobody stated').not.toHaveBeenCalled()
  })

  it('NO RESERVE THRESHOLD (firstShortfallDate null) → no item at all', async () => {
    // No threshold means no shortfall is reported, rather than one measured
    // against a floor KYRO invented.
    const { svc } = makeService({
      cashForecast: response({ projection: projection({ firstShortfallDate: null, shortfallAmount: null }) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'cash:projected-shortfall')).toBeUndefined()
  })

  it('a BLOCKED projection emits nothing', async () => {
    const { svc } = makeService({
      cashForecast: response({ blockedReason: 'That as-of date is not a valid date.', projection: null }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(cashItems(res.items)).toHaveLength(0)
  })

  it('★ persist:false — a briefing NEVER writes to the back-testing archive', async () => {
    // The briefing is generated on every page load. Freezing a run here would
    // bury every real decision under thousands of page views, and the archive
    // cannot be repaired retroactively.
    const { svc, project } = makeService({})
    await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(project).toHaveBeenCalledTimes(1)
    expect(project.mock.calls[0][2]).toMatchObject({ persist: false })
  })

  it('SEVERITY COMES FROM A BAND, not a sign: healthy months-of-cash → no item', async () => {
    // A school that dips a little under a large threshold but still holds six
    // months of operating cash is not in crisis, and the band says so.
    const { svc } = makeService({
      cashForecast: response({ projection: projection({ monthsCashAtLowPoint: 6 }) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'cash:projected-shortfall')).toBeUndefined()
  })

  it('a thin reserve at the low point is CRITICAL', async () => {
    const { svc } = makeService({
      cashForecast: response({ projection: projection({ monthsCashAtLowPoint: 0.4 }) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.find((i) => i.id === 'cash:projected-shortfall')!.severity).toBe('critical')
  })

  it('LIMITED data CAPS severity at warn and appends the tier reason', async () => {
    const reason = 'Only a keyed opening balance and your own commitments are on file.'
    const { svc } = makeService({
      cashForecast: response({
        dataTier: 'limited',
        dataTierReason: reason,
        projection: projection({ monthsCashAtLowPoint: 0.4 }),
      }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'cash:projected-shortfall')!
    expect(item.severity).toBe('warn')
    expect(item.why).toContain(reason)
  })

  it('★ the DATE lives in dueDate and NEVER as a raw ISO string in `why`', async () => {
    // FIGURE_RE captures the leading '-', so '2026-09-14' in a `why` tokenises
    // as {2026, -9, -14} while the model saying "September 14, 2026" emits
    // {14, 2026} — rejected, and every LLM segment on the item dies silently.
    const { svc } = makeService({})
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'cash:projected-shortfall')!
    expect(item.dueDate).toBe('2026-09-14')
    expect(item.why, 'a raw ISO date in `why` silently degrades every segment').not.toMatch(
      /\d{4}-\d{2}-\d{2}/,
    )
  })

  it('★ MAGNITUDES with direction in words — no signed money anywhere in `why`', async () => {
    const { svc } = makeService({
      cashForecast: response({ projection: projection({ lowestBalance: -22_000 }) }),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const item = res.items.find((i) => i.id === 'cash:projected-shortfall')!
    expect(item.why).toMatch(/overdrawn by \$22,000/)
    expect(item.why, 'canon is sign-aware; "-$22,000" forbids the model saying "22,000"').not.toMatch(
      /-\$/,
    )
  })

  it('uses ONE money renderer — thousands separators, no compact "18.4k" form', async () => {
    // canon('$18,400') is '18400$' and canon('$18.4k') is '18.4$k'. Two
    // renderers on one item means every LLM segment about it falls to template.
    const { svc } = makeService({})
    const item = (await svc.getBriefing('school-1', PERIOD.id, 'owner')).items.find(
      (i) => i.id === 'cash:projected-shortfall',
    )!
    expect(item.why).toContain('$18,400')
    expect(item.why).not.toMatch(/\$\d+(\.\d+)?[kKmM]\b/)
  })

  it('carries no metricKey — it is a projection, not a banded registry KPI', async () => {
    const { svc } = makeService({})
    const item = (await svc.getBriefing('school-1', PERIOD.id, 'owner')).items.find(
      (i) => i.id === 'cash:projected-shortfall',
    )!
    expect(item.metricKey).toBeNull()
    expect(item.value).toBeNull()
    expect(item.link).toBe('/cash-flow')
    // No new AttentionSource: 'cash' already exists, and a fourth cash-shaped
    // source would fragment lens ranking for nothing.
    expect(item.source).toBe('cash')
  })

  it('names what dug the hole, and says so when nothing arrives after the low point', async () => {
    const { svc } = makeService({
      cashForecast: response({ projection: projection({ nextReceiptAfterLow: null }) }),
    })
    const item = (await svc.getBriefing('school-1', PERIOD.id, 'owner')).items.find(
      (i) => i.id === 'cash:projected-shortfall',
    )!
    // n3: categories go through the SAME categoryTitle QBO events use — the
    // narration says "Payroll" and "Debt service", never the key `debt_service`.
    expect(item.why).toMatch(/Payroll \(\$640,000\)/)
    expect(item.why).toMatch(/Debt service \(\$120,000\)/)
    expect(item.why).not.toMatch(/debt_service/)
    expect(item.why).toMatch(/No further receipt is expected/)
  })

  it('F7 — two briefings inside the TTL share ONE live projection read', async () => {
    // project() reaches QuickBooks LIVE, and OrgHome renders a briefing per
    // school per page load. The briefing read is cached for ten minutes; the
    // assistant tool path stays uncached (pinned in cash-forecast-tool.spec).
    const { svc, project } = makeService({})
    const first = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const second = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(project).toHaveBeenCalledTimes(1)
    // …and the second briefing still carries the item, from the cached read.
    expect(first.items.some((i) => i.id === 'cash:projected-shortfall')).toBe(true)
    expect(second.items.some((i) => i.id === 'cash:projected-shortfall')).toBe(true)
  })

  it('F7 — the cache is per school', async () => {
    const { svc, project } = makeService({})
    await svc.getBriefing('school-1', PERIOD.id, 'owner')
    await svc.getBriefing('school-2', PERIOD.id, 'owner')
    expect(project).toHaveBeenCalledTimes(2)
  })
})

describe('STEP 2.10 grade clause — namedGradeGaps', () => {
  it('names the two largest shortfalls, biggest first, as POSITIVE magnitudes', () => {
    const gaps = namedGradeGaps(
      { '3': 18, '9': 40, '5': 30, K: 22 },
      { '3': 25, '9': 45, '5': 31, K: 24 },
    )
    expect(gaps).toEqual([
      { grade: '3', short: 7 },
      { grade: '9', short: 5 },
    ])
  })

  it('a grade AT or OVER plan is not a gap', () => {
    expect(namedGradeGaps({ '3': 30 }, { '3': 25 })).toEqual([])
    expect(namedGradeGaps({ '3': 25 }, { '3': 25 })).toEqual([])
  })

  it('★ a SUPPRESSED grade is never named — the briefing is the surface that gets read aloud', () => {
    // Grade 4 has the larger shortfall but only three children in it. Naming it
    // in an emailed, printed, spoken briefing would undo the cell floor
    // everywhere at once.
    const gaps = namedGradeGaps({ '4': 3, '7': 20 }, { '4': 15, '7': 26 })
    expect(gaps.map((g) => g.grade)).toEqual(['7'])
  })

  it('tolerates a missing plan, a missing reading and junk values', () => {
    expect(namedGradeGaps(null, { '3': 25 })).toEqual([])
    expect(namedGradeGaps({ '3': 18 }, null)).toEqual([])
    expect(namedGradeGaps({ '3': 'lots' }, { '3': 25 })).toEqual([])
  })
})
