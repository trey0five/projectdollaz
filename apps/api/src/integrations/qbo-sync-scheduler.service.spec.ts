import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { QboConnection } from '@finrep/db'
import { QboSyncSchedulerService, qboSyncDue } from './qbo-sync-scheduler.service.js'
import { QboService, type ScheduledSyncOutcome } from './qbo.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// QboSyncSchedulerService — the nightly QuickBooks auto-sync driver. Verifies
// (WITHOUT booting Nest; every dep hand-mocked):
//   • the PURE due-rule: overnight window, ≥28h stale self-heal, ≥80d keepalive
//     rescue outside the window, fresh-skip (thrash guard), and the failure gate
//   • runDue fair-order + MAX_PER_SWEEP cap + failure isolation (one throw, rest run)
//   • dead-token → needsReauth + exactly ONE reconnect email per episode
//   • entitlement-lapsed keepalive run does NOT reset needsReauth / notify
//   • force-run (runNow) bypasses the freshness/window gate
// ─────────────────────────────────────────────────────────────────────────────

const HOUR = 3600 * 1000
const WINDOW = { start: 2, end: 5 }

function baseDueInput(over: Partial<Parameters<typeof qboSyncDue>[0]> = {}) {
  const now = Date.now()
  return {
    now,
    serverHour: 3, // inside the 2–5 window by default
    window: WINDOW,
    lastSyncedAtMs: now - 30 * HOUR,
    lastScheduledSyncAtMs: now - 30 * HOUR,
    autoSyncFailures: 0,
    ...over,
  }
}

describe('qboSyncDue (pure rule)', () => {
  it('is due inside the overnight window when not fresh', () => {
    expect(qboSyncDue(baseDueInput({ serverHour: 3 }))).toBe(true)
  })

  it('skips a connection that was acted on recently (thrash guard)', () => {
    const now = Date.now()
    // A manual sync (or prior run) 2h ago → already fresh → not due, even in-window.
    expect(
      qboSyncDue(baseDueInput({ serverHour: 3, lastSyncedAtMs: now - 2 * HOUR, lastScheduledSyncAtMs: now - 2 * HOUR })),
    ).toBe(false)
  })

  it('is NOT due outside the window when only moderately stale', () => {
    const now = Date.now()
    expect(
      qboSyncDue(
        baseDueInput({
          serverHour: 14, // outside window
          lastSyncedAtMs: now - 24 * HOUR,
          lastScheduledSyncAtMs: now - 24 * HOUR, // acted 24h ago (<28h) → no stale catch-up
        }),
      ),
    ).toBe(false)
  })

  it('self-heals outside the window when the scheduler has not acted in ≥28h', () => {
    const now = Date.now()
    expect(
      qboSyncDue(
        baseDueInput({
          serverHour: 14, // outside window
          lastSyncedAtMs: now - 30 * HOUR,
          lastScheduledSyncAtMs: now - 30 * HOUR, // ≥28h → stale catch-up fires any hour
        }),
      ),
    ).toBe(true)
  })

  it('keepalive: rescues an 80d-stale token outside the window even when acted recently', () => {
    const now = Date.now()
    expect(
      qboSyncDue(
        baseDueInput({
          serverHour: 14, // outside window
          lastSyncedAtMs: now - 90 * 24 * HOUR, // no real sync in 90d → keepalive
          lastScheduledSyncAtMs: now - 24 * HOUR, // acted 24h ago (<28h, ≥20h floor) → not stale-catchup
        }),
      ),
    ).toBe(true)
  })

  it('defers when transient failures have hit the daily cap SAME DAY', () => {
    const now = Date.now()
    expect(qboSyncDue(baseDueInput({ now, autoSyncFailures: 3, lastScheduledSyncAtMs: now }))).toBe(false)
  })

  it('self-heals: failures from a PRIOR day no longer defer (the 3/day gate lifts)', () => {
    // 30h-old failures = a prior calendar day → gate lifts, in-window → due again.
    expect(
      qboSyncDue(
        baseDueInput({
          serverHour: 3,
          autoSyncFailures: 3,
          lastSyncedAtMs: Date.now() - 30 * HOUR,
          lastScheduledSyncAtMs: Date.now() - 30 * HOUR,
        }),
      ),
    ).toBe(true)
  })

  it('is due when never synced (nulls) and in-window', () => {
    expect(
      qboSyncDue(baseDueInput({ serverHour: 3, lastSyncedAtMs: null, lastScheduledSyncAtMs: null })),
    ).toBe(true)
  })
})

// ── runDue / runOne harness ──────────────────────────────────────────────────

function makeConn(over: Partial<QboConnection> = {}): QboConnection {
  const old = new Date(Date.now() - 40 * HOUR)
  return {
    id: `c-${over.schoolId ?? 's'}`,
    schoolId: 's1',
    realmId: 'r1',
    companyName: 'Co',
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: new Date(Date.now() + HOUR),
    environment: 'sandbox',
    connectedByUserId: 'u1',
    createdAt: old,
    updatedAt: old,
    autoSyncEnabled: true,
    needsReauth: false,
    lastScheduledSyncAt: old, // 40h ago → due (in a mid-window test we set serverHour)
    lastScheduledSyncStatus: null,
    lastScheduledSyncError: null,
    lastScheduledSyncRowCount: null,
    reauthNotifiedAt: null,
    autoSyncFailures: 0,
    ...over,
  } as QboConnection
}

/** Build a scheduler with hand-mocked deps; runScheduledSync returns per-school outcomes. */
function makeScheduler(opts: {
  connections?: QboConnection[]
  outcomes?: Record<string, ScheduledSyncOutcome | (() => Promise<ScheduledSyncOutcome>)>
  windowOpen?: boolean
  killSwitch?: boolean
}) {
  const connections = opts.connections ?? []
  const updates: Array<{ schoolId: string; data: Record<string, unknown> }> = []
  const sendAlert = vi.fn(async () => {})
  const auditWrite = vi.fn(async () => {})

  const prisma = {
    qboConnection: {
      findMany: vi.fn(async () => connections),
      findUnique: vi.fn(async ({ where }: { where: { schoolId: string } }) =>
        connections.find((c) => c.schoolId === where.schoolId) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { schoolId: string }; data: Record<string, unknown> }) => {
        updates.push({ schoolId: where.schoolId, data })
        return {}
      }),
    },
    // No qbo.synced audit rows → lastSyncedAt null (so due gating uses the conn stamp).
    auditLog: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ email: 'owner@school.test' })) },
    membership: { findMany: vi.fn(async () => []) },
    school: { findUnique: vi.fn(async () => ({ name: 'Test School' })) },
  }

  const runScheduledSync = vi.fn(async (schoolId: string): Promise<ScheduledSyncOutcome> => {
    const o = opts.outcomes?.[schoolId] ?? { status: 'synced', rowCount: 10 }
    return typeof o === 'function' ? o() : o
  })
  const qbo = { runScheduledSync }
  const mailer = { sendAlert }
  const audit = { write: auditWrite }
  // serverHour is read via new Date().getHours(); force windowOpen by widening the window.
  const window = opts.windowOpen === false ? '2-2' : '0-23'
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'quickbooks.autoSyncEnabled') return opts.killSwitch === true ? false : true
      if (key === 'quickbooks.autoSyncWindow') return window
      if (key === 'webOrigin') return 'http://localhost:5173'
      return undefined
    }),
  }

  const svc = new QboSyncSchedulerService(
    prisma as never,
    qbo as never,
    mailer as never,
    audit as never,
    config as never,
  )
  // Elide the real 750ms inter-connection spacing so sweeps run instantly in tests.
  vi.spyOn(svc as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue()
  return { svc, prisma, runScheduledSync, sendAlert, auditWrite, updates }
}

describe('QboSyncSchedulerService.runDue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('caps the number of syncs per sweep at MAX_PER_SWEEP (8)', async () => {
    const conns = Array.from({ length: 12 }, (_, i) => makeConn({ schoolId: `s${i}` }))
    const { svc, runScheduledSync } = makeScheduler({ connections: conns })
    await (svc as unknown as { runDue: () => Promise<void> }).runDue()
    expect(runScheduledSync).toHaveBeenCalledTimes(8)
  })

  it('processes connections in the query (fair) order', async () => {
    const conns = [makeConn({ schoolId: 'A' }), makeConn({ schoolId: 'B' }), makeConn({ schoolId: 'C' })]
    const { svc, runScheduledSync } = makeScheduler({ connections: conns })
    await (svc as unknown as { runDue: () => Promise<void> }).runDue()
    expect(runScheduledSync.mock.calls.map((c) => c[0])).toEqual(['A', 'B', 'C'])
  })

  it('isolates failures — one school throwing never aborts the rest', async () => {
    const conns = [makeConn({ schoolId: 'A' }), makeConn({ schoolId: 'B' }), makeConn({ schoolId: 'C' })]
    const { svc, runScheduledSync } = makeScheduler({
      connections: conns,
      outcomes: {
        B: async () => {
          throw new Error('boom')
        },
      },
    })
    await (svc as unknown as { runDue: () => Promise<void> }).runDue()
    // All three were attempted despite B throwing.
    expect(runScheduledSync.mock.calls.map((c) => c[0])).toEqual(['A', 'B', 'C'])
  })

  it('no-ops entirely when the global kill-switch is off', async () => {
    const { svc, runScheduledSync } = makeScheduler({
      connections: [makeConn({ schoolId: 'A' })],
      killSwitch: true,
    })
    await (svc as unknown as { runDue: () => Promise<void> }).runDue()
    expect(runScheduledSync).not.toHaveBeenCalled()
  })
})

describe('QboSyncSchedulerService.runOne — outcome persistence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dead token → needsReauth + exactly ONE reconnect email; a second run does NOT re-email', async () => {
    const conn = makeConn({ schoolId: 'S' })
    const { svc, sendAlert, updates } = makeScheduler({
      connections: [conn],
      outcomes: { S: { status: 'reauth' } },
    })

    const r1 = await svc.runOne(conn, { force: true })
    expect(r1.status).toBe('reauth')
    expect(sendAlert).toHaveBeenCalledTimes(1)
    const first = updates.find((u) => u.schoolId === 'S')!
    expect(first.data.needsReauth).toBe(true)
    expect(first.data.lastScheduledSyncStatus).toBe('reauth_required')
    expect(first.data.reauthNotifiedAt).toBeInstanceOf(Date)

    // Second episode-run with reauthNotifiedAt already set → NO second email.
    const conn2 = makeConn({ schoolId: 'S', reauthNotifiedAt: new Date() })
    await svc.runOne(conn2, { force: true })
    expect(sendAlert).toHaveBeenCalledTimes(1)
  })

  it('entitlement lapsed (not_entitled) → resets failures, does NOT set needsReauth or email', async () => {
    const conn = makeConn({ schoolId: 'S', autoSyncFailures: 2 })
    const { svc, sendAlert, updates } = makeScheduler({
      connections: [conn],
      outcomes: { S: { status: 'not_entitled' } },
    })
    const r = await svc.runOne(conn, { force: true })
    expect(r.status).toBe('not_entitled')
    expect(sendAlert).not.toHaveBeenCalled()
    const upd = updates.find((u) => u.schoolId === 'S')!
    expect(upd.data.autoSyncFailures).toBe(0)
    expect(upd.data.needsReauth).toBeUndefined()
  })

  it('transient error → increments the failure counter, leaves needsReauth false', async () => {
    const conn = makeConn({ schoolId: 'S' })
    const { svc, updates } = makeScheduler({
      connections: [conn],
      outcomes: { S: { status: 'error', error: 'network blip' } },
    })
    await svc.runOne(conn, { force: true })
    const upd = updates.find((u) => u.schoolId === 'S')!
    expect(upd.data.autoSyncFailures).toEqual({ increment: 1 })
    expect(upd.data.lastScheduledSyncError).toBe('network blip')
    expect(upd.data.needsReauth).toBeUndefined()
  })

  it('synced → stamps rowCount + status and resets failures', async () => {
    const conn = makeConn({ schoolId: 'S' })
    const { svc, updates, auditWrite } = makeScheduler({
      connections: [conn],
      outcomes: { S: { status: 'synced', rowCount: 42 } },
    })
    const r = await svc.runOne(conn, { force: true })
    expect(r).toMatchObject({ status: 'synced', rowCount: 42 })
    const upd = updates.find((u) => u.schoolId === 'S')!
    expect(upd.data.lastScheduledSyncStatus).toBe('synced')
    expect(upd.data.lastScheduledSyncRowCount).toBe(42)
    expect(upd.data.autoSyncFailures).toBe(0)
    // Always writes the scheduled-run audit marker.
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'qbo.auto_sync.ran' }),
    )
  })

  it('force-run ignores the freshness/window gate; a non-forced fresh conn is skipped', async () => {
    // A just-synced conn (fresh) with a closed window → NOT due.
    const fresh = makeConn({ schoolId: 'S', lastScheduledSyncAt: new Date() })
    const { svc, runScheduledSync } = makeScheduler({
      connections: [fresh],
      windowOpen: false,
      outcomes: { S: { status: 'synced', rowCount: 1 } },
    })
    const skipped = await svc.runOne(fresh, { force: false })
    expect(skipped.status).toBe('skipped')
    expect(runScheduledSync).not.toHaveBeenCalled()

    const forced = await svc.runOne(fresh, { force: true })
    expect(forced.status).toBe('synced')
    expect(runScheduledSync).toHaveBeenCalledTimes(1)
  })
})

// ── QboService.setAutoSync + runScheduledSync (the classified sync entry point) ──

/** Build a QboService with only the deps the auto-sync methods touch mocked. */
function makeQboService(over: {
  conn?: QboConnection | null
  entitled?: boolean
}) {
  const conn = over.conn === undefined ? makeConn({ schoolId: 'S' }) : over.conn
  const updates: Array<Record<string, unknown>> = []
  const auditWrite = vi.fn(async () => {})
  const prisma = {
    qboConnection: {
      findUnique: vi.fn(async () => conn),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data)
        return {}
      }),
    },
    auditLog: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', email: 'owner@school.test' })) },
    membership: { findFirst: vi.fn(async () => null) },
  }
  const config = { get: vi.fn(() => 'http://localhost:5173') }
  const client = { isConfigured: vi.fn(() => true) }
  const billing = { isEntitled: vi.fn(async () => over.entitled ?? true) }
  const moduleRef = { get: vi.fn() }
  const svc = new QboService(
    prisma as never,
    config as never,
    client as never,
    {} as never, // periods
    {} as never, // imports
    {} as never, // statements
    {} as never, // monthlySnapshots
    {} as never, // mapping
    { write: auditWrite } as never, // audit
    billing as never,
    moduleRef as never,
  )
  return { svc, updates, auditWrite, billing, moduleRef }
}

describe('QboService.setAutoSync (re-arm)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('enabling clears needsReauth / reauthNotifiedAt / autoSyncFailures', async () => {
    const conn = makeConn({ schoolId: 'S', needsReauth: true, autoSyncFailures: 3, reauthNotifiedAt: new Date() })
    const { svc, updates } = makeQboService({ conn })
    await svc.setAutoSync('S', true, 'u1')
    expect(updates[0]).toMatchObject({
      autoSyncEnabled: true,
      needsReauth: false,
      reauthNotifiedAt: null,
      autoSyncFailures: 0,
    })
  })

  it('disabling only flips the flag (does not re-arm)', async () => {
    const { svc, updates } = makeQboService({ conn: makeConn({ schoolId: 'S' }) })
    await svc.setAutoSync('S', false, 'u1')
    expect(updates[0]).toEqual({ autoSyncEnabled: false })
    expect(updates[0].needsReauth).toBeUndefined()
  })
})

describe('QboService.runScheduledSync (classification)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lapsed entitlement → not_entitled after a keepalive token refresh (no TB pull)', async () => {
    // conn.expiresAt is in the future → connectionForSchool returns the token without
    // a network refresh; billing.isEntitled=false → skip the TB pull.
    const { svc, billing, moduleRef } = makeQboService({ entitled: false })
    const outcome = await svc.runScheduledSync('S')
    expect(outcome).toEqual({ status: 'not_entitled' })
    expect(billing.isEntitled).toHaveBeenCalledWith('S')
    // The base-period resolver / TB pull is never reached when not entitled.
    expect(moduleRef.get).not.toHaveBeenCalled()
  })

  it('no connection → error, never throws', async () => {
    const { svc } = makeQboService({ conn: null })
    await expect(svc.runScheduledSync('S')).resolves.toMatchObject({ status: 'error' })
  })

  it('no actor (no connectedBy, no owner) → no_actor', async () => {
    const conn = makeConn({ schoolId: 'S', connectedByUserId: null })
    const { svc } = makeQboService({ conn })
    await expect(svc.runScheduledSync('S')).resolves.toEqual({ status: 'no_actor' })
  })
})
