// ─────────────────────────────────────────────────────────────────────────────
// PENNY ANSWERED THE WRONG REGISTER, CONFIDENTLY.
//
// The dispatch behind check_kyro_collects was a TWO-way ternary over a FOUR-member
// register union, so the two AIC Phase-K registers — safe-environment clearances
// and professional development — fell to the else-branch and came back holding
// FACILITY-INSPECTION counts, wrapped in this very tool's honesty copy ("Counts
// only. This register holds people."). Asked whether the school tracks
// safeguarding clearances, Penny reported the number of overdue boiler
// inspections and called them people.
//
// That is worse than the refusal Phase J was built to prevent: silence is a gap,
// this was speech. Phase K's own tripwire spec asserted the REGISTRY ROW said
// "collected", never that a reader existed behind it — the table was checked and
// the code path was not.
//
// These drive the real reader with a mocked Prisma, and pin that each register
// answers with ITS OWN shape.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CoverageService } from './coverage.service.js'
import { COVERAGE_REGISTRY } from './coverage-topics.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const NOW = new Date('2026-08-05T00:00:00.000Z')

function harness(over: Record<string, unknown> = {}) {
  const prisma = {
    clearance: { findMany: vi.fn(async () => []) },
    professionalDevelopment: { findMany: vi.fn(async () => []) },
    maintenanceItem: { findMany: vi.fn(async () => []) },
    staffEvaluation: { findMany: vi.fn(async () => []) },
    ...over,
  }
  return { svc: new CoverageService(prisma as never), prisma }
}

describe('the clearance register answers about CLEARANCES', () => {
  it('counts lapsed and expiring-soon off the expiry date', async () => {
    const h = harness({
      clearance: {
        findMany: vi.fn(async () => [
          { kind: 'background_check', expiresOn: new Date('2026-06-01T00:00:00.000Z') }, // lapsed 65d
          { kind: 'background_check', expiresOn: new Date('2026-08-20T00:00:00.000Z') }, // soon
          { kind: 'safe_environment', expiresOn: new Date('2027-08-20T00:00:00.000Z') }, // fine
        ]),
      },
    })
    const out = await h.svc.clearances('s1', NOW)
    expect(out?.counts).toEqual({
      total: 3,
      lapsed: 1,
      expiringSoon: 1,
      oldestLapsedDays: 65,
    })
    // The shape a maintenance read could never produce — this is the assertion
    // that would have caught the ternary.
    expect(out?.counts).not.toHaveProperty('byStatus')
  })

  it('a clearance with NO expiry is not lapsed — some genuinely never expire', async () => {
    const h = harness({
      clearance: {
        findMany: vi.fn(async () => [{ kind: 'background_check', expiresOn: null }]),
      },
    })
    const out = await h.svc.clearances('s1', NOW)
    expect(out?.counts).toMatchObject({ total: 1, lapsed: 0, expiringSoon: 0 })
  })

  it('reads two columns, and neither of them is a person', async () => {
    const h = harness()
    await h.svc.clearances('s1', NOW)
    const args = (h.prisma.clearance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(Object.keys(args.select).sort()).toEqual(['expiresOn', 'kind'])
  })

  it('unreadable is null, never a comfortable zero', async () => {
    const h = harness({
      clearance: {
        findMany: vi.fn(async () => {
          throw new Error('db down')
        }),
      },
    })
    expect(await h.svc.clearances('s1', NOW)).toBeNull()
  })
})

describe('the PD register answers about PROFESSIONAL DEVELOPMENT', () => {
  it('counts DISTINCT people, not records — six workshops is one participant', async () => {
    const h = harness({
      professionalDevelopment: {
        findMany: vi.fn(async () => [
          { personId: 'p1', category: 'workshop' },
          { personId: 'p1', category: 'workshop' },
          { personId: 'p2', category: 'conference' },
        ]),
      },
    })
    const out = await h.svc.professionalDevelopment('s1', NOW)
    expect(out?.counts).toMatchObject({
      total: 3,
      participants: 2,
      byCategory: { workshop: 2, conference: 1 },
      lookbackYears: 1,
    })
  })

  it('carries NO participation rate — the denominator lives behind the PII boundary', async () => {
    const h = harness()
    const out = await h.svc.professionalDevelopment('s1', NOW)
    expect(out?.counts).not.toHaveProperty('participationRate')
    expect(out?.counts).not.toHaveProperty('staffCount')
  })

  it('never touches the governance-people register from this directory', () => {
    const src = readFileSync(HERE + 'coverage.service.ts', 'utf8')
    expect(src).not.toMatch(/governancePerson/)
  })
})

describe('the dispatch is TOTAL, and stays total', () => {
  const svc = readFileSync(HERE + 'assistant.service.ts', 'utf8')
  const block = svc.slice(svc.indexOf('Unhandled coverage register') - 2200, svc.indexOf('Unhandled coverage register') + 80)

  it('every register in the registry has its own case', () => {
    const registers = new Set(
      Object.values(COVERAGE_REGISTRY)
        .filter((e): e is Extract<typeof e, { collected: true }> => e.collected)
        .map((e) => e.register),
    )
    // Non-vacuity: the union really is four wide, which is what made a two-way
    // ternary a silent bug rather than an obvious one.
    expect(registers.size).toBe(4)
    for (const r of registers) expect(block, r).toContain(`case '${r}':`)
  })

  it('a fifth register would be a COMPILE error, not a mislabelled answer', () => {
    expect(block).toMatch(/const exhaustive: never = entry\.register/)
  })

  it('the ternary is gone — no two-way branch may decide a four-way question', () => {
    expect(svc).not.toMatch(/entry\.register === 'staff_evaluations'\s*\n?\s*\?/)
  })
})
