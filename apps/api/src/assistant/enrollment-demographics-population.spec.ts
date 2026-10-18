import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy review round 6 — ONE POPULATION. KYRO's get_enrollment_demographics
// read the latest SNAPSHOT even when the school was in roster mode, while
// /enrollment/demographics, the analytics card and the roster aggregate
// counted Student rows. Each surface suppressed its own partition, so two
// populations a few students apart gave a small cell back by subtraction (a
// race visible on one surface and hidden on the other). The tool now reads
// through EnrollmentService.demographics — the same roster-mode rule — and the
// same public gate (suppressDemographicsView).
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'user-1', email: 'head@school.test' } as unknown as User
const CTX = { schoolId: 'school-1', periodId: 'period-1', userId: USER.id, user: USER, role: 'owner' as const }
const SINKS = { onChart: vi.fn(), onAdvisory: vi.fn(), onProposal: vi.fn(), onNavigate: vi.fn(), onApplied: vi.fn(), onGuide: vi.fn() }

function makeService(view: unknown) {
  const args: unknown[] = Array(AssistantService.length).fill({} as never)
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  const demographics = vi.fn(async () => view)
  const snapshot = vi.fn(async () => {
    throw new Error('the snapshot must not be read when the service answers')
  })
  Object.assign(svc as unknown as Record<string, unknown>, {
    enrollmentAnalytics: { demographicsView: demographics },
    prisma: { enrollmentSnapshot: { findFirst: snapshot } },
  })
  return { svc, demographics, snapshot }
}
const run = (svc: AssistantService, args: Record<string, unknown> = {}) =>
  (svc as unknown as { runToolCall: (tc: unknown, ctx: unknown, sinks: unknown) => Promise<Record<string, unknown>> }).runToolCall(
    { id: 't1', function: { name: 'get_enrollment_demographics', arguments: JSON.stringify(args) } },
    CTX,
    SINKS,
  )

describe('get_enrollment_demographics — the same population as every other demographic surface', () => {
  it('★ reads through EnrollmentService.demographics (via the analytics service; roster mode: the Student rows) and the public gate', async () => {
    const { svc, demographics, snapshot } = makeService({
      observedOn: '2026-10-17',
      provider: 'roster',
      source: 'roster',
      totalEnrolled: 60,
      gender: { counts: { female: 30, male: 30 }, shares: { female: 0.5, male: 0.5 } },
      ethnicity: null,
      race: { counts: { white: 40, black: 18, mena: 2 }, shares: { white: 0.667, black: 0.3, mena: 0.033 }, diversityIndex: 0.46 },
      gradeMix: { counts: { K: 60 }, shares: { K: 1 } },
    })
    const res = await run(svc, { periodId: 'fp-1' })
    expect(demographics).toHaveBeenCalledWith('school-1', 'fp-1')
    expect(snapshot).not.toHaveBeenCalled()
    expect(res.source).toBe('roster')
    const race = res.race as { counts: Record<string, unknown>; shares: Record<string, unknown> }
    // mena is small; the first companion in key order goes with it.
    expect(race.counts.mena).toEqual({ suppressed: true })
    expect(race.counts.black).toEqual({ suppressed: true, reason: 'complementary' })
    expect(race.shares.mena).toEqual({ suppressed: true })
    expect(JSON.stringify(res)).not.toMatch(/"mena":2|0\.033/)
  })

  it('no data ⇒ hasData false', async () => {
    const { svc } = makeService(null)
    expect(await run(svc)).toEqual({ hasData: false })
  })
})
