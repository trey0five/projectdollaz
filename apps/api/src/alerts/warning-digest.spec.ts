import { describe, expect, it, vi } from 'vitest'
import type { Alert, User } from '@finrep/db'
import { AlertService } from './alert.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — the `warning_digest` alert type.
//
// ONE NOTIFICATION PATH. No new scheduler, no new mailer method, no new audit
// action, no second runDue. This file's job is to prove that the third type rides
// the existing machinery and behaves like a product rather than like a firehose:
//
//   • unlicensed  -> no email, fail-closed
//   • nothing new -> NO EMAIL. A digest that says "nothing to report" trains
//                    people to ignore digests, and then the one that matters is
//                    ignored too.
//   • a send      -> lastSentAt AND the three per-finding watermarks
//   • force       -> sends, mutates NOTHING
//   • the audit action is STILL `alert.fired`, so the alert history renders with
//     no UI change at all
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u1', email: 'owner@school.test' } as unknown as User
const DAY = 24 * 3600 * 1000

function findingRow(over: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    schoolId: 's1',
    ruleId: 'ACC-ASSURANCE-GAP',
    findingKey: 'ACC-ASSURANCE-GAP:standard:x',
    severity: 'critical',
    status: 'open',
    standardTags: ['COG-A2'],
    clearedAt: null,
    mutedUntil: null,
    lastNotifiedAt: null,
    reopenCount: 0,
    notifiedReopenCount: 0,
    notifiedSeverity: null,
    evidencePayload: {
      title: 'An assurance gate has no evidence attached',
      rationale: 'COG-A2 is an assurance gate with 0 artifacts attached.',
      consequence: 'Assurances are pass or fail.',
    },
    ...over,
  }
}

function makeService(
  over: { licensed?: boolean; findings?: Record<string, unknown>[]; periods?: unknown[] } = {},
) {
  const sendAlert = vi.fn(async () => {})
  const alertUpdate = vi.fn(async (args: { data: Record<string, unknown> }) => args.data as never)
  const findingUpdateMany = vi.fn(async (_args?: Record<string, unknown>) => ({ count: 1 }))
  const prisma = {
    school: { findUnique: vi.fn(async () => ({ id: 's1', name: 'Test School' })) },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', email: USER.email })) },
    alert: {
      update: alertUpdate,
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'a1',
        ...args.data,
        lastSentAt: null,
        lastValue: null,
        lastBreached: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    accreditationFinding: {
      findMany: vi.fn(async () => over.findings ?? []),
      updateMany: findingUpdateMany,
    },
  }
  const periods = {
    listPeriods: vi.fn(
      async () => over.periods ?? [{ id: 'p1', hasSnapshot: true, label: 'FY2026' }],
    ),
  }
  const analytics = { computeMetricsResponse: vi.fn(async () => ({ metrics: [] })) }
  const insight = { insightFor: vi.fn(async () => ({ text: 'x', source: 'rule' })) }
  const audit = { write: vi.fn(async () => {}) }
  const config = { get: vi.fn(() => 'http://localhost:5173') }
  const billing = { isEntitledForModule: vi.fn(async () => over.licensed ?? true) }

  const svc = new AlertService(
    prisma as never,
    periods as never,
    analytics as never,
    insight as never,
    { sendAlert } as never,
    audit as never,
    config as never,
    billing as never,
  )
  return { svc, sendAlert, alertUpdate, findingUpdateMany, audit, billing, prisma }
}

function warningAlert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    schoolId: 's1',
    createdByUserId: 'u1',
    type: 'warning_digest',
    cadence: 'weekly',
    metricKey: null,
    operator: null,
    threshold: null,
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
  (
    svc as unknown as {
      evaluateOne: (
        a: Alert,
        o: { force: boolean; actorId?: string },
      ) => Promise<{ sent: boolean; detail: string }>
    }
  ).evaluateOne(alert, { force })

describe('create/update — a warning digest has no metric', () => {
  it('accepts warning_digest with a cadence', async () => {
    const { svc } = makeService()
    const row = await svc.create('s1', { type: 'warning_digest', cadence: 'weekly' } as never, 'u1')
    expect(row.type).toBe('warning_digest')
    expect(row.cadence).toBe('weekly')
  })

  it('defaults the cadence to weekly rather than leaving it null', async () => {
    const { svc } = makeService()
    const row = await svc.create('s1', { type: 'warning_digest' } as never, 'u1')
    expect(row.cadence).toBe('weekly')
  })

  it('REJECTS a metricKey / operator / threshold on create', async () => {
    const { svc } = makeService()
    for (const extra of [{ metricKey: 'operating_margin' }, { operator: 'lt' }, { threshold: 3 }]) {
      await expect(
        svc.create('s1', { type: 'warning_digest', cadence: 'weekly', ...extra } as never, 'u1'),
      ).rejects.toThrow(/findings, not a metric/)
    }
  })

  it('REJECTS the same fields on the patch path', async () => {
    const { svc, prisma } = makeService()
    prisma.alert.findFirst = vi.fn(async () => warningAlert()) as never
    await expect(
      svc.update('s1', 'a1', { metricKey: 'operating_margin' } as never, 'u1'),
    ).rejects.toThrow(/findings, not a metric/)
  })

  it('still rejects a type nobody defined', async () => {
    const { svc } = makeService()
    await expect(svc.create('s1', { type: 'nonsense' } as never, 'u1')).rejects.toThrow(
      /"digest", "threshold" or "warning_digest"/,
    )
  })
})

describe('evaluateWarningDigest — the gates', () => {
  it('UNLICENSED: no email, fail-closed', async () => {
    const h = makeService({ licensed: false, findings: [findingRow()] })
    const res = await evaluate(h.svc, warningAlert())
    expect(res.sent).toBe(false)
    expect(res.detail).toBe('Accreditation is not licensed for this school.')
    expect(h.sendAlert).not.toHaveBeenCalled()
    expect(h.alertUpdate).not.toHaveBeenCalled()
  })

  it('sends with NO FINANCE PERIOD AT ALL — accreditation does not wait on a trial balance', async () => {
    // The digest takes no periodId and composes its own /accreditation link, so
    // the snapshot-period gate that the two metric alert types need has nothing
    // to say about it. Below that gate, a school with a framework, evidence and
    // open findings but no uploaded trial balance never received a digest — and
    // the detail line blamed periods.
    const h = makeService({ findings: [findingRow()], periods: [] })
    const res = await evaluate(h.svc, warningAlert())
    expect(res.sent).toBe(true)
    expect(h.sendAlert).toHaveBeenCalledTimes(1)
  })

  it('a billing throw is also no email', async () => {
    const h = makeService({ findings: [findingRow()] })
    h.billing.isEntitledForModule.mockRejectedValueOnce(new Error('stripe down'))
    expect((await evaluate(h.svc, warningAlert())).sent).toBe(false)
    expect(h.sendAlert).not.toHaveBeenCalled()
  })

  it('respects the cadence exactly as the financial digest does', async () => {
    const h = makeService({ findings: [findingRow()] })
    const res = await evaluate(h.svc, warningAlert({ lastSentAt: new Date(Date.now() - 2 * DAY) }))
    expect(res).toEqual({ sent: false, detail: 'Not due yet (weekly).' })
    expect(h.sendAlert).not.toHaveBeenCalled()
  })

  it('ZERO candidates -> NO EMAIL, and says so', async () => {
    const h = makeService({ findings: [] })
    const res = await evaluate(h.svc, warningAlert())
    expect(res).toEqual({ sent: false, detail: 'No new early warnings since the last digest.' })
    expect(h.sendAlert).not.toHaveBeenCalled()
  })

  it('a finding that has ALREADY been notified is not a candidate', async () => {
    const h = makeService({
      findings: [findingRow({ lastNotifiedAt: new Date(Date.now() - DAY), notifiedSeverity: 'critical' })],
    })
    expect((await evaluate(h.svc, warningAlert())).sent).toBe(false)
  })

  it('a MUTED finding is not a candidate', async () => {
    const h = makeService({ findings: [findingRow({ mutedUntil: new Date(Date.now() + 10 * DAY) })] })
    expect((await evaluate(h.svc, warningAlert())).sent).toBe(false)
  })

  it('an INFO finding is never a candidate — it is not a warning', async () => {
    const h = makeService({ findings: [findingRow({ severity: 'info' })] })
    expect((await evaluate(h.svc, warningAlert())).sent).toBe(false)
  })
})

describe('evaluateWarningDigest — the send', () => {
  it('sends the ENGINE’s own sentences, verbatim, with the standard codes', async () => {
    const h = makeService({ findings: [findingRow()] })
    const res = await evaluate(h.svc, warningAlert())
    expect(res.sent).toBe(true)
    const [to, subject, text] = h.sendAlert.mock.calls[0] as unknown as [string, string, string]
    expect(to).toBe(USER.email)
    expect(subject).toBe('Test School — 1 accreditation early warning')
    expect(text).toContain('An assurance gate has no evidence attached')
    expect(text).toContain('COG-A2 is an assurance gate with 0 artifacts attached.')
    expect(text).toContain('[COG-A2]')
  })

  it('pluralises the subject and caps the body at ten, naming the remainder', async () => {
    const findings = Array.from({ length: 14 }, (_, i) =>
      findingRow({ id: `f-${i}`, findingKey: `R:${i}`, evidencePayload: { title: `T${i}`, rationale: 'r', consequence: 'c' } }),
    )
    const h = makeService({ findings })
    await evaluate(h.svc, warningAlert())
    const [, subject, text] = h.sendAlert.mock.calls[0] as unknown as [string, string, string]
    expect(subject).toBe('Test School — 14 accreditation early warnings')
    expect(text).toContain('…and 4 more in the Accreditation center.')
    expect(text).toContain('T9')
    expect(text).not.toContain('T10')
  })

  it('writes lastSentAt AND the three per-finding watermarks', async () => {
    const h = makeService({ findings: [findingRow()] })
    await evaluate(h.svc, warningAlert())
    expect(h.alertUpdate).toHaveBeenCalledTimes(1)
    expect(h.findingUpdateMany).toHaveBeenCalledTimes(1)
    const call = h.findingUpdateMany.mock.calls[0][0] as unknown as {
      where: { schoolId: string; id: { in: string[] } }
      data: Record<string, unknown>
    }
    // TENANCY rides on the WRITE.
    expect(call.where.schoolId).toBe('s1')
    expect(call.where.id.in).toEqual(['f-1'])
    expect(Object.keys(call.data).sort()).toEqual([
      'lastNotifiedAt',
      'notifiedReopenCount',
      'notifiedSeverity',
    ])
    expect(call.data.notifiedSeverity).toBe('critical')
  })

  it('groups the watermark write by (reopenCount, severity)', async () => {
    const h = makeService({
      findings: [
        findingRow({ id: 'f-1', severity: 'critical', reopenCount: 0 }),
        findingRow({ id: 'f-2', severity: 'critical', reopenCount: 0 }),
        findingRow({ id: 'f-3', severity: 'warn', reopenCount: 1 }),
      ],
    })
    await evaluate(h.svc, warningAlert())
    expect(h.findingUpdateMany).toHaveBeenCalledTimes(2)
  })

  it('the audit action is STILL alert.fired — the history renders with no UI change', async () => {
    const h = makeService({ findings: [findingRow()] })
    await evaluate(h.svc, warningAlert())
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alert.fired',
        targetType: 'alerts',
        metadata: expect.objectContaining({ type: 'warning_digest', findingCount: 1 }),
      }),
    )
  })

  it('FORCE sends and mutates NOTHING', async () => {
    const h = makeService({ findings: [findingRow()] })
    const res = await evaluate(h.svc, warningAlert({ lastSentAt: new Date() }), true)
    expect(res.sent).toBe(true)
    expect(h.sendAlert).toHaveBeenCalledTimes(1)
    expect(h.alertUpdate).not.toHaveBeenCalled()
    expect(h.findingUpdateMany).not.toHaveBeenCalled()
  })

  it('a ledger read failure is no email, never a throw into the sweep', async () => {
    const h = makeService({ findings: [] })
    h.prisma.accreditationFinding.findMany = vi.fn(async () => {
      throw new Error('relation does not exist')
    }) as never
    await expect(evaluate(h.svc, warningAlert())).resolves.toEqual({
      sent: false,
      detail: 'No new early warnings since the last digest.',
    })
  })
})
