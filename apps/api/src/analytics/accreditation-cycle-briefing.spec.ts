import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3/WS2 — the two ADDITIVE accreditation briefing steps:
//   STEP 2.20 — cycle milestones: only overdue/at_risk emit; every figure and
//               state word is copied from the cycle payload; links use
//               ?center=journey; no ISO date ever enters `why` (dueDate field
//               carries it); entitlement-gated fail-closed; read fail-soft.
//   STEP 2.21 — the one-line "newer edition available" info for a school still
//               holding a superseded framework whose successor is seeded.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }

type Milestone = {
  key: string
  label: string
  dueDate: string | null
  window: { start: string; end: string } | null
  state: string
  measure: { kind: string; num: number; den: number | null; text: string } | null
  reason: string | null
  link: string
}

function milestone(over: Partial<Milestone>): Milestone {
  return {
    key: over.key ?? 'progress_report',
    label: over.label ?? 'Accreditation Progress Report',
    dueDate: over.dueDate ?? '2026-04-12',
    window: over.window ?? null,
    state: over.state ?? 'on_track',
    measure: over.measure ?? {
      kind: 'prior_findings_closed',
      num: 3,
      den: 7,
      text: '3 of 7 prior-visit findings answered',
    },
    reason: over.reason ?? null,
    link: over.link ?? '/accreditation?center=evidence',
  }
}

function makeService(over: {
  accreditationLicensed?: boolean
  cycle?: unknown | (() => Promise<unknown>)
  heldFrameworks?: { id: string; code: string; name: string; accreditor: string; supersededByCode: string | null }[]
  seededSuccessors?: { code: string; name: string }[]
}) {
  const billing = {
    isEntitledForModule: async (_schoolId: string, moduleKey: string) =>
      moduleKey === 'accreditation' ? (over.accreditationLicensed ?? true) : false,
  }
  const held = over.heldFrameworks ?? []
  const prisma = {
    arApAgingSnapshot: { findFirst: async () => null },
    accreditationStandard: {
      groupBy: async () => held.map((f) => ({ frameworkId: f.id })),
    },
    accreditationFramework: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        if ((where as { supersededByCode?: unknown }).supersededByCode) {
          return held.filter((f) => f.supersededByCode !== null)
        }
        return (over.seededSuccessors ?? []).filter((s) =>
          ((where as { code?: { in: string[] } }).code?.in ?? []).includes(s.code),
        )
      },
    },
  }
  const accreditationCycle = {
    getCycle: async () => {
      if (typeof over.cycle === 'function') return (over.cycle as () => Promise<unknown>)()
      return over.cycle ?? { configured: false }
    },
  }
  const emptyRegister = {
    standards: [],
    summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 },
    ratingSummary: { total: 0, met: 0, partiallyMet: 0, notMet: 0, notStarted: 0, pctMet: 0 },
  }
  return new BriefingService(
    { getOwnedPeriod: async () => PERIOD } as never,
    { computeMetricsResponse: async () => ({ metrics: [] }) } as never,
    { evaluateForPeriod: async () => null } as never,
    { getChecklist: async () => null } as never,
    { reconcileForPeriod: async () => null } as never,
    { getPlan: async () => null } as never,
    billing as never,
    { list: async () => ({ policies: [] }) } as never,
    {
      listMeetings: async () => ({
        meetings: [],
        summary: { total: 0, upcomingCount: 0, agendaMissingSoonCount: 0, minutesPendingCount: 0, minutesOverdueCount: 0, nextMeetingAt: null, earliestMinutesPendingHeldAt: null },
      }),
    } as never,
    { listOpenForBriefing: async () => [] } as never,
    { listStandards: async () => emptyRegister } as never,
    {
      listMaintenance: async () => ({
        items: [],
        summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 },
      }),
    } as never,
    {
      listCampaigns: async () => ({
        campaigns: [],
        summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 },
      }),
    } as never,
    { getActivePlanComputed: async () => ({ hasPlan: false }) } as never,
    prisma as never,
    undefined as never, // planningSignals
    undefined as never, // enrollmentPlanSvc
    undefined as never, // cashForecast
    accreditationCycle as never,
  )
}

async function itemsOf(svc: BriefingService) {
  const briefing = await svc.getBriefing('school-A', PERIOD.id, 'owner')
  return (briefing as { items: { id: string; severity: string; source: string; title: string; why: string; link: string; dueDate: string | null }[] }).items
}

const CONFIGURED_WITH_TROUBLE = {
  configured: true,
  framework: { id: 'fw-1', code: 'cognia_2025', name: 'Cognia Performance Standards (rev. 2025)' },
  milestones: [
    milestone({ key: 'findings_shared', label: 'Findings shared with stakeholders', state: 'done' }),
    milestone({
      key: 'progress_report',
      state: 'overdue',
      measure: { kind: 'prior_findings_closed', num: 3, den: 7, text: '3 of 7 prior-visit findings answered' },
    }),
    milestone({
      key: 'evidence_freeze',
      label: 'Evidence uploaded to accreditor portal',
      dueDate: '2028-03-15',
      state: 'at_risk',
      measure: { kind: 'defensible', num: 22, den: 100, text: 'Defensible readiness is 22% — under half, with the upload due within 180 days' },
    }),
    milestone({ key: 'review_year', label: 'Engagement Review', dueDate: '2028-04-12', state: 'upcoming' }),
    milestone({ key: 'self_assessment', state: 'not_measurable', measure: null, reason: 'No standards are on the register yet, so self-assessment progress cannot be measured.' }),
  ],
}

describe('STEP 2.20 — cycle milestones', () => {
  it('emits ONLY overdue/at_risk milestones, severity mapped, linking the journey', async () => {
    const items = await itemsOf(makeService({ cycle: CONFIGURED_WITH_TROUBLE }))
    const cycleItems = items.filter((i) => i.id.startsWith('accreditation:cycle-'))
    expect(cycleItems.map((i) => i.id).sort()).toEqual([
      'accreditation:cycle-evidence_freeze',
      'accreditation:cycle-progress_report',
    ])
    const overdue = cycleItems.find((i) => i.id.endsWith('progress_report'))!
    expect(overdue.severity).toBe('critical')
    expect(overdue.title).toBe('Accreditation Progress Report is overdue in your accreditation cycle')
    expect(overdue.why).toContain('3 of 7 prior-visit findings answered')
    expect(overdue.link).toBe('/accreditation?center=journey')
    expect(overdue.dueDate).toBe('2026-04-12')
    const atRisk = cycleItems.find((i) => i.id.endsWith('evidence_freeze'))!
    expect(atRisk.severity).toBe('warn')
    expect(atRisk.why).toContain('Defensible readiness is 22%')
  })

  it('NO ISO DATE in why — the dueDate field carries the date (house rule)', async () => {
    const items = await itemsOf(makeService({ cycle: CONFIGURED_WITH_TROUBLE }))
    for (const i of items.filter((x) => x.id.startsWith('accreditation:cycle-'))) {
      expect(i.why).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('MODULE GATE fail-closed: unlicensed → zero cycle items despite an overdue milestone', async () => {
    const items = await itemsOf(
      makeService({ accreditationLicensed: false, cycle: CONFIGURED_WITH_TROUBLE }),
    )
    expect(items.filter((i) => i.id.startsWith('accreditation:cycle-'))).toHaveLength(0)
  })

  it('an unconfigured cycle emits nothing (suppressed is not zero)', async () => {
    const items = await itemsOf(makeService({ cycle: { configured: false } }))
    expect(items.filter((i) => i.id.startsWith('accreditation:cycle-'))).toHaveLength(0)
  })

  it('a throwing cycle read is fail-soft: 200, zero cycle items, everything else intact', async () => {
    const items = await itemsOf(
      makeService({
        cycle: () => Promise.reject(new Error('cycle service down')),
      }),
    )
    expect(items.filter((i) => i.id.startsWith('accreditation:cycle-'))).toHaveLength(0)
  })
})

describe('STEP 2.21 — the superseded-framework notice', () => {
  const HELD_2022 = [
    { id: 'fw-2022', code: 'cognia_2022', name: 'Cognia Performance Standards (2022)', accreditor: 'Cognia', supersededByCode: 'cognia_2025' },
  ]

  it('a superseded holder with a seeded successor gets ONE quiet info line', async () => {
    const items = await itemsOf(
      makeService({
        heldFrameworks: HELD_2022,
        seededSuccessors: [{ code: 'cognia_2025', name: 'Cognia Performance Standards (rev. 2025)' }],
      }),
    )
    const notices = items.filter((i) => i.id.startsWith('accreditation:framework-superseded'))
    expect(notices).toHaveLength(1)
    expect(notices[0].severity).toBe('info')
    expect(notices[0].title).toBe('A newer edition of your Cognia standards is available')
    expect(notices[0].why).toContain('Cognia Performance Standards (rev. 2025)')
    expect(notices[0].link).toBe('/accreditation?center=standards')
    expect(notices[0].dueDate).toBeNull()
  })

  it('a DANGLING successor code reads as not superseded — no notice (fail-soft)', async () => {
    const items = await itemsOf(makeService({ heldFrameworks: HELD_2022, seededSuccessors: [] }))
    expect(items.filter((i) => i.id.startsWith('accreditation:framework-superseded'))).toHaveLength(0)
  })

  it('a school on the CURRENT edition gets no notice', async () => {
    const items = await itemsOf(
      makeService({
        heldFrameworks: [
          { id: 'fw-2025', code: 'cognia_2025', name: 'Cognia Performance Standards (rev. 2025)', accreditor: 'Cognia', supersededByCode: null },
        ],
      }),
    )
    expect(items.filter((i) => i.id.startsWith('accreditation:framework-superseded'))).toHaveLength(0)
  })

  it('unlicensed → no notice, fail-closed', async () => {
    const items = await itemsOf(
      makeService({
        accreditationLicensed: false,
        heldFrameworks: HELD_2022,
        seededSuccessors: [{ code: 'cognia_2025', name: 'Cognia Performance Standards (rev. 2025)' }],
      }),
    )
    expect(items.filter((i) => i.id.startsWith('accreditation:framework-superseded'))).toHaveLength(0)
  })
})
