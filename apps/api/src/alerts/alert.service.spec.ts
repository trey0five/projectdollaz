import { describe, expect, it, vi } from 'vitest'
import type { Alert, User } from '@finrep/db'
import { AlertService } from './alert.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AlertService — the standing-request scheduler. Verifies (WITHOUT booting Nest,
// every dep a hand-mock):
//   • THRESHOLD edge-trigger: a fresh crossing sends; staying breached does NOT
//     re-send; recovering then breaching again re-arms and sends
//   • create() validation + recipient default (creator's email)
//   • a test (force) send bypasses gating and never mutates scheduler state
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u1', email: 'owner@school.test' } as unknown as User

/** Build a service whose days_cash_on_hand metric reads `metricValue`. */
function makeService(metricValue: number | null) {
  const sendAlert = vi.fn(async () => {})
  const alertUpdate = vi.fn(
    async (args: { data: Record<string, unknown> }) => ({ ...args.data }) as unknown as Alert,
  )
  const alertCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'a1',
    ...args.data,
    lastSentAt: null,
    lastValue: null,
    lastBreached: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Alert)
  const prisma = {
    school: { findUnique: vi.fn(async () => ({ id: 's1', name: 'Test School' })) },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', email: USER.email })) },
    alert: { update: alertUpdate, create: alertCreate, findFirst: vi.fn(), findMany: vi.fn() },
  }
  const periods = {
    listPeriods: vi.fn(async () => [{ id: 'p1', hasSnapshot: true, label: 'FY2026' }]),
  }
  const analytics = {
    computeMetricsResponse: vi.fn(async () => ({
      metrics: [
        {
          key: 'days_cash_on_hand',
          label: 'Days Cash on Hand',
          value: metricValue,
          available: metricValue != null,
          unit: 'days',
          status: 'ok',
          goodDirection: 'higher',
        },
      ],
    })),
  }
  const insight = { insightFor: vi.fn(async () => ({ text: 'All good.', source: 'rule' })) }
  const mailer = { sendAlert }
  const audit = { write: vi.fn(async () => {}) }
  const config = { get: vi.fn(() => 'http://localhost:5173') }

  const svc = new AlertService(
    prisma as never,
    periods as never,
    analytics as never,
    insight as never,
    mailer as never,
    audit as never,
    config as never,
  )
  return { svc, sendAlert, alertUpdate, alertCreate, prisma }
}

/** A threshold alert row: fire when days_cash_on_hand < 30. */
function thresholdAlert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    schoolId: 's1',
    createdByUserId: 'u1',
    type: 'threshold',
    cadence: null,
    metricKey: 'days_cash_on_hand',
    operator: 'lt',
    threshold: 30,
    recipientEmail: USER.email,
    enabled: true,
    lastSentAt: null,
    lastValue: null,
    lastBreached: false,
    label: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Alert
}

const evaluate = (svc: AlertService, alert: Alert, force = false) =>
  (svc as unknown as {
    evaluateOne: (a: Alert, o: { force: boolean; actorId?: string }) => Promise<{ sent: boolean }>
  }).evaluateOne(alert, { force })

describe('AlertService — threshold edge-trigger', () => {
  it('fresh crossing (breached && !lastBreached) → SENDS + arms lastBreached', async () => {
    const { svc, sendAlert, alertUpdate } = makeService(20) // 20 < 30 → breached
    const res = await evaluate(svc, thresholdAlert({ lastBreached: false }))
    expect(res.sent).toBe(true)
    expect(sendAlert).toHaveBeenCalledTimes(1)
    const data = alertUpdate.mock.calls[0][0].data as { lastBreached: boolean; lastValue: number }
    expect(data.lastBreached).toBe(true)
    expect(data.lastValue).toBe(20)
  })

  it('stays breached (breached && lastBreached) → does NOT re-send', async () => {
    const { svc, sendAlert, alertUpdate } = makeService(20)
    const res = await evaluate(svc, thresholdAlert({ lastBreached: true }))
    expect(res.sent).toBe(false)
    expect(sendAlert).not.toHaveBeenCalled()
    // Still persists state (lastBreached stays true) but stamps no send.
    const data = alertUpdate.mock.calls[0][0].data as { lastBreached: boolean }
    expect(data.lastBreached).toBe(true)
  })

  it('recovers above the line → re-arms (lastBreached back to false), no send', async () => {
    const { svc, sendAlert, alertUpdate } = makeService(40) // 40 >= 30 → not breached
    const res = await evaluate(svc, thresholdAlert({ lastBreached: true }))
    expect(res.sent).toBe(false)
    expect(sendAlert).not.toHaveBeenCalled()
    const data = alertUpdate.mock.calls[0][0].data as { lastBreached: boolean }
    expect(data.lastBreached).toBe(false)
  })

  it('breaches AGAIN after recovering (lastBreached false) → SENDS again', async () => {
    const { svc, sendAlert } = makeService(20)
    const res = await evaluate(svc, thresholdAlert({ lastBreached: false }))
    expect(res.sent).toBe(true)
    expect(sendAlert).toHaveBeenCalledTimes(1)
  })

  it('a test (force) send bypasses the edge gate and mutates NO scheduler state', async () => {
    const { svc, sendAlert, alertUpdate } = makeService(40) // not breached
    const res = await evaluate(svc, thresholdAlert({ lastBreached: false }), true)
    expect(res.sent).toBe(true) // force sends even when within range
    expect(sendAlert).toHaveBeenCalledTimes(1)
    expect(alertUpdate).not.toHaveBeenCalled() // no state mutation on a test
  })
})

describe('AlertService — create() validation + recipient default', () => {
  it('threshold: requires a valid metricKey/operator/threshold', async () => {
    const { svc } = makeService(20)
    await expect(svc.create('s1', { type: 'threshold' } as never, 'u1')).rejects.toThrow(/metricKey/i)
  })

  it('digest: defaults cadence to weekly and recipient to the creator email', async () => {
    const { svc, alertCreate } = makeService(20)
    await svc.create('s1', { type: 'digest' } as never, 'u1')
    const data = alertCreate.mock.calls[0][0].data
    expect(data.cadence).toBe('weekly')
    expect(data.recipientEmail).toBe(USER.email)
    expect(data.type).toBe('digest')
  })

  it('threshold: creates with the supplied metric/operator/threshold', async () => {
    const { svc, alertCreate } = makeService(20)
    await svc.create(
      's1',
      { type: 'threshold', metricKey: 'days_cash_on_hand', operator: 'lt', threshold: 30 } as never,
      'u1',
    )
    const data = alertCreate.mock.calls[0][0].data
    expect(data.metricKey).toBe('days_cash_on_hand')
    expect(data.operator).toBe('lt')
    expect(data.threshold).toBe(30)
  })
})
