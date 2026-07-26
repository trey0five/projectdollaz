import { describe, expect, it, vi } from 'vitest'
import { AssistantService } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import type { GovernanceReport } from '../governance/governance-report.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny read-only tool `get_governance_status`. Verifies (no Nest/Prisma boot;
// every dep a hand-mock): schema+label registered; the tool projects the composed
// GovernanceReportService.report() into the FROZEN compact shape (boardSize,
// termsExpiringSoon, per-committee hasChair, financeCredentialCoverage, policies,
// minutes, gaps); and the zero-data school response. READ-ONLY (NOT in
// WRITE/CONFIRM — ApplyActionDto untouched) so it is offered to viewers too.
// ─────────────────────────────────────────────────────────────────────────────

const CTX = { schoolId: 'school-1', periodId: null, userId: 'user-1', user: {}, role: 'viewer' }
const SINKS = { onNavigate: vi.fn(), onGuide: vi.fn(), onProposal: vi.fn(), onStatus: vi.fn(), onChart: vi.fn(), onApplied: vi.fn() }

const REPORT: GovernanceReport = {
  generatedAt: '2026-07-25T00:00:00.000Z',
  school: { id: 'school-1', name: "St. Mary's" },
  boardRoster: [
    { id: 'p1', name: 'Jane Smith', title: 'Board Chair', termStart: null, termEnd: '2026-08-01T00:00:00.000Z', termStatus: 'expiring_90d', bio: null, active: true },
    { id: 'p2', name: 'Bob Jones', title: 'Trustee', termStart: null, termEnd: '2026-09-01T00:00:00.000Z', termStatus: 'expiring_90d', bio: null, active: true },
    { id: 'p3', name: 'Old Guard', title: 'Trustee', termStart: null, termEnd: null, termStatus: 'no_term', bio: null, active: false },
  ],
  committees: [
    { id: 'c1', name: 'Finance', kind: 'finance', chairName: 'Jane Smith', chairSource: 'membership', memberCount: 3, members: [] },
    { id: 'c2', name: 'Audit', kind: 'other', chairName: null, chairSource: null, memberCount: 0, members: [] },
  ],
  financeTeam: {
    people: [
      { id: 'p4', name: 'Carol CFO', title: 'CFO', bio: null, hasCredentials: false, documents: [] },
      { id: 'p5', name: 'Dan Manager', title: null, bio: null, hasCredentials: true, documents: [{ id: 'd1', title: 'CPA License', tags: ['license'], createdAt: '2026-01-01T00:00:00.000Z' }] },
    ],
    coverage: { withDocs: 1, total: 2 },
  },
  policySummary: { total: 12, active: 11, pastReview: 2, lastAdoptedDate: '2026-01-15' },
  minutesDiscipline: { meetingsHeld: 8, approvedMinutes: 6, pendingApproval: 2, lastApprovedAt: '2026-06-01T00:00:00.000Z' },
}

const EMPTY: GovernanceReport = {
  generatedAt: '2026-07-25T00:00:00.000Z',
  school: { id: 'school-1', name: "St. Mary's" },
  boardRoster: [],
  committees: [],
  financeTeam: { people: [], coverage: { withDocs: 0, total: 0 } },
  policySummary: { total: 0, active: 0, pastReview: 0, lastAdoptedDate: null },
  minutesDiscipline: { meetingsHeld: 0, approvedMinutes: 0, pendingApproval: 0, lastApprovedAt: null },
}

function makeService(report: GovernanceReport) {
  const governanceReport = { report: vi.fn(async () => report) }
  const periods = { listPeriods: vi.fn(async () => []), getOwnedPeriod: vi.fn(async () => { throw new Error('no period') }) }
  const prisma = { user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) } }
  const stub = {} as never
  const args: unknown[] = Array(36).fill(stub)
  args[0] = prisma
  args[1] = periods
  args[35] = governanceReport // the LAST required constructor param
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, governanceReport }
}

const run = (svc: AssistantService, ctx: Record<string, unknown>) =>
  (svc as unknown as {
    runToolCall: (tc: { id: string; function: { name: string; arguments: string } }, ctx: unknown, sinks: unknown) => Promise<unknown>
  }).runToolCall({ id: 't1', function: { name: 'get_governance_status', arguments: '{}' } }, ctx, SINKS)

describe('get_governance_status (read-only governance tool)', () => {
  it('is registered with a schema and a status label', () => {
    const schema = TOOL_SCHEMAS.find((t) => (t as { function?: { name?: string } }).function?.name === 'get_governance_status')
    expect(schema).toBeTruthy()
    expect(TOOL_LABELS.get_governance_status).toBeTruthy()
  })

  it('projects the composed report into the frozen compact shape with plain-language gaps', async () => {
    const { svc, governanceReport } = makeService(REPORT)
    const out = (await run(svc, CTX)) as {
      boardSize: number
      activeBoardSize: number
      termsExpiringSoon: number
      committees: { name: string; memberCount: number; hasChair: boolean }[]
      financeCredentialCoverage: { withDocs: number; total: number }
      policies: { total: number; pastReview: number }
      minutes: { approved: number; lastApprovedAt: string | null }
      gaps: string[]
    }
    expect(governanceReport.report).toHaveBeenCalledWith('school-1')
    expect(out.boardSize).toBe(3)
    expect(out.activeBoardSize).toBe(2)
    expect(out.termsExpiringSoon).toBe(2)
    expect(out.committees).toEqual([
      { name: 'Finance', memberCount: 3, hasChair: true },
      { name: 'Audit', memberCount: 0, hasChair: false },
    ])
    expect(out.financeCredentialCoverage).toEqual({ withDocs: 1, total: 2 })
    expect(out.policies).toEqual({ total: 12, pastReview: 2 })
    expect(out.minutes).toEqual({ approved: 6, lastApprovedAt: '2026-06-01T00:00:00.000Z' })
    expect(out.gaps).toContain('2 board terms expire within 90 days')
    expect(out.gaps).toContain('CFO has no credentials on file')
    expect(out.gaps).toContain('Audit committee has no members')
    expect(out.gaps).toContain('2 policies are past review')
  })

  it('zero-data school → zero counts and no gaps (never a 500)', async () => {
    const { svc } = makeService(EMPTY)
    const out = (await run(svc, CTX)) as { boardSize: number; committees: unknown[]; gaps: string[] }
    expect(out.boardSize).toBe(0)
    expect(out.committees).toEqual([])
    expect(out.gaps).toEqual([])
  })
})
