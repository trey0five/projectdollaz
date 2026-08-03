import { describe, expect, it, vi } from 'vitest'
import { ReportScheduleService } from './report-schedule.service.js'
import { READINESS_ONE_PAGER_LABEL } from '../auth/mailer.service.js'
import { VisitService } from '../visit/visit.service.js'
import { READINESS_DISCLAIMER } from '../accreditation/readiness-history.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — SPEC-API-6. The FOURTH surface of one executive summary.
//
// Three claims, and the last two matter more than the first:
//   1. The email's readiness paragraphs ARE `segments.map(s => s.text)` — the
//      identical array the printed one-pager renders and the Mock Visit speaks.
//      This service composes nothing, so the email cannot drift from the page.
//   2. AN UNLICENSED SCHOOL'S EMAIL IS BYTE-IDENTICAL TO TODAY'S — proved through
//      the REAL VisitService, not a stub that throws. The first cut of this spec
//      stubbed `getVisit` to `throw new Error('MODULE_NOT_LICENSED')` and passed
//      with the leak fully present: production could not reach that state, because
//      the only entitlement check on the path lived on the controller this call
//      bypasses, so `getVisit` RESOLVED and the board of a school that never
//      bought accreditation received six accreditation paragraphs. A spec that
//      proves a proxy for the production path proves nothing about it.
//   3. THE CLAIMS NEVER TRAVEL WITHOUT THE DISCLAIMER. This is the only surface
//      of these six sentences that reaches a reader who never signs in, and the
//      only one with no footer to put the sentence in.
// ─────────────────────────────────────────────────────────────────────────────

const SEGMENTS = [
  { key: 'opening', text: 'A visiting team would arrive to the Cognia Performance Standards.' },
  { key: 'strengths', text: 'A visiting team would commend 1 standard.' },
  { key: 'findings', text: 'They would likely raise 4 findings.' },
  { key: 'evidence', text: 'They would ask for 11 artifacts.' },
  { key: 'unanswered', text: 'We could not answer 2 named questions.' },
  { key: 'plan', text: 'The draft plan commits to 2 pieces of work.' },
]

interface Over {
  visit?: () => Promise<unknown>
  /** Supply a whole VisitService (real or fake) instead of the default stub. */
  visitService?: { getVisit: (schoolId: string) => Promise<unknown> }
}

/**
 * A REAL `VisitService` over stubbed repositories, entitled or not. Everything
 * downstream of the gate RESOLVES — which is precisely the production state a
 * throwing stub cannot represent.
 */
function realVisitService(licensed: boolean) {
  const earlyWarning = {
    isLicensed: vi.fn(async () => licensed),
    getTwin: vi.fn(async () => ({
      version: '1.1.0',
      now: '2026-07-31T12:00:00.000Z',
      frameworkCode: null,
      demoData: false,
      snapshotAsOf: null,
      findings: [],
      cleared: [],
      notEvaluated: [],
      coverage: {
        rulesTotal: 29,
        rulesEvaluated: 0,
        rulesFired: 0,
        rulesNotEvaluated: 29,
        evaluablePct: 0,
        signals: { available: 0, not_licensed: 0, no_data: 0, not_tracked: 0 },
        blockedByModule: {},
        unlockableByYears: { signalKey: null, ruleIds: [], yearsNeeded: 0, fyLabels: [] },
        namedHoles: [],
      },
      perStandardRisk: [],
      domainBands: [],
      signals: [],
      disclaimer: READINESS_DISCLAIMER,
    })),
  }
  const soft = { getCommendations: vi.fn(async () => null) }
  return new VisitService(
    earlyWarning as never,
    soft as never,
    { getEvidenceReadiness: vi.fn(async () => null) } as never,
    { getReadiness: vi.fn(async () => null) } as never,
    { getRecommendations: vi.fn(async () => null) } as never,
  )
}

function harness(over: Over = {}) {
  const schedule = {
    schoolId: 'school-A',
    cadence: 'monthly',
    recipients: 'board@example.org',
    enabled: true,
    lastSentAt: null,
  }
  const prisma = {
    reportSchedule: {
      findUnique: vi.fn(async () => schedule),
      findMany: vi.fn(async () => [schedule]),
      update: vi.fn(async () => schedule),
    },
    school: { findUnique: vi.fn(async () => ({ id: 'school-A', name: 'St. Example' })) },
  }
  const periods = {
    listPeriods: vi.fn(async () => [{ id: 'p-1', label: 'FY2025–26', hasSnapshot: true }]),
  }
  const insight = { insightFor: vi.fn(async () => ({ text: 'The finance body.' })) }
  // Typed params on purpose: `nest build` compiles spec files, and an untyped
  // vi.fn() infers a zero-length arg tuple that `mock.calls[0][1]` cannot index.
  const sendBoardSummary = vi.fn(
    async (_email: string, _opts: Record<string, unknown>): Promise<void> => undefined,
  )
  const mailer = { sendBoardSummary }
  const audit = { write: vi.fn(async () => undefined) }
  const config = { get: vi.fn(() => 'https://app.example.org') }
  const getVisit = vi.fn(
    over.visit ??
      (async () => ({
        executiveSummary: { segments: SEGMENTS },
        disclaimer: READINESS_DISCLAIMER,
      })),
  )
  const visit = over.visitService ?? { getVisit }

  const svc = new ReportScheduleService(
    prisma as never,
    periods as never,
    insight as never,
    mailer as never,
    audit as never,
    config as never,
    visit as never,
  )
  return { svc, sendBoardSummary, getVisit, prisma }
}

/** The options object the mailer was handed on the one send. */
async function sendOnce(h: ReturnType<typeof harness>) {
  await h.svc.sendNow('school-A', 'user-1')
  expect(h.sendBoardSummary).toHaveBeenCalledTimes(1)
  return h.sendBoardSummary.mock.calls[0][1]
}

describe('SPEC-API-6 — the scheduled board email carries the SAME executive summary', () => {
  it('readinessParagraphs === segments.map(s => s.text), in order, verbatim', async () => {
    const h = harness()
    const opts = await sendOnce(h)
    expect(opts.readinessParagraphs).toEqual(SEGMENTS.map((s) => s.text))
  })

  it('links to the Board Readiness One-Pager, QUALIFIED BY SCHOOL', async () => {
    // Unqualified, the one-pager resolves its subject from the reader's persisted
    // scope: a diocesan recipient sitting on school A would open school B's email
    // and be handed A's readiness document — valid-looking, disclaimed, and about
    // the wrong tenant, stating different numbers from the email that carried it.
    const h = harness()
    const opts = await sendOnce(h)
    expect(opts.readinessLink).toBe(
      'https://app.example.org/accreditation/board/print?school=school-A',
    )
  })

  it('carries the disclaimer alongside the claims, verbatim and exactly once', async () => {
    const h = harness()
    const opts = await sendOnce(h)
    expect(opts.readinessDisclaimer).toBe(READINESS_DISCLAIMER)
  })

  it('the existing board-packet link and body are UNCHANGED', async () => {
    const h = harness()
    const opts = await sendOnce(h)
    expect(opts.body).toBe('The finance body.')
    expect(opts.link).toBe('https://app.example.org/board-packet/print?period=p-1')
    expect(opts.schoolName).toBe('St. Example')
  })
})

describe('SPEC-API-6 — an UNLICENSED school gets the email it gets today, byte for byte', () => {
  it('the REAL VisitService, unlicensed, attaches no readiness anything', async () => {
    // THE PRODUCTION PATH, not a proxy for it. Every repository stub below
    // RESOLVES; the only thing standing between an unlicensed school's board and
    // six accreditation paragraphs is the 402 `getVisit` raises for itself.
    const h = harness({ visitService: realVisitService(false) })
    const opts = await sendOnce(h)
    expect('readinessParagraphs' in opts).toBe(false)
    expect('readinessLink' in opts).toBe(false)
    expect('readinessDisclaimer' in opts).toBe(false)
    // …and everything the school gets today is still there, unchanged.
    expect(opts.body).toBe('The finance body.')
    expect(opts.link).toBe('https://app.example.org/board-packet/print?period=p-1')
  })

  it('the REAL VisitService, LICENSED, does attach them — so the test above is not vacuous', async () => {
    const h = harness({ visitService: realVisitService(true) })
    const opts = await sendOnce(h)
    expect(Array.isArray(opts.readinessParagraphs)).toBe(true)
    expect((opts.readinessParagraphs as string[]).length).toBe(6)
    expect(opts.readinessDisclaimer).toBe(READINESS_DISCLAIMER)
  })
})

describe('SPEC-API-6 — FAIL-SOFT: a broken visit read leaves the email exactly as it was', () => {
  it('a THROWING VisitService sends the email with no readiness fields at all', async () => {
    const h = harness({
      visit: async () => {
        throw new Error('MODULE_NOT_LICENSED')
      },
    })
    const opts = await sendOnce(h)
    // Absent, not empty: an empty array would render an empty readiness block.
    expect('readinessParagraphs' in opts).toBe(false)
    expect('readinessLink' in opts).toBe(false)
    // The disclaimer is emitted ONLY beside the claims it disclaims.
    expect('readinessDisclaimer' in opts).toBe(false)
    // …and everything the school gets today is still there.
    expect(opts.body).toBe('The finance body.')
    expect(opts.link).toBe('https://app.example.org/board-packet/print?period=p-1')
  })

  it('the send still counts as sent and the schedule is still stamped', async () => {
    const h = harness({
      visit: async () => {
        throw new Error('nope')
      },
    })
    const res = await h.svc.sendNow('school-A', 'user-1')
    expect(res.sent).toBe(1)
    expect(h.prisma.reportSchedule.update).toHaveBeenCalled()
  })

  it('the readiness read is attempted ONCE per send, not once per recipient', async () => {
    const h = harness()
    await h.svc.sendNow('school-A', 'user-1')
    expect(h.getVisit).toHaveBeenCalledTimes(1)
  })
})

describe('the mailer’s two new fields are OPTIONAL — no caller breaks', () => {
  it('exports the frozen label for the second link line', () => {
    expect(READINESS_ONE_PAGER_LABEL).toBe('View the accreditation readiness one-pager')
  })
})
