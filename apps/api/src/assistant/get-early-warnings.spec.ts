import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { AssistantService } from './assistant.service.js'
import { TOOL_LABELS, TOOL_SCHEMAS } from './assistant.tools.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — Penny's READ-ONLY `get_early_warnings`.
//
// THE THING THIS FILE EXISTS TO PREVENT is not a bug, it is a category error:
// a language model given a findings payload will, unprompted, turn "likely" into
// "about a 70% chance" and "three critical findings" into "you will probably lose
// your accreditation". There is no outcome data anywhere in this program to
// calibrate a probability against, and predicting an accreditation decision is
// not ours to do.
//
// So the projection carries NO number that could be read as a probability, no
// field named probability/percent/chance, and on the thin branch NO `findings`
// key at all — there is nothing to speculate from.
//
// And it is READ-ONLY, structurally: not in WRITE_TOOLS, not in CONFIRM_TOOLS, no
// ApplyActionDto member. That is what makes it safe to offer to a viewer.
// ─────────────────────────────────────────────────────────────────────────────

const CTX = { schoolId: 'school-1', periodId: null, userId: 'user-1', user: {}, role: 'viewer' }
const SINKS = {
  onNavigate: vi.fn(),
  onGuide: vi.fn(),
  onProposal: vi.fn(),
  onStatus: vi.fn(),
  onChart: vi.fn(),
  onApplied: vi.fn(),
}

function twinPayload(over: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    now: '2026-08-01',
    frameworkCode: 'cognia_2022',
    demoData: false,
    snapshotAsOf: '2026-07-31',
    findings: [
      {
        ruleId: 'ACC-ASSURANCE-GAP',
        scopeKey: 'standard:s1',
        factKey: 'standard:s1:assurance_gap',
        title: 'An assurance gate has no evidence attached',
        rationale: 'COG-A2 is an assurance gate with 0 artifacts attached.',
        consequence: 'Assurances are pass or fail.',
        evidence: [
          { key: 'code', label: 'Standard', value: 'COG-A2', display: 'COG-A2', asOf: '2026-07-31', lineage: null },
        ],
        standardTags: ['COG-A2'],
        domainKeys: ['governance'],
        severity: 'critical',
        likelihood: 'likely',
        confidence: 'observation',
        horizon: { kind: 'none', value: null, confidence: null, reason: 'A condition today.' },
        id: 'f-1',
        findingKey: 'ACC-ASSURANCE-GAP:standard:s1',
        status: 'open',
        firstSeenAt: '2026-06-14T04:00:00.000Z',
        lastSeenAt: null,
        clearedAt: null,
        resolutionKind: null,
        mutedUntil: null,
        ackedUntil: null,
        mutedReason: null,
        reopenCount: 0,
        initiativeId: null,
        isDemo: false,
        findingCleared: false,
        clearedCopy: null,
      },
      {
        ruleId: 'GOV-CADENCE-GAP',
        scopeKey: 'school',
        factKey: 'register:board_meetings@trailing12',
        title: 'The board is meeting less often than quarterly',
        rationale: '2 board meetings were held.',
        consequence: 'Cadence is the first thing a reviewer counts.',
        evidence: [],
        standardTags: ['COG-8'],
        domainKeys: ['governance'],
        severity: 'warn',
        likelihood: 'possible',
        confidence: 'observation',
        horizon: { kind: 'none', value: null, confidence: null, reason: 'A condition today.' },
        id: null,
        findingKey: 'GOV-CADENCE-GAP:school',
        status: 'open',
        firstSeenAt: null,
        lastSeenAt: null,
        clearedAt: null,
        resolutionKind: null,
        mutedUntil: null,
        ackedUntil: null,
        mutedReason: null,
        reopenCount: 0,
        initiativeId: null,
        isDemo: false,
        findingCleared: false,
        clearedCopy: null,
      },
    ],
    cleared: [],
    notEvaluated: [
      {
        ruleId: 'FAC-BACKLOG',
        title: 'The maintenance backlog is not being worked',
        reason: 'signal_not_licensed',
        blockingSignalKey: 'fac.maintenance_backlog',
        blockingSignalLabel: 'Open maintenance items',
        message: 'Unlock the Facilities module to see Open maintenance items.',
        moduleKey: 'facilities',
        unlock: null,
      },
    ],
    coverage: {
      rulesTotal: 26,
      rulesEvaluated: 15,
      rulesFired: 2,
      rulesNotEvaluated: 11,
      evaluablePct: 0.577,
      signals: { available: 18, not_licensed: 6, no_data: 6, not_tracked: 5 },
      blockedByModule: { facilities: ['FAC-BACKLOG'] },
      unlockableByYears: { signalKey: null, ruleIds: [], yearsNeeded: 0, fyLabels: [] },
      namedHoles: [],
    },
    perStandardRisk: [],
    domainBands: [
      { domainKey: 'governance', band: 'high', reason: null, facts: { critical: 1, warn: 1, info: 0, total: 2 }, standardCount: 6, availableSignalCount: 5 },
      { domainKey: 'finance', band: 'clear', reason: null, facts: { critical: 0, warn: 0, info: 0, total: 0 }, standardCount: 5, availableSignalCount: 7 },
      { domainKey: 'technology', band: null, reason: 'Not measured.', facts: { critical: 0, warn: 0, info: 0, total: 0 }, standardCount: 0, availableSignalCount: 0 },
    ],
    ...over,
  }
}

function makeService(over: { licensed?: boolean; twin?: Record<string, unknown> } = {}) {
  const getTwin = vi.fn(async () => over.twin ?? twinPayload())
  const earlyWarning = { getTwin }
  const billing = { isEntitledForModule: vi.fn(async () => over.licensed ?? true) }
  const prisma = { user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) } }
  const periods = {
    listPeriods: vi.fn(async () => []),
    getOwnedPeriod: vi.fn(async () => {
      throw new Error('no period')
    }),
  }
  // The two Phase-E deps are appended LAST, so their indices are derived from the
  // constructor's own arity rather than re-typed — a future dep cannot silently
  // shift them without this spec noticing.
  const arity = AssistantService.length
  const args: unknown[] = Array(arity).fill({} as never)
  args[0] = prisma
  args[1] = periods
  args[arity - 2] = earlyWarning
  args[arity - 1] = billing
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, getTwin, billing }
}

const run = (svc: AssistantService, argsJson = '{}') =>
  (
    svc as unknown as {
      runToolCall: (
        tc: { id: string; function: { name: string; arguments: string } },
        ctx: unknown,
        sinks: unknown,
      ) => Promise<Record<string, unknown>>
    }
  ).runToolCall({ id: 't1', function: { name: 'get_early_warnings', arguments: argsJson } }, CTX, SINKS)

describe('get_early_warnings — registration and READ-ONLY-ness', () => {
  it('is registered with a schema and a status label', () => {
    const tool = TOOL_SCHEMAS.find((t) => t.function.name === 'get_early_warnings')
    expect(tool).toBeDefined()
    expect(TOOL_LABELS.get_early_warnings).toBe('Reading the early warnings…')
    expect(tool!.function.parameters.required).toEqual([])
  })

  it('the description carries the four prohibitions verbatim', () => {
    const d = TOOL_SCHEMAS.find((t) => t.function.name === 'get_early_warnings')!.function
      .description as string
    expect(d).toContain('NEVER convert it to a percentage')
    expect(d).toContain('Never predict an accreditation decision')
    expect(d).toContain('Never describe a staffing change as turnover')
    expect(d).toMatch(/Never use the word "trend" unless/)
  })

  it('is in NEITHER WRITE_TOOLS nor CONFIRM_TOOLS', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./assistant.service.ts', import.meta.url)),
      'utf8',
    )
    const write = src.slice(src.indexOf('const WRITE_TOOLS'), src.indexOf('const CONFIRM_TOOLS'))
    const confirm = src.slice(
      src.indexOf('const CONFIRM_TOOLS'),
      src.indexOf('const CONFIRM_TOOLS') + 2000,
    )
    expect(write).not.toContain('get_early_warnings')
    expect(confirm).not.toContain('get_early_warnings')
  })

  it('ApplyActionDto gained NO member — the tool cannot become a write by accident', () => {
    const dto = readFileSync(
      fileURLToPath(new URL('./dto/apply-action.dto.ts', import.meta.url)),
      'utf8',
    )
    expect(dto).not.toContain('early_warning')
    expect(dto).not.toContain('get_early_warnings')
  })
})

describe('get_early_warnings — the projection', () => {
  it('UNLICENSED: says so and returns nothing else to reason from', async () => {
    const h = makeService({ licensed: false })
    const out = await run(h.svc)
    expect(out.notLicensed).toBe(true)
    expect(out.findings).toBeUndefined()
    expect(h.getTwin).not.toHaveBeenCalled()
  })

  it('THIN: rulesEvaluated === 0 returns the frozen sentence with NO findings key', async () => {
    const twin = twinPayload({
      findings: [],
      coverage: { ...twinPayload().coverage, rulesEvaluated: 0, rulesFired: 0 },
    })
    const h = makeService({ twin })
    const out = await run(h.svc)
    expect(out.thin).toBe(true)
    expect(out.message).toBe(
      'There is not enough recorded data to evaluate a single early-warning rule for this school yet.',
    )
    expect('findings' in out).toBe(false)
    // It still names the holes — a refusal that explains itself.
    expect((out.notEvaluated as unknown[]).length).toBe(1)
  })

  it('returns the compact finding shape, with the ORDINAL likelihood word', async () => {
    const h = makeService()
    const out = await run(h.svc)
    const f = (out.findings as Record<string, unknown>[])[0]
    expect(Object.keys(f).sort()).toEqual([
      'confidence',
      'consequence',
      'evidence',
      'firstSeenAt',
      'horizon',
      'likelihood',
      'mutedUntil',
      'rationale',
      'ruleId',
      'severity',
      'standardCodes',
      'status',
      'title',
    ])
    expect(f.likelihood).toBe('likely')
    expect(f.standardCodes).toEqual(['COG-A2'])
  })

  it('carries the EVIDENCE CHAIN behind every rationale', async () => {
    const h = makeService()
    const out = await run(h.svc)
    const f = (out.findings as Record<string, unknown>[])[0]
    const evidence = f.evidence as Record<string, unknown>[]
    expect(evidence[0]).toEqual({ label: 'Standard', display: 'COG-A2', asOf: '2026-07-31' })
  })

  it('carries NO probability-shaped field, anywhere in the payload', async () => {
    const h = makeService()
    const out = await run(h.svc)
    const json = JSON.stringify(out)
    expect(json).not.toMatch(/"probability"/)
    expect(json).not.toMatch(/"percent"/)
    expect(json).not.toMatch(/"chance"/)
    expect(json).not.toMatch(/\d+\s*%/)
  })

  it('filters by severity and honours the limit, clamped to 1..10', async () => {
    const h = makeService()
    expect(
      ((await run(h.svc, '{"severity":"critical"}')).findings as unknown[]).length,
    ).toBe(1)
    expect(((await run(h.svc, '{"limit":1}')).findings as unknown[]).length).toBe(1)
    // A limit of 0 or 99 is clamped, not obeyed.
    expect(((await run(h.svc, '{"limit":0}')).findings as unknown[]).length).toBe(1)
    expect(((await run(h.svc, '{"limit":99}')).findings as unknown[]).length).toBe(2)
  })

  it('returns only the domain bands worth talking about — never the clear ones', async () => {
    const h = makeService()
    const out = await run(h.svc)
    const bands = out.domainBands as { domainKey: string }[]
    expect(bands.map((b) => b.domainKey)).toEqual(['governance'])
  })

  it('names the blocking signal and the module for every hole', async () => {
    const h = makeService()
    const out = await run(h.svc)
    const hole = (out.notEvaluated as Record<string, unknown>[])[0]
    expect(hole.blockingSignalLabel).toBe('Open maintenance items')
    expect(hole.moduleKey).toBe('facilities')
    expect(hole.message).toContain('Unlock the Facilities module')
  })

  it('is offered to a VIEWER — a board member is exactly the audience', async () => {
    const h = makeService()
    const out = await run(h.svc)
    expect(out.findings).toBeDefined()
    expect(CTX.role).toBe('viewer')
  })
})
