import { describe, expect, it, vi } from 'vitest'
import { HttpException, UnprocessableEntityException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// PENNY COVERAGE PHASE 1 — the FORWARD cash projection tool and its two writes.
//
// Three things here are load-bearing and each has shipped broken somewhere
// before:
//
//   ★ persist:false. project() FREEZES a CashProjectionRun by default — the
//     archive back-testing is built from, a record of what a school was TOLD and
//     WHEN. A question is not a decision, and the value is HARDCODED rather than
//     read from LLM args, so a prompt cannot turn a question into an archive
//     entry. Pinned on the call ARGUMENTS, because that is the only place the
//     regression would be visible.
//
//   ★ the upsert-undo trap. saveAdjustment upserts by (school, sourceRef), so an
//     apply that REPLACED an adjustment created nothing — and undoing it by
//     deleting the row would restore the DERIVED line rather than the adjustment
//     the school had before. Silently wrong state, offered as an Undo button.
//
//   ★ the sourceRef boundary. A commitment:* ref is refused at BUILD, before the
//     user is asked to confirm — not at /apply, after they already have.
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

function projection(over: Record<string, unknown> = {}) {
  return {
    asOfDate: '2026-08-01',
    horizonEnd: '2026-10-31',
    granularity: 'week',
    openingCash: 400_000,
    buckets: [],
    lowestBalance: 82_000,
    lowestDate: '2026-09-20',
    endingBalance: 150_000,
    firstShortfallDate: '2026-09-14',
    shortfallAmount: 18_400,
    daysOfNotice: 44,
    monthsCashAtLowPoint: 0.9,
    byConfidence: {},
    totalReceipts: 900_000,
    totalDisbursements: 1_100_000,
    driversToLowPoint: [{ category: 'payroll', amount: 640_000 }],
    nextReceiptAfterLow: null,
    receiptsBeforeLowPoint: 210_000,
    ...over,
  }
}

/** N distinct forecast lines, largest first — for the truncation assertions. */
function flows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    sourceRef: `qbo:ap:bill-${i}`,
    origin: 'qbo_ap',
    provenance: 'observed',
    label: `Bill ${i}`,
    category: 'operations',
    direction: 'out',
    confidence: 'scheduled',
    eventCount: 1,
    derivedTotal: 100_000 - i,
    derivedNet: -(100_000 - i),
    appliedTotal: 100_000 - i,
    firstDate: '2026-08-10',
    lastDate: '2026-08-10',
    editable: 'adjustable',
    commitmentId: null,
    adjustment: null,
  }))
}

function makeService(over: {
  licensed?: boolean
  opening?: Record<string, unknown>
  project?: Record<string, unknown>
  flows?: number
  adjustments?: { id: string; sourceRef: string; kind: string; overrideAmount: number | null; note: string | null }[]
  /** F2: a prisma stand-in (auditLog + cashFlowLineAdjustment) for the undo path. */
  prisma?: Record<string, unknown>
  /** F2: an audit writer capturing what applyAction stamps into the log. */
  audit?: Record<string, unknown>
} = {}) {
  // The mock DECLARES its parameters so `mock.calls[0][2]` type-checks: the
  // docker image build compiles specs, and an untyped `vi.fn(async () => …)` has
  // an empty tuple for its call args.
  const projectSpy = vi.fn(async (_schoolId: string, _userId: string | null, _opts: Record<string, unknown>) => ({
    projection: projection(),
    opening: {},
    dataTier: 'high',
    dataTierReason: 'QuickBooks is connected.',
    disclaimer: 'Forecast confidence reflects data completeness, not financial health.',
    committedShare: 0.72,
    assumptions: {},
    blockedReason: null,
    sources: {},
    qboOpeningCash: null,
    omissions: [],
    flows: flows(over.flows ?? 0),
    flowsTruncated: false,
    ...over.project,
  }))
  const createCommitment = vi.fn(async () => ({ id: 'commitment-new' }))
  const saveAdjustment = vi.fn(async () => ({ id: 'adjustment-new' }))
  const removeCommitment = vi.fn(async () => ({ removed: 1 }))
  const removeAdjustment = vi.fn(async () => ({ removed: 1 }))
  const listAdjustments = vi.fn(async () => ({ adjustments: over.adjustments ?? [] }))
  const cashForecast = {
    getOpening: vi.fn(async () => ({
      openingCash: 400_000,
      asOfDate: '2026-08-01',
      source: 'keyed',
      tbCash: 612_000,
      ageDays: 3,
      stale: false,
      ...over.opening,
    })),
    project: projectSpy,
    createCommitment,
    saveAdjustment,
    removeCommitment,
    removeAdjustment,
    listAdjustments,
  }
  const billing = { isEntitledForModule: vi.fn(async () => over.licensed ?? true) }

  // Positional DI, matching every sibling spec. The indices are DERIVED from the
  // constructor's own arity rather than retyped: the new Phase-1 trio sits
  // immediately AHEAD of the tail `get-early-warnings.spec` pins at
  // arity-3/arity-2 and `create-initiative.spec` pins at arity-4, so a dependency
  // added anywhere cannot shift these without one of those specs saying so.
  const arity = AssistantService.length
  const args: unknown[] = Array(arity).fill({} as never)
  args[0] = over.prisma ?? ({} as never)
  args[26] = over.audit ?? ({} as never) // audit — same index activity-undo.spec pins
  args[arity - 7] = cashForecast
  args[arity - 2] = billing
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  return { svc, cashForecast, billing, projectSpy, createCommitment, saveAdjustment, removeCommitment, removeAdjustment, listAdjustments }
}

const run = (svc: AssistantService, name: string, args: Record<string, unknown> = {}) =>
  (
    svc as unknown as {
      runToolCall: (
        tc: { id: string; function: { name: string; arguments: string } },
        ctx: typeof CTX,
        sinks: typeof SINKS,
      ) => Promise<Record<string, unknown>>
    }
  ).runToolCall({ id: 't1', function: { name, arguments: JSON.stringify(args) } }, CTX, SINKS)

const dispatch = (svc: AssistantService, action: ProposedAction) =>
  (
    svc as unknown as {
      dispatchApply: (
        schoolId: string,
        user: User,
        action: ProposedAction,
      ) => Promise<{ summary: string; createdId: string | null; existingId?: string | null }>
    }
  ).dispatchApply('school-1', USER, action)

describe('get_cash_forecast — the read', () => {
  it('★ HARDCODES persist:false — a question never writes to the back-testing archive', async () => {
    const { svc, projectSpy } = makeService()
    await run(svc, 'get_cash_forecast')
    expect(projectSpy).toHaveBeenCalledTimes(1)
    // Pinned on the ARGUMENTS, which is the only place the regression is visible.
    expect(projectSpy.mock.calls[0][2]).toMatchObject({ persist: false })
  })

  it('★ IGNORES persist from LLM args — the model cannot turn a question into an archive entry', async () => {
    const { svc, projectSpy } = makeService()
    await run(svc, 'get_cash_forecast', { persist: true })
    expect(projectSpy.mock.calls[0][2]).toMatchObject({ persist: false })
  })

  it('projects from the STATED opening balance, not the trial-balance figure', async () => {
    const { svc, projectSpy } = makeService()
    await run(svc, 'get_cash_forecast')
    expect(projectSpy.mock.calls[0][2]).toMatchObject({
      openingCash: 400_000,
      asOfDate: '2026-08-01',
      openingSource: 'keyed',
    })
  })

  it('MODULE GATE: neither finance nor planning → a refusal carrying nothing to improvise from', async () => {
    const { svc, projectSpy } = makeService({ licensed: false })
    const res = await run(svc, 'get_cash_forecast')
    expect(res.available).toBe(false)
    expect(res.reason).toBe('not_licensed')
    expect(res).not.toHaveProperty('headline')
    expect(res).not.toHaveProperty('omissions')
    expect(projectSpy).not.toHaveBeenCalled()
  })

  it('NO OPENING BALANCE: refuses and never substitutes the TB cash total', async () => {
    const { svc, projectSpy } = makeService({
      opening: { openingCash: null, asOfDate: null, source: null },
    })
    const res = await run(svc, 'get_cash_forecast')
    expect(res.available).toBe(false)
    expect(res.reason).toBe('no_opening_balance')
    // The TB figure ships as the CROSS-CHECK it is, under a name that cannot be
    // mistaken for the answer, and no forecast was built from it.
    expect(res.trialBalanceCashForReference).toBe(612_000)
    expect(res).not.toHaveProperty('headline')
    expect(projectSpy).not.toHaveBeenCalled()
  })

  it('ships omissions, the confidence block and the disclaimer VERBATIM', async () => {
    const om = [{ key: 'tuition_no_rate', message: 'Tuition is not in this forecast.' }]
    const { svc } = makeService({ project: { omissions: om } })
    const res = await run(svc, 'get_cash_forecast')
    expect(res.omissions).toEqual(om)
    expect(res.confidence).toMatchObject({
      dataTier: 'high',
      committedShare: 0.72,
      disclaimer: 'Forecast confidence reflects data completeness, not financial health.',
    })
  })

  it('withholds the lines by default and returns the sourceRef handle when asked', async () => {
    const { svc } = makeService({ flows: 3 })
    const without = await run(svc, 'get_cash_forecast')
    expect(without).not.toHaveProperty('lines')
    expect(without.linesTotal).toBe(3)

    const withLines = await run(svc, 'get_cash_forecast', { lines: true })
    const lines = withLines.lines as { sourceRef: string; editable: string }[]
    expect(lines).toHaveLength(3)
    expect(lines[0].sourceRef).toBe('qbo:ap:bill-0')
    expect(lines[0].editable).toBe('adjustable')
  })

  it('CAPS the lines at 20 and says so — an 8000-char truncation is answered from silently', async () => {
    const { svc } = makeService({ flows: 60 })
    const res = await run(svc, 'get_cash_forecast', { lines: true })
    expect((res.lines as unknown[]).length).toBe(20)
    expect(res.linesShown).toBe(20)
    expect(res.linesTotal).toBe(60)
    expect(res.linesTruncated).toBe(true)
  })

  it('stays well under the 8000-character truncation on a large school', async () => {
    const { svc } = makeService({ flows: 200 })
    const res = await run(svc, 'get_cash_forecast', { lines: true })
    expect(JSON.stringify(res).length).toBeLessThan(8000)
  })

  it('n4 — the headline maps each projection field to the key it claims', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'get_cash_forecast')
    expect(res.headline).toMatchObject({
      lowestBalance: 82_000,
      lowestBalanceFormatted: '$82,000',
      lowestDate: '2026-09-20',
      endingBalance: 150_000,
      endingBalanceFormatted: '$150,000',
      firstShortfallDate: '2026-09-14',
      shortfallAmount: 18_400,
      daysOfNotice: 44,
    })
  })

  it('n3 — driversToLowPoint carries the speakable label beside the key', async () => {
    const { svc } = makeService({
      project: { projection: projection({ driversToLowPoint: [{ category: 'debt_service', amount: 120_000 }] }) },
    })
    const res = await run(svc, 'get_cash_forecast')
    expect((res.driversToLowPoint as Record<string, unknown>[])[0]).toMatchObject({
      category: 'debt_service',
      label: 'Debt service',
    })
  })

  it('f10 — 20 adjusted lines with 500-char notes still fit under the truncation', async () => {
    const longNote = 'because the vendor said so, at length, '.repeat(13) // ~500 chars
    const adjusted = flows(20).map((f) => ({
      ...f,
      adjustment: {
        id: `adj-${f.sourceRef}`,
        sourceRef: f.sourceRef, // the duplicate the mapping must DROP
        kind: 'override',
        overrideAmount: 12_345,
        note: longNote,
      },
    }))
    const omissions = Array.from({ length: 9 }, (_, i) => ({
      key: `omission_${i}`,
      message: 'A whole sentence naming what is missing from this forecast and what to do about it.',
    }))
    const { svc } = makeService({ project: { flows: adjusted, omissions } })
    const res = await run(svc, 'get_cash_forecast', { lines: true })

    const lines = res.lines as { sourceRef: string; adjustment: Record<string, unknown> }[]
    // Heavy (adjusted, noted) rows trip the BYTE budget under the 20-row cap —
    // fewer lines ship, largest first, and the truncation is stated.
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThan(20)
    expect(res.linesShown).toBe(lines.length)
    expect(res.linesTruncated).toBe(true)
    // The note is capped at 120 chars + ellipsis; the sourceRef inside the
    // adjustment is gone (the line itself already carries it).
    const adj = lines[0].adjustment as { note: string }
    expect(adj.note.length).toBe(121)
    expect(adj.note.endsWith('…')).toBe(true)
    expect(lines[0].adjustment).not.toHaveProperty('sourceRef')
    expect(lines[0].sourceRef).toBe('qbo:ap:bill-0')
    // Omissions capped at 6, and the cap is stated rather than silent.
    expect(res.omissions).toHaveLength(6)
    expect(res.omissionsTruncated).toBe(true)
    expect(JSON.stringify(res).length).toBeLessThan(7900)
  })

  it('f10 — a short note ships whole and untruncated', async () => {
    const adjusted = flows(1).map((f) => ({
      ...f,
      adjustment: { id: 'adj-1', sourceRef: f.sourceRef, kind: 'exclude', overrideAmount: null, note: 'duplicate of payroll' },
    }))
    const { svc } = makeService({ project: { flows: adjusted } })
    const res = await run(svc, 'get_cash_forecast', { lines: true })
    const adj = (res.lines as { adjustment: { note: string } }[])[0].adjustment
    expect(adj.note).toBe('duplicate of payroll')
    expect(res.omissionsTruncated).toBe(false)
  })
})

describe('add_cash_forecast_item — the commitment write', () => {
  const GOOD = {
    label: 'Faculty payroll',
    category: 'payroll',
    direction: 'out',
    amount: 180_000,
    confidence: 'committed',
    recurrence: 'semimonthly',
    startDate: '2026-09-15',
  }

  it('PROPOSES and writes NOTHING', async () => {
    const { svc, createCommitment } = makeService()
    const res = await run(svc, 'add_cash_forecast_item', GOOD)
    expect(res.proposed).toBe(true)
    expect(createCommitment, 'a proposal must not mutate').not.toHaveBeenCalled()
    expect(SINKS.onProposal).toHaveBeenCalled()
  })

  it('the proposal carries the create_cash_commitment kind and the DTO payload', async () => {
    const { svc } = makeService()
    SINKS.onProposal.mockClear()
    await run(svc, 'add_cash_forecast_item', GOOD)
    const action = SINKS.onProposal.mock.calls[0][0] as ProposedAction
    expect(action.kind).toBe('create_cash_commitment')
    expect(action.payload).toMatchObject(GOOD)
    expect(action.summary).toContain('Faculty payroll')
  })

  it('REFUSES an enum the DTO would reject, rather than 400ing after the user confirmed', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'add_cash_forecast_item', { ...GOOD, recurrence: 'fortnightly' })
    expect(res.error).toMatch(/recurrence/)
    const conf = await run(svc, 'add_cash_forecast_item', { ...GOOD, confidence: 'pretty sure' })
    expect(conf.error).toMatch(/confidence/)
  })

  it('REFUSES a negative amount — direction carries the sign', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'add_cash_forecast_item', { ...GOOD, amount: -180_000 })
    expect(res.error).toMatch(/positive amount/)
  })

  it('REFUSES a non-ISO start date rather than inventing one', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'add_cash_forecast_item', { ...GOOD, startDate: 'next September' })
    expect(res.error).toMatch(/yyyy-mm-dd/)
  })

  it('an UNLICENSED school is refused at BUILD', async () => {
    const { svc } = makeService({ licensed: false })
    const res = await run(svc, 'add_cash_forecast_item', GOOD)
    expect(res.error).toMatch(/not licensed/)
  })

  it('a VIEWER is declined and never offered a write', async () => {
    const { svc } = makeService()
    const res = await (
      svc as unknown as {
        runToolCall: (tc: unknown, ctx: unknown, sinks: unknown) => Promise<Record<string, unknown>>
      }
    ).runToolCall(
      { id: 't1', function: { name: 'add_cash_forecast_item', arguments: JSON.stringify(GOOD) } },
      { ...CTX, role: 'viewer' },
      SINKS,
    )
    expect(res.error).toMatch(/don't have edit access/)
    expect(res.proposed).toBeUndefined()
  })

  it('APPLY creates the row and captures its id, so an Undo is offered', async () => {
    const { svc, createCommitment } = makeService()
    const out = await dispatch(svc, {
      kind: 'create_cash_commitment',
      periodId: 'period-1',
      summary: 'Add payroll.',
      payload: GOOD,
    })
    expect(createCommitment).toHaveBeenCalledTimes(1)
    expect(out.createdId).toBe('commitment-new')
  })

  it('APPLY re-checks the entitlement — a forged /apply never went through buildProposal', async () => {
    const { svc, createCommitment } = makeService({ licensed: false })
    await expect(
      dispatch(svc, {
        kind: 'create_cash_commitment',
        periodId: 'period-1',
        summary: 'Add payroll.',
        payload: GOOD,
      }),
    ).rejects.toThrow(/not licensed/)
    expect(createCommitment).not.toHaveBeenCalled()
  })

  it('f11 — the entitlement refusal is 402 MODULE_NOT_LICENSED, the @RequiresModule convention', async () => {
    // A 403 reads as a PERMISSION problem; the web already knows how to render
    // 402 { code: MODULE_NOT_LICENSED } as the unlock/subscribe state, and the
    // guard emits exactly that for @RequiresModule('finance', 'planning').
    const { svc } = makeService({ licensed: false })
    let err: unknown
    try {
      await dispatch(svc, {
        kind: 'create_cash_commitment',
        periodId: 'period-1',
        summary: 'Add payroll.',
        payload: GOOD,
      })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(HttpException)
    const http = err as HttpException
    expect(http.getStatus()).toBe(402)
    expect(http.getResponse()).toMatchObject({
      code: 'MODULE_NOT_LICENSED',
      module: 'finance',
      modules: ['finance', 'planning'],
    })
  })

  it('APPLY re-validates the UNTRUSTED payload', async () => {
    const { svc, createCommitment } = makeService()
    await expect(
      dispatch(svc, {
        kind: 'create_cash_commitment',
        periodId: 'period-1',
        summary: 'Add payroll.',
        payload: { ...GOOD, recurrence: 'fortnightly' },
      }),
    ).rejects.toThrow(/recurrence/i)
    expect(createCommitment).not.toHaveBeenCalled()
  })
})

describe('adjust_cash_forecast_line — the line adjustment write', () => {
  const REF = 'qbo:ap:bill-7'

  it('★ REFUSES a commitment:* sourceRef at BUILD, before the user confirms', async () => {
    const { svc, saveAdjustment } = makeService()
    const res = await run(svc, 'adjust_cash_forecast_line', {
      sourceRef: 'commitment:abc-123',
      kind: 'exclude',
    })
    // Named, not generic: "use the commitment editor" is a different and
    // answerable request, and the model will make exactly this mistake because
    // commitments appear in the same lines list.
    expect(res.error).toMatch(/edited directly/)
    expect(saveAdjustment).not.toHaveBeenCalled()
  })

  it('REFUSES any other unrecognised ref shape', async () => {
    const { svc } = makeService()
    const res = await run(svc, 'adjust_cash_forecast_line', { sourceRef: 'invented:thing', kind: 'exclude' })
    expect(res.error).toMatch(/derived line/)
  })

  it('enforces the override/exclude iff the DTO structurally cannot', async () => {
    const { svc } = makeService()
    const noAmount = await run(svc, 'adjust_cash_forecast_line', { sourceRef: REF, kind: 'override' })
    expect(noAmount.error).toMatch(/overrideAmount/)
    const strayAmount = await run(svc, 'adjust_cash_forecast_line', {
      sourceRef: REF,
      kind: 'exclude',
      overrideAmount: 60_000,
    })
    expect(strayAmount.error).toMatch(/only applies to an override/)
  })

  it('a valid exclude PROPOSES and writes nothing', async () => {
    // flows: 8 → the forecast's lines include qbo:ap:bill-7, so the f12
    // existence check passes and the proposal path is exercised end to end.
    const { svc, saveAdjustment } = makeService({ flows: 8 })
    SINKS.onProposal.mockClear()
    const res = await run(svc, 'adjust_cash_forecast_line', { sourceRef: REF, kind: 'exclude' })
    expect(res.proposed).toBe(true)
    expect(saveAdjustment).not.toHaveBeenCalled()
    const action = SINKS.onProposal.mock.calls[0][0] as ProposedAction
    expect(action.kind).toBe('save_cash_line_adjustment')
    expect(action.payload).toEqual({ sourceRef: REF, kind: 'exclude' })
    // The summary states what is NOT changed, because "exclude" reads like a
    // deletion and the underlying invoice is untouched.
    expect(action.summary).toMatch(/not changed/)
  })

  it('f12 — REFUSES a well-formed ref that names no line and no existing adjustment', async () => {
    // 'qbo:ap:bill-7' passes the shape regex, but the forecast only has bills
    // 0..2 — the model invented the ref. Confirmed and applied it would land as
    // a silently INERT adjustment (the upsert matches nothing at composition).
    const { svc, saveAdjustment } = makeService({ flows: 3 })
    SINKS.onProposal.mockClear()
    const res = await run(svc, 'adjust_cash_forecast_line', { sourceRef: REF, kind: 'exclude' })
    expect(res.error).toMatch(/get_cash_forecast/)
    expect(SINKS.onProposal).not.toHaveBeenCalled()
    expect(saveAdjustment).not.toHaveBeenCalled()
  })

  it('f12 — a ref known only from an EXISTING adjustment is still adjustable', async () => {
    // The line may have left today's window, but the school adjusted it before —
    // the ref names something real and re-adjusting it must stay possible.
    const { svc } = makeService({
      flows: 0,
      adjustments: [{ id: 'adj-1', sourceRef: REF, kind: 'exclude', overrideAmount: null, note: null }],
    })
    const res = await run(svc, 'adjust_cash_forecast_line', { sourceRef: REF, kind: 'override', overrideAmount: 5_000 })
    expect(res.proposed).toBe(true)
  })

  it('f12 — the existence read is persist:false (a proposal is not a decision)', async () => {
    const { svc, projectSpy } = makeService({ flows: 8 })
    await run(svc, 'adjust_cash_forecast_line', { sourceRef: REF, kind: 'exclude' })
    expect(projectSpy).toHaveBeenCalled()
    for (const call of projectSpy.mock.calls) {
      expect(call[2]).toMatchObject({ persist: false })
    }
  })

  it('★ THE UPSERT-UNDO TRAP — a FRESH line yields createdId, so an Undo is offered', async () => {
    const { svc, listAdjustments } = makeService({ adjustments: [] })
    const out = await dispatch(svc, {
      kind: 'save_cash_line_adjustment',
      periodId: 'period-1',
      summary: 'Exclude that bill.',
      payload: { sourceRef: REF, kind: 'exclude' },
    })
    // Reading the existing adjustments FIRST is what makes the two cases
    // distinguishable at all.
    expect(listAdjustments).toHaveBeenCalledTimes(1)
    expect(out.createdId).toBe('adjustment-new')
    expect(out.existingId).toBeUndefined()
  })

  it('★ THE UPSERT-UNDO TRAP — REPLACING an adjustment yields createdId:null + existingId', async () => {
    // saveAdjustment UPSERTS by (school, sourceRef). Undoing a replacement by
    // deleting the row would restore the DERIVED line, not the adjustment the
    // school had before — silently wrong state, offered as an Undo button.
    // `createdId: null` is what makes `reversible` false for this instance.
    const { svc, saveAdjustment } = makeService({
      adjustments: [{ id: 'adjustment-prior', sourceRef: REF, kind: 'override', overrideAmount: 90_000, note: null }],
    })
    const out = await dispatch(svc, {
      kind: 'save_cash_line_adjustment',
      periodId: 'period-1',
      summary: 'Exclude that bill.',
      payload: { sourceRef: REF, kind: 'exclude' },
    })
    // The write STILL HAPPENS — the user asked for it, and it is correct.
    expect(saveAdjustment).toHaveBeenCalledTimes(1)
    // Only the UNDO is withheld, and the summary says so rather than leaving a
    // dead button to explain itself.
    expect(out.createdId).toBeNull()
    expect(out.existingId).toBe('adjustment-prior')
    expect(out.summary).toMatch(/can’t be undone from here/)
  })

  it('a replacement on a DIFFERENT line is still a fresh, reversible adjustment', async () => {
    const { svc } = makeService({
      adjustments: [{ id: 'adjustment-prior', sourceRef: 'budget:salaries', kind: 'exclude', overrideAmount: null, note: null }],
    })
    const out = await dispatch(svc, {
      kind: 'save_cash_line_adjustment',
      periodId: 'period-1',
      summary: 'Exclude that bill.',
      payload: { sourceRef: REF, kind: 'exclude' },
    })
    expect(out.createdId).toBe('adjustment-new')
    expect(out.existingId).toBeUndefined()
  })

  it('APPLY refuses a commitment:* ref from a FORGED payload', async () => {
    const { svc, saveAdjustment } = makeService()
    await expect(
      dispatch(svc, {
        kind: 'save_cash_line_adjustment',
        periodId: 'period-1',
        summary: 'Exclude it.',
        payload: { sourceRef: 'commitment:abc-123', kind: 'exclude' },
      }),
    ).rejects.toThrow(/derived line/)
    expect(saveAdjustment).not.toHaveBeenCalled()
  })
})

describe('undo dispatch', () => {
  const reverse = (svc: AssistantService, tool: string, targetId: string) =>
    (
      svc as unknown as {
        reverseApplied: (u: User, s: string, t: string, id: string) => Promise<void>
      }
    ).reverseApplied(USER, 'school-1', tool, targetId)

  it('a commitment undo is the SAME tenant-scoped soft delete the page performs', async () => {
    const { svc, removeCommitment } = makeService()
    await reverse(svc, 'create_cash_commitment', 'commitment-new')
    expect(removeCommitment).toHaveBeenCalledWith('school-1', 'commitment-new')
  })

  it('an adjustment undo clears the adjustment, restoring the derived line', async () => {
    const { svc, removeAdjustment } = makeService()
    await reverse(svc, 'save_cash_line_adjustment', 'adjustment-new')
    expect(removeAdjustment).toHaveBeenCalledWith('school-1', 'adjustment-new')
  })
})

describe('F2 — the STALE-TARGETID undo (fresh-path complement of the upsert trap)', () => {
  // Penny creates a FRESH adjustment → reversible, targetId = row X. The person
  // later re-saves the SAME sourceRef from the cash-flow page — saveAdjustment
  // UPSERTS by (school, sourceRef), so row X now holds THEIR newer content while
  // Penny's audit entry still says reversible→X. Undo must refuse rather than
  // delete their work while reporting a clean reversal.
  const REF = 'qbo:ap:bill-7'
  const APPLIED_AT = new Date('2026-08-01T10:00:00.000Z')

  /** Full applyAction→undoActivity chain: the audit writer captures what apply
   *  stamps into the log (incl. the F2 appliedContent snapshot), and the prisma
   *  stand-in serves that same entry back to undoActivity, with the adjustment
   *  row reading however the test says the row NOW looks. */
  function makeUndoHarness(rowNow: Record<string, unknown> | null) {
    let stored: { targetId: string | null; metadata: Record<string, unknown> } | null = null
    const audit = {
      writeReturning: vi.fn(
        async (e: { targetId: string | null; metadata: Record<string, unknown> }) => {
          stored = e
          return 'audit-1'
        },
      ),
      write: vi.fn(async () => undefined),
    }
    const adjustmentFindFirst = vi.fn(async () => rowNow)
    const prisma = {
      auditLog: {
        findUnique: vi.fn(async () => ({
          id: 'audit-1',
          schoolId: 'school-1',
          action: 'assistant.action.applied',
          targetId: stored?.targetId ?? null,
          targetType: 'save_cash_line_adjustment',
          metadata: stored?.metadata ?? null,
          createdAt: APPLIED_AT,
        })),
        findFirst: vi.fn(async () => null), // no undone marker yet
      },
      cashFlowLineAdjustment: { findFirst: adjustmentFindFirst },
    }
    const made = makeService({ prisma, audit })
    return { ...made, adjustmentFindFirst }
  }

  const applyFreshExclude = (svc: AssistantService) =>
    svc.applyAction('school-1', USER, {
      kind: 'save_cash_line_adjustment',
      periodId: 'period-1',
      summary: 'Exclude that bill.',
      payload: { sourceRef: REF, kind: 'exclude' },
    } as ProposedAction)

  it('★ apply fresh → the UI re-saves the line → undo REFUSES with 422, row untouched', async () => {
    // The row as it NOW stands: the person's override, saved an hour after
    // Penny's exclude — same row id, different content.
    const { svc, removeAdjustment } = makeUndoHarness({
      id: 'adjustment-new',
      schoolId: 'school-1',
      sourceRef: REF,
      kind: 'override',
      overrideAmount: 120_000,
      note: 'set by the bookkeeper',
      active: true,
      updatedAt: new Date('2026-08-01T11:00:00.000Z'),
    })
    const applied = await applyFreshExclude(svc)
    expect(applied.reversible).toBe(true)
    expect(applied.targetId).toBe('adjustment-new')

    await expect(svc.undoActivity('school-1', USER, 'audit-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    )
    await expect(svc.undoActivity('school-1', USER, 'audit-1')).rejects.toThrow(/changed after/)
    expect(removeAdjustment, 'undo deleted the person’s newer adjustment').not.toHaveBeenCalled()
  })

  it('a same-content re-save is ALSO refused — the timestamp tell catches it', async () => {
    // The person re-saved the identical exclude much later: content matches the
    // snapshot, but deleting the row would still discard their explicit decision.
    const { svc, removeAdjustment } = makeUndoHarness({
      id: 'adjustment-new',
      schoolId: 'school-1',
      sourceRef: REF,
      kind: 'exclude',
      overrideAmount: null,
      note: null,
      active: true,
      updatedAt: new Date('2026-08-01T11:00:00.000Z'),
    })
    await applyFreshExclude(svc)
    await expect(svc.undoActivity('school-1', USER, 'audit-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    )
    expect(removeAdjustment).not.toHaveBeenCalled()
  })

  it('an UNTOUCHED row still undoes cleanly (the guard must not break normal undo)', async () => {
    const { svc, removeAdjustment } = makeUndoHarness({
      id: 'adjustment-new',
      schoolId: 'school-1',
      sourceRef: REF,
      kind: 'exclude',
      overrideAmount: null,
      note: null,
      active: true,
      // Written a few ms before the audit entry, well inside the grace window.
      updatedAt: new Date(APPLIED_AT.getTime() - 20),
    })
    await applyFreshExclude(svc)
    const res = await svc.undoActivity('school-1', USER, 'audit-1')
    expect(res).toEqual({ undone: true })
    expect(removeAdjustment).toHaveBeenCalledWith('school-1', 'adjustment-new')
  })

  it('a row already cleared elsewhere skips the guard and no-ops as already-undone', async () => {
    const { svc } = makeUndoHarness({
      id: 'adjustment-new',
      schoolId: 'school-1',
      sourceRef: REF,
      kind: 'exclude',
      overrideAmount: null,
      note: null,
      active: false, // soft-deleted from the page's own remove button
      updatedAt: new Date('2026-08-01T11:00:00.000Z'),
    })
    await applyFreshExclude(svc)
    const res = await svc.undoActivity('school-1', USER, 'audit-1')
    expect(res.undone).toBe(true)
  })
})
