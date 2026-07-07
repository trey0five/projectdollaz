import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { ArApAgingSnapshot } from '@finrep/db'
import { buildAgingAttentionItems } from './briefing-aging.js'

// ─────────────────────────────────────────────────────────────────────────────
// AR/AP aging — the 'cash' briefing STEP 2.11. Verifies the edge-triggered AR/AP
// thresholds (warn/critical), the 45-day stale downgrade, the honest non-signal
// (none), value-safety (aggregate $ + counts, NO party names), viewer-KEPT, and that
// every figure narrates for free (present in title∪why) — all WITHOUT booting Nest or
// Prisma. The briefing reads the snapshot DIRECTLY via a Prisma mock (the module rule:
// no QboAgingService). The pure helper is also unit-tested in isolation.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }
const CLEAN_METRICS = { metrics: [] as unknown[] }

/** Build an aging snapshot row (only the fields buildAgingAttentionItems reads). */
function agingRow(over: Partial<ArApAgingSnapshot>): ArApAgingSnapshot {
  return {
    id: 'a1',
    schoolId: 'school-1',
    asOfDate: over.asOfDate ?? new Date(),
    realmId: 'realm-1',
    environment: 'sandbox',
    source: 'aging-detail',
    capturedVia: 'sync',
    arTotal: over.arTotal ?? 0,
    arOverdue: over.arOverdue ?? 0,
    ar90Plus: over.ar90Plus ?? 0,
    apTotal: over.apTotal ?? 0,
    apOverdue: over.apOverdue ?? 0,
    apDueSoon: over.apDueSoon ?? 0,
    arAccounts: over.arAccounts ?? 0,
    ar90Count: over.ar90Count ?? 0,
    apVendors: over.apVendors ?? 0,
    arBuckets: {},
    apBuckets: {},
    arTop: [],
    apTop: [],
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ArApAgingSnapshot
}

/** A BriefingService whose ONLY signal source is the aging Prisma mock. */
function makeService(row: ArApAgingSnapshot | null) {
  const billing = { isEntitledForModule: async () => false } // isolate: no other module leaks
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => CLEAN_METRICS }
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  const policiesSvc = { list: async () => ({ policies: [] }) }
  const meetingsSvc = { listMeetings: async () => ({ meetings: [], summary: { total: 0, upcomingCount: 0, agendaMissingSoonCount: 0, minutesPendingCount: 0, minutesOverdueCount: 0, nextMeetingAt: null, earliestMinutesPendingHeldAt: null } }) }
  const tasks = { listOpenForBriefing: async () => [] }
  const accreditation = { listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }) }
  const advancement = { listCampaigns: async () => ({ campaigns: [], summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 } }) }
  const prisma = { arApAgingSnapshot: { findFirst: async () => row } }

  return new BriefingService(
    periods as never,
    analytics as never,
    compliance as never,
    checklist as never,
    reconciliation as never,
    corrective as never,
    billing as never,
    policiesSvc as never,
    meetingsSvc as never,
    tasks as never,
    accreditation as never,
    { listMaintenance: async () => ({ items: [], summary: { openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 } }) } as never,
    advancement as never,
    { getActivePlanComputed: async () => ({ hasPlan: false }) } as never, // strategy
    prisma as never,
  )
}

/** Every $ figure the narration will speak must live in title∪why (numeric-guard). */
function corpus(item: { title: string; why: string }): string {
  return `${item.title} ${item.why}`
}

describe('briefing — cash (AR/AP aging) STEP', () => {
  it('AR overdue (material, no 90+) → one WARN cash:ar-overdue item to /cash', async () => {
    const svc = makeService(agingRow({ arTotal: 100_000, arOverdue: 5000, ar90Plus: 0, arAccounts: 4 }))
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const ar = res.items.find((i) => i.id === 'cash:ar-overdue')
    expect(ar).toBeDefined()
    expect(ar!.severity).toBe('warn')
    expect(ar!.source).toBe('cash')
    expect(ar!.link).toBe('/cash')
    expect(ar!.value).toBe(5000)
    expect(corpus(ar!)).toContain('$5,000')
  })

  it('AR with ≥10% of AR sitting 90+ escalates to CRITICAL and states the 90+ figure + count', async () => {
    const svc = makeService(agingRow({ arTotal: 100_000, arOverdue: 20_000, ar90Plus: 15_000, ar90Count: 3 }))
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const ar = res.items.find((i) => i.id === 'cash:ar-overdue')!
    expect(ar.severity).toBe('critical')
    expect(corpus(ar)).toContain('$15,000')
    expect(corpus(ar)).toContain('3 accounts')
  })

  it('AP past due → WARN cash:ap-overdue with a due-soon clause; ≥50% past due → CRITICAL', async () => {
    const warn = await makeService(agingRow({ apTotal: 50_000, apOverdue: 9400, apDueSoon: 6100 })).getBriefing('school-1', PERIOD.id, 'owner')
    const ap = warn.items.find((i) => i.id === 'cash:ap-overdue')!
    expect(ap.severity).toBe('warn')
    expect(corpus(ap)).toContain('$9,400')
    expect(corpus(ap)).toContain('$6,100')

    const crit = await makeService(agingRow({ apTotal: 50_000, apOverdue: 30_000 })).getBriefing('school-1', PERIOD.id, 'owner')
    expect(crit.items.find((i) => i.id === 'cash:ap-overdue')!.severity).toBe('critical')
  })

  it('STALE (snapshot >45 days old) downgrades AR to INFO + adds a re-sync nudge', async () => {
    const old = new Date(Date.now() - 60 * 86_400_000)
    const svc = makeService(agingRow({ asOfDate: old, arTotal: 100_000, arOverdue: 20_000, ar90Plus: 15_000, ar90Count: 3 }))
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const ar = res.items.find((i) => i.id === 'cash:ar-overdue')!
    expect(ar.severity).toBe('info') // capped despite the 90+ critical trigger
    expect(ar.why).toContain('re-sync QuickBooks')
  })

  it('NONE: no overdue → no cash item; a below-floor immaterial overdue → no cash item', async () => {
    const clean = await makeService(agingRow({ arTotal: 100_000, arOverdue: 0, apOverdue: 0 })).getBriefing('school-1', PERIOD.id, 'owner')
    expect(clean.items.filter((i) => i.source === 'cash')).toHaveLength(0)

    // $500 overdue on $100k AR = 0.5% (< 5% AND < $1,000 floor) → not surfaced.
    const immaterial = await makeService(agingRow({ arTotal: 100_000, arOverdue: 500 })).getBriefing('school-1', PERIOD.id, 'owner')
    expect(immaterial.items.filter((i) => i.source === 'cash')).toHaveLength(0)
  })

  it('no snapshot (not connected / never captured) → no cash item, still 200', async () => {
    const res = await makeService(null).getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'cash')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('VALUE-SAFE: the item text carries NO party name (only aggregate $ + counts)', async () => {
    const items = buildAgingAttentionItems(
      agingRow({ arTotal: 100_000, arOverdue: 48_200, ar90Plus: 12_900, ar90Count: 6, apOverdue: 9400, apDueSoon: 6100, apTotal: 40_000 }),
      new Date().toISOString(),
    )
    expect(items).toHaveLength(2)
    // Value-safe by construction — the row carries no names; assert the copy is aggregate.
    for (const it of items) {
      expect(it.metricKey).toBeNull()
      expect(it.link).toBe('/cash')
    }
    expect(corpus(items[0])).toContain('$48,200')
    expect(corpus(items[0])).toContain('6 accounts')
  })

  it('VIEWER (board) lens KEEPS the cash items, values untouched', async () => {
    const svc = makeService(agingRow({ arTotal: 100_000, arOverdue: 20_000, ar90Plus: 15_000, ar90Count: 3, apTotal: 50_000, apOverdue: 9400 }))
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.find((i) => i.id === 'cash:ar-overdue')).toBeDefined()
    expect(res.items.find((i) => i.id === 'cash:ap-overdue')).toBeDefined()
    expect(res.items.find((i) => i.id === 'cash:ar-overdue')!.value).toBe(20_000)
  })
})
