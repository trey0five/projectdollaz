import { describe, expect, it, vi } from 'vitest'
import { AssistantService } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny read-only ORG tool `list_schools_status`. Verifies (no Nest/Prisma boot;
// every dep a hand-mock):
//   • runToolCall routes to orgBriefing.getOrgBriefing (self-authorizing service)
//   • the result is TRIMMED to the model-friendly roster shape (consolidated,
//     schools[{name,reported,periodLabel,critical,warn}], behind[], topItems[])
//   • it is a READ tool: NOT in WRITE/CONFIRM sets → offered to viewers too
//   • no org → a soft { error } (no throw), mirroring get_budget_rollup
// ─────────────────────────────────────────────────────────────────────────────

const CTX = { schoolId: 'school-1', periodId: null, userId: 'user-1', user: {}, role: 'owner' }
const SINKS = { onNavigate: vi.fn(), onGuide: vi.fn(), onProposal: vi.fn(), onStatus: vi.fn() }

// getOrgBriefing's full response; the tool must TRIM it to a compact roster.
const ORG_BRIEFING = {
  orgId: 'org-1',
  fiscalYearStart: '2025-07',
  generatedAt: 'now',
  consolidated: { total: 5, critical: 2, warn: 3, info: 0, schoolsReporting: 1, schoolCount: 2 },
  schools: [
    {
      schoolId: 'school-1',
      name: 'Reporting Academy',
      reported: true,
      periodLabel: 'FY2026',
      summary: { total: 5, critical: 2, warn: 3, info: 0 },
    },
    { schoolId: 'school-2', name: 'Behind Prep', reported: false, periodLabel: null, summary: null },
  ],
  items: [
    { id: 'a', severity: 'critical', title: 'Days cash below floor', schoolId: 'school-1', schoolName: 'Reporting Academy', orgItemId: 'school-1:a' },
    { id: 'b', severity: 'warn', title: 'AUP readiness gap', schoolId: 'school-1', schoolName: 'Reporting Academy', orgItemId: 'school-1:b' },
  ],
  notReported: [{ schoolId: 'school-2', name: 'Behind Prep' }],
  capApplied: false,
  cappedItemCount: 0,
  lens: 'leadership',
  callerRole: 'leadership',
  availableLenses: ['leadership'],
}

function makeService(opts: { orgId?: string | null } = {}) {
  const getOrgBriefing = vi.fn(async () => ORG_BRIEFING)
  const prisma = {
    school: { findUnique: vi.fn(async () => ({ id: 'school-1', organizationId: opts.orgId === undefined ? 'org-1' : opts.orgId })) },
    user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) },
  }
  // periods throws → the try/catch falls back to fys=null (no FY resolution needed here).
  const periods = { getOwnedPeriod: vi.fn(async () => { throw new Error('no period') }) }
  const orgBriefing = { getOrgBriefing }
  const stub = {} as never

  // Positional constructor: prisma(0), periods(1), … orgBriefing(25), audit(26, LAST).
  const args: unknown[] = Array(27).fill(stub)
  args[0] = prisma
  args[1] = periods
  args[25] = orgBriefing
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, getOrgBriefing }
}

const run = (svc: AssistantService, ctx: Record<string, unknown>) =>
  (svc as unknown as {
    runToolCall: (tc: { id: string; function: { name: string; arguments: string } }, ctx: unknown, sinks: unknown) => Promise<unknown>
  }).runToolCall({ id: 't1', function: { name: 'list_schools_status', arguments: '{}' } }, ctx, SINKS)

describe('list_schools_status (read-only ORG roster tool)', () => {
  it('is registered with a schema and a status label', () => {
    const schema = TOOL_SCHEMAS.find((t) => (t as { function?: { name?: string } }).function?.name === 'list_schools_status')
    expect(schema).toBeTruthy()
    expect(TOOL_LABELS.list_schools_status).toBeTruthy()
  })

  it('trims getOrgBriefing into a compact model-friendly roster', async () => {
    const { svc, getOrgBriefing } = makeService()
    const out = (await run(svc, CTX)) as {
      consolidated: unknown
      schools: { name: string; reported: boolean; periodLabel: string | null; critical: number; warn: number }[]
      behind: string[]
      topItems: { school: string; title: string; severity: string }[]
    }
    expect(getOrgBriefing).toHaveBeenCalledWith(expect.anything(), 'org-1', null)
    expect(out.consolidated).toEqual(ORG_BRIEFING.consolidated)
    expect(out.schools).toEqual([
      { name: 'Reporting Academy', reported: true, periodLabel: 'FY2026', critical: 2, warn: 3 },
      { name: 'Behind Prep', reported: false, periodLabel: null, critical: 0, warn: 0 },
    ])
    expect(out.behind).toEqual(['Behind Prep'])
    expect(out.topItems).toEqual([
      { school: 'Reporting Academy', title: 'Days cash below floor', severity: 'critical' },
      { school: 'Reporting Academy', title: 'AUP readiness gap', severity: 'warn' },
    ])
    // No summary present must not become NaN — defaults to 0.
    expect(out.schools[1].critical).toBe(0)
  })

  it('returns a soft error (no throw) when the school has no organization', async () => {
    const { svc, getOrgBriefing } = makeService({ orgId: null })
    const out = (await run(svc, CTX)) as { error?: string }
    expect(out.error).toMatch(/not part of an organization/i)
    expect(getOrgBriefing).not.toHaveBeenCalled()
  })
})
