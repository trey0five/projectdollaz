import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import type { StudentAggregate } from '../enrollment/students/students.service.js'
import {
  subtractionViolations,
  suppressedCellsCarryNoValue,
  type PublishedRoster,
} from '../enrollment/students/aggregate-suppression.testkit.js'
import { AssistantService } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F1 — get_roster_summary is SUPPRESSED BEFORE IT CAN REACH A PROMPT.
//
// The raw roster aggregate carries true counts; a supportFlags of { iep: 1 }
// spoken by Penny is a findable child. The handler now routes the aggregate
// through the ONE public gate (aggregate-suppression.ts), so a sub-floor cell
// arrives in the tool result as `{ suppressed: true }` with NO value key — the
// same structural-honesty shape every other Penny read uses. These assertions
// are about STRUCTURE: the number is not in the payload to leak.
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

function rawAggregate(flags: { iep: number; plan504: number; ell: number; any: number }) {
  return {
    source: 'roster' as const,
    total: 42,
    filteredTotal: 42,
    counts: {
      grade: { K: 12, '1': 3, '2': 27 },
      status: { enrolled: 40, waitlist: 2, withdrawn: 0, graduated: 0 },
      gender: {},
      race: {},
      ethnicity: {},
      ageBand: { under5: 0, '5to10': 20, '11to13': 12, '14to18': 10, '19plus': 0, unknown: 0 },
      flags,
    },
    kpis: { enrolled: 40, waitlist: 2, flagged: flags.any, newThisYear: 8 },
  }
}

function makeService(
  flags: { iep: number; plan504: number; ell: number; any: number },
  importRow: unknown = null,
  raw?: StudentAggregate,
) {
  const arity = AssistantService.length
  const args: unknown[] = Array(arity).fill({} as never)
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  const aggregate = vi.fn(async () => raw ?? rawAggregate(flags))
  // Post-construction stubs by NAME, not position: this spec asserts payload
  // shape only, and must not redden when the constructor gains a dependency.
  Object.assign(svc as unknown as Record<string, unknown>, {
    students: { aggregate },
    prisma: { enrollmentImport: { findFirst: vi.fn(async () => importRow) } },
  })
  return { svc, aggregate }
}

/** The tool payload → the walker's view (Penny's shape renames the sections). */
function publishedFromTool(res: Record<string, unknown>): PublishedRoster {
  return {
    total: res.total as PublishedRoster['total'],
    grade: res.byGrade as PublishedRoster['grade'],
    status: res.byStatus as PublishedRoster['status'],
    flags: res.supportFlags as PublishedRoster['flags'],
    kpis: res.kpis as PublishedRoster['kpis'],
  }
}

const run = (svc: AssistantService, args: Record<string, unknown> = {}) =>
  (
    svc as unknown as {
      runToolCall: (tc: unknown, ctx: unknown, sinks: unknown) => Promise<Record<string, unknown>>
    }
  ).runToolCall({ id: 't1', function: { name: 'get_roster_summary', arguments: JSON.stringify(args) } }, CTX, SINKS)

describe('get_roster_summary — the flag suppression the egress audit demanded', () => {
  it('★ a flag of n=1 leaves the server as { suppressed: true } with NO value key — the 1 is not in the payload', async () => {
    const res = await run(makeService({ iep: 1, plan504: 0, ell: 0, any: 1 }).svc)
    const flags = res.supportFlags as Record<string, unknown>
    expect(flags.iep).toEqual({ suppressed: true })
    expect(flags.iep).not.toHaveProperty('value')
    expect(flags.any).toEqual({ suppressed: true })
    expect(flags.plan504).toBe(0)
    expect(flags.ell).toBe(0)
    // The count must be unrepresentable, not merely relabelled.
    expect(JSON.stringify(flags)).not.toMatch(/:1\b/)
  })

  it('small status cells are suppressed on the SAME payload (REST-route parity — one gate, both doors)', async () => {
    const res = await run(makeService({ iep: 12, plan504: 8, ell: 6, any: 20 }).svc)
    const status = res.byStatus as Record<string, unknown>
    expect(status.waitlist).toEqual({ suppressed: true })
    // enrolled is PINNED raw: kpis.enrolled republishes it by product decision,
    // so dragging it as a companion would protect nothing — the reviewer's
    // subtraction (total − kpis.enrolled − visible) proved exactly that. A ZERO
    // status is taken as the companion instead, so only the pair-sum remains.
    expect(status.enrolled).toBe(40)
    const zerosHidden = ['withdrawn', 'graduated'].filter(
      (k) => typeof (status as Record<string, unknown>)[k] !== 'number',
    )
    expect(zerosHidden.length).toBe(1)
    // The KPI twin follows the dimension cell's final decision (lockstep).
    expect((res.kpis as Record<string, unknown>).waitlist).toEqual({ suppressed: true })
  })

  it('★ the reviewer extraction (enrolled 40 / waitlist 6 / withdrawn 2): nothing in the payload derives the hidden cell', async () => {
    const raw: StudentAggregate = {
      source: 'roster',
      total: 48,
      filteredTotal: 48,
      counts: {
        grade: { K: 20, '1': 16, '2': 12 },
        status: { enrolled: 40, waitlist: 6, withdrawn: 2, graduated: 0 },
        gender: {},
        race: {},
        ethnicity: {},
        ageBand: { under5: 0, '5to10': 48, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
        flags: { iep: 0, plan504: 0, ell: 0, any: 0 },
      },
      kpis: { enrolled: 40, waitlist: 6, flagged: 0, newThisYear: 8 },
    } as StudentAggregate
    const res = await run(makeService({ iep: 0, plan504: 0, ell: 0, any: 0 }, null, raw).svc)
    const kpis = res.kpis as Record<string, unknown>
    // The KPI twin must NOT republish the companion: 48 − 40 − 0 − kpis.waitlist
    // was the reviewer's recovery of the hidden withdrawn=2.
    expect(kpis.waitlist).toEqual({ suppressed: true })
    const pub = publishedFromTool(res)
    expect(subtractionViolations(pub, raw)).toEqual([])
    expect(suppressedCellsCarryNoValue(pub)).toEqual([])
  })

  it('★ the flags analog ({iep:2, plan504:10, ell:10, any:20}): kpis.flagged may not republish the hidden any', async () => {
    const raw: StudentAggregate = {
      source: 'roster',
      total: 48,
      filteredTotal: 48,
      counts: {
        grade: { K: 20, '1': 16, '2': 12 },
        status: { enrolled: 48, waitlist: 0, withdrawn: 0, graduated: 0 },
        gender: {},
        race: {},
        ethnicity: {},
        ageBand: { under5: 0, '5to10': 48, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 },
        flags: { iep: 2, plan504: 10, ell: 10, any: 20 },
      },
      kpis: { enrolled: 48, waitlist: 0, flagged: 20, newThisYear: 8 },
    } as StudentAggregate
    const res = await run(makeService({ iep: 2, plan504: 10, ell: 10, any: 20 }, null, raw).svc)
    const flags = res.supportFlags as Record<string, unknown>
    const kpis = res.kpis as Record<string, unknown>
    expect(flags.iep).toEqual({ suppressed: true })
    expect(flags.any).toEqual({ suppressed: true })
    expect(kpis.flagged).toEqual({ suppressed: true })
    const pub = publishedFromTool(res)
    expect(subtractionViolations(pub, raw)).toEqual([])
    expect(suppressedCellsCarryNoValue(pub)).toEqual([])
  })

  it('★ the handler queries the roster UNFILTERED — the hardcoded {} is what keeps Penny off the filtered-cross-tab surface', async () => {
    const { svc, aggregate } = makeService({ iep: 12, plan504: 8, ell: 6, any: 20 })
    await run(svc)
    // If a future change lets tool args reach this call, the REST route's
    // attributeFiltered gate MUST come with them — this assertion is the pin.
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(aggregate).toHaveBeenCalledWith('school-1', {})
  })

  it('grade headcounts stay RAW and the payload carries the floor + the counts-only note', async () => {
    const res = await run(makeService({ iep: 12, plan504: 8, ell: 6, any: 20 }).svc)
    expect(res.byGrade).toEqual({ K: 12, '1': 3, '2': 27 })
    expect(res.minCell).toBe(5)
    expect(String(res.note)).toContain('Counts only')
    expect(String(res.note)).toContain('below the reporting floor')
  })

  it('flags at/above the floor pass as plain numbers (nothing over-suppressed)', async () => {
    const res = await run(makeService({ iep: 12, plan504: 8, ell: 6, any: 20 }).svc)
    expect(res.supportFlags).toEqual({ iep: 12, plan504: 8, ell: 6, any: 20 })
  })

  it('the import receipt filename is sanitized (newlines/quotes/angles out, long names clipped)', async () => {
    const res = await run(
      makeService(
        { iep: 12, plan504: 8, ell: 6, any: 20 },
        {
          kind: 'roster',
          provider: 'csv',
          fileName: `roster<script>"x"\n${'y'.repeat(300)}.csv`,
          observedOn: null,
          totalCounted: 42,
          recordsCreated: 42,
          recordsUpdated: 0,
          recordsNote: null,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
      ).svc,
    )
    const fileName = (res.lastImport as { fileName: string }).fileName
    expect(fileName).not.toMatch(/[\r\n"<>]/)
    expect(fileName.length).toBeLessThanOrEqual(201)
  })
})
