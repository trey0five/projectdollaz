import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { PriorVisitService, PRIOR_VISIT_UNMATCHED_NOTE } from './prior-visit.service.js'
import { PriorVisitController } from './prior-visit.controller.js'
import {
  CreatePriorVisitFindingDto,
  ListPriorVisitFindingsQueryDto,
  PRIOR_VISIT_STATUSES,
  UpdatePriorVisitFindingDto,
} from './dto/prior-visit.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — PriorVisitService.
//
// The only ground truth in the program: what a real visiting team actually wrote.
// The load-bearing behaviour is the MATCH — exact equality after trim + uppercase
// and NOTHING else — and the promise that an unmatched citation is shown as
// unmatched, never fuzzy-matched and never dropped.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-02T12:00:00.000Z')

function findingRow(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    schoolId: 'school-A',
    frameworkId: null,
    visitDate: new Date('2021-10-12T00:00:00.000Z'),
    citedStandardCode: 'COG-A3',
    text: 'The team could not locate evidence of an annually reviewed crisis plan.',
    status: 'open',
    closedDate: null,
    evidenceRef: null,
    createdByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(
  over: { finding?: Record<string, unknown>; standard?: Record<string, unknown>; framework?: Record<string, unknown> } = {},
) {
  // The `_args` parameter is load-bearing for TYPES, not behaviour: vitest infers
  // `mock.calls` from the mock's signature, and a zero-arg mock gives an empty
  // tuple that `calls[0][0]` cannot index. Assertions below read the where-clause
  // the service passed, which is the point.
  const priorVisitFinding = {
    findMany: vi.fn(async (_args?: Record<string, unknown>) => [] as Record<string, unknown>[]),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => findingRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => findingRow(data)),
    delete: vi.fn(async () => findingRow()),
    ...over.finding,
  }
  const accreditationStandard = {
    findMany: vi.fn(async () => []),
    ...over.standard,
  }
  const accreditationFramework = {
    findFirst: vi.fn(async () => ({ id: 'fw-1' })),
    ...over.framework,
  }
  const prisma = { priorVisitFinding, accreditationStandard, accreditationFramework }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new PriorVisitService(prisma as never, audit as never)
  return { svc, priorVisitFinding, accreditationStandard, accreditationFramework, audit }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FIVE-CODE FIXTURE (phase spec §5.3). A register containing ONLY 'COG-A3'.
// ─────────────────────────────────────────────────────────────────────────────
describe('PriorVisitService — matching is exact after trim + uppercase, and nothing else', () => {
  const FIVE = ['COG-A3', ' cog-a3 ', 'COG-A', 'A3', 'COG-A33']

  function fiveCodeService() {
    return makeService({
      standard: { findMany: vi.fn(async () => [{ id: 'std-1', code: 'COG-A3' }]) },
      finding: {
        findMany: vi
          .fn()
          .mockImplementationOnce(async () =>
            FIVE.map((code, i) => findingRow({ id: `f${i}`, citedStandardCode: code })),
          )
          .mockImplementationOnce(async () => FIVE.map((code) => ({ citedStandardCode: code }))),
      },
    })
  }

  it('EXACTLY the first two match; the other three come back unmatched', async () => {
    const { svc } = fiveCodeService()
    const res = await svc.list('school-A')
    const byCode = new Map(res.findings.map((f) => [f.citedStandardCode, f]))

    expect(byCode.get('COG-A3')!.unmatched).toBe(false)
    expect(byCode.get('COG-A3')!.matchedStandardId).toBe('std-1')
    expect(byCode.get(' cog-a3 ')!.unmatched).toBe(false)
    expect(byCode.get(' cog-a3 ')!.matchedStandardId).toBe('std-1')

    // No prefix match, no substring match, no Levenshtein, no 'COG-A3 ≈ COG-A'.
    for (const code of ['COG-A', 'A3', 'COG-A33']) {
      expect(byCode.get(code)!.unmatched, code).toBe(true)
      expect(byCode.get(code)!.matchedStandardId, code).toBeNull()
      expect(byCode.get(code)!.matchedStandardCode, code).toBeNull()
    }
  })

  it('NOTHING is dropped — all five rows come back', async () => {
    const { svc } = fiveCodeService()
    const res = await svc.list('school-A')
    expect(res.findings).toHaveLength(5)
    expect(res.findings.map((f) => f.citedStandardCode).sort()).toEqual([...FIVE].sort())
  })

  it('the stored code is returned VERBATIM; only the MATCHED standard carries the register casing', async () => {
    const { svc } = fiveCodeService()
    const res = await svc.list('school-A')
    const messy = res.findings.find((f) => f.id === 'f1')!
    // The team's own text, whitespace and casing intact.
    expect(messy.citedStandardCode).toBe(' cog-a3 ')
    // …matched to the school's standard, shown as the SCHOOL wrote it.
    expect(messy.matchedStandardCode).toBe('COG-A3')
  })

  it('the frozen unmatchedNote is carried, VERBATIM, when any row is unmatched', async () => {
    const { svc } = fiveCodeService()
    const res = await svc.list('school-A')
    expect(res.unmatchedCount).toBe(3)
    expect(res.unmatchedNote).toBe(PRIOR_VISIT_UNMATCHED_NOTE)
    expect(PRIOR_VISIT_UNMATCHED_NOTE).toBe(
      'We could not match these citations to a standard in your register. We show them ' +
        'exactly as the team wrote them rather than guessing which standard they meant — ' +
        'a citation matched to the wrong standard is worse than an unmatched one.',
    )
  })

  it('unmatchedNote is null when every citation matched', async () => {
    const { svc } = makeService({
      standard: { findMany: vi.fn(async () => [{ id: 'std-1', code: 'COG-A3' }]) },
      finding: {
        findMany: vi
          .fn()
          .mockImplementationOnce(async () => [findingRow({ citedStandardCode: 'COG-A3' })])
          .mockImplementationOnce(async () => [{ citedStandardCode: 'COG-A3' }]),
      },
    })
    const res = await svc.list('school-A')
    expect(res.unmatchedCount).toBe(0)
    expect(res.unmatchedNote).toBeNull()
  })

  it('a duplicated code in the school register resolves STABLY, by id ascending', async () => {
    // AccreditationStandard.code is free text and deliberately NOT unique, so this
    // is reachable. An arbitrary rule is fine; an UNSTABLE one is not — a citation
    // that flips between two standards between requests would flip the finding it
    // produces with it.
    const { svc, accreditationStandard } = makeService({
      standard: {
        findMany: vi.fn(async () => [
          { id: 'std-a', code: 'COG-A3' },
          { id: 'std-b', code: 'cog-a3' },
        ]),
      },
      finding: {
        findMany: vi
          .fn()
          .mockImplementationOnce(async () => [findingRow({ citedStandardCode: 'COG-A3' })])
          .mockImplementationOnce(async () => [{ citedStandardCode: 'COG-A3' }]),
      },
    })
    const res = await svc.list('school-A')
    expect(res.findings[0].matchedStandardId).toBe('std-a')
    expect(accreditationStandard.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-A' },
      select: { id: true, code: true },
      orderBy: { id: 'asc' },
    })
  })

  it('unmatchedCount is computed over the FULL register even when the page is DB-filtered', async () => {
    const { svc, priorVisitFinding } = makeService({
      standard: { findMany: vi.fn(async () => [{ id: 'std-1', code: 'COG-A3' }]) },
      finding: {
        findMany: vi
          .fn()
          // the filtered page: only the matched row
          .mockImplementationOnce(async () => [findingRow({ id: 'm', citedStandardCode: 'COG-A3' })])
          // the whole register: one matched, two not
          .mockImplementationOnce(async () => [
            { citedStandardCode: 'COG-A3' },
            { citedStandardCode: 'MSA-9' },
            { citedStandardCode: 'NSBECS-99' },
          ]),
      },
    })
    const res = await svc.list('school-A', { status: 'closed' })
    expect(priorVisitFinding.findMany).toHaveBeenCalledTimes(2)
    expect(res.findings).toHaveLength(1)
    expect(res.unmatchedCount).toBe(2)
    expect(res.unmatchedNote).toBe(PRIOR_VISIT_UNMATCHED_NOTE)
  })

  it('an UNFILTERED list issues ONE findings query — the page already IS the register', async () => {
    const { svc, priorVisitFinding } = makeService({
      standard: { findMany: vi.fn(async () => [{ id: 'std-1', code: 'COG-A3' }]) },
      finding: {
        findMany: vi.fn(async () => [
          findingRow({ id: 'a', citedStandardCode: 'COG-A3' }),
          findingRow({ id: 'b', citedStandardCode: 'MSA-9' }),
        ]),
      },
    })
    const res = await svc.list('school-A')
    expect(priorVisitFinding.findMany).toHaveBeenCalledTimes(1)
    expect(res.findings).toHaveLength(2)
    expect(res.unmatchedCount).toBe(1)
  })

  it("`unmatchedOnly` alone does not narrow the DB read, so the count still spans the register", async () => {
    const { svc, priorVisitFinding } = makeService({
      standard: { findMany: vi.fn(async () => [{ id: 'std-1', code: 'COG-A3' }]) },
      finding: {
        findMany: vi.fn(async (_args?: Record<string, unknown>) => [
          findingRow({ id: 'a', citedStandardCode: 'COG-A3' }),
          findingRow({ id: 'b', citedStandardCode: 'MSA-9' }),
        ]),
      },
    })
    const res = await svc.list('school-A', { unmatchedOnly: 'true' })
    expect(priorVisitFinding.findMany).toHaveBeenCalledTimes(1)
    expect(priorVisitFinding.findMany.mock.calls[0][0]!.where).toEqual({ schoolId: 'school-A' })
    expect(res.findings.map((f) => f.id)).toEqual(['b']) // only the unmatched row on the page
    expect(res.unmatchedCount).toBe(1) // …counted over the whole register
    expect(res.unmatchedNote).toBe(PRIOR_VISIT_UNMATCHED_NOTE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE G10 PROHIBITION, at the register boundary.
// ─────────────────────────────────────────────────────────────────────────────
describe('PriorVisitService — it computes no probability, ever (plan G10, D4 frozen)', () => {
  it('the response carries rows and a match result, and no score of any kind', async () => {
    const { svc } = makeService({
      standard: { findMany: vi.fn(async () => [{ id: 'std-1', code: 'COG-A3' }]) },
      finding: {
        findMany: vi
          .fn()
          .mockImplementationOnce(async () => [findingRow()])
          .mockImplementationOnce(async () => [{ citedStandardCode: 'COG-A3' }]),
      },
    })
    const res = await svc.list('school-A')
    expect(Object.keys(res).sort()).toEqual(['findings', 'unmatchedCount', 'unmatchedNote'])
    expect(Object.keys(res.findings[0]).sort()).toEqual([
      'citedStandardCode',
      'closedDate',
      'createdAt',
      'createdByUserId',
      'evidenceRef',
      'frameworkId',
      'id',
      'matchedStandardCode',
      'matchedStandardId',
      'status',
      'text',
      'unmatched',
      'updatedAt',
      'visitDate',
    ])
  })

  it('the source file contains no percentage, likelihood or weighting arithmetic', () => {
    const raw = readFileSync(
      fileURLToPath(new URL('./prior-visit.service.ts', import.meta.url)),
      'utf8',
    )
    // COMMENTS ARE STRIPPED FIRST. The file's own doc block states the prohibition
    // in words ("may not calibrate a probability or a likelihood"), so a naive scan
    // would make the spec its own first offender — the same trap the twin's
    // no-student-access spec documents. What is asserted here is the CODE.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    // One visit per six years per school is never calibratable. Nothing on this
    // path may tune the risk arithmetic.
    expect(code).not.toMatch(/\blikelihood\b/i)
    expect(code).not.toMatch(/\bprobabilit/i)
    expect(code).not.toMatch(/\bweight/i)
    expect(code).not.toMatch(/\bpercent|\bpct\b/i)
    // …and the strip is not vacuous: the identifiers the file DOES use survive it.
    expect(code).toMatch(/normalizeCode/)
    expect(code).toMatch(/PRIOR_VISIT_UNMATCHED_NOTE/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE closedDate LIFECYCLE.
// ─────────────────────────────────────────────────────────────────────────────
describe('PriorVisitService — the closedDate lifecycle', () => {
  it("create with status 'closed' and no date stamps TODAY (server clock)", async () => {
    const { svc, priorVisitFinding } = makeService({})
    await svc.create(
      'school-A',
      { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 't', status: 'closed' },
      'u',
      NOW,
    )
    expect(priorVisitFinding.create.mock.calls[0][0].data.closedDate).toEqual(
      new Date('2026-08-02T00:00:00.000Z'),
    )
  })

  it("create with status 'closed' and an explicit date keeps that date", async () => {
    const { svc, priorVisitFinding } = makeService({})
    await svc.create(
      'school-A',
      {
        visitDate: '2021-10-12',
        citedStandardCode: 'COG-A3',
        text: 't',
        status: 'closed',
        closedDate: '2024-03-01',
      },
      'u',
      NOW,
    )
    expect(priorVisitFinding.create.mock.calls[0][0].data.closedDate).toEqual(
      new Date('2024-03-01T00:00:00.000Z'),
    )
  })

  it("create defaults to 'open' with a NULL closedDate", async () => {
    const { svc, priorVisitFinding } = makeService({})
    await svc.create(
      'school-A',
      { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 't' },
      'u',
      NOW,
    )
    const data = priorVisitFinding.create.mock.calls[0][0].data
    expect(data.status).toBe('open')
    expect(data.closedDate).toBeNull()
  })

  it("re-opening CLEARS closedDate — an open finding cannot also carry a close date", async () => {
    const { svc, priorVisitFinding } = makeService({
      finding: {
        findFirst: vi.fn(async () =>
          findingRow({ status: 'closed', closedDate: new Date('2024-03-01T00:00:00.000Z') }),
        ),
      },
    })
    await svc.update('school-A', 'f1', { status: 'open' }, 'u', NOW)
    expect(priorVisitFinding.update.mock.calls[0][0].data.closedDate).toBeNull()
  })

  it('an unrelated edit never moves an existing close date', async () => {
    const { svc, priorVisitFinding } = makeService({
      finding: {
        findFirst: vi.fn(async () =>
          findingRow({ status: 'closed', closedDate: new Date('2024-03-01T00:00:00.000Z') }),
        ),
      },
    })
    await svc.update('school-A', 'f1', { evidenceRef: 'Board minutes, 2024-03-01' }, 'u', NOW)
    expect(priorVisitFinding.update.mock.calls[0][0].data.closedDate).toEqual(
      new Date('2024-03-01T00:00:00.000Z'),
    )
  })

  it("closing a previously-open finding with no date stamps TODAY", async () => {
    const { svc, priorVisitFinding } = makeService({
      finding: { findFirst: vi.fn(async () => findingRow({ status: 'open', closedDate: null })) },
    })
    await svc.update('school-A', 'f1', { status: 'closed' }, 'u', NOW)
    expect(priorVisitFinding.update.mock.calls[0][0].data.closedDate).toEqual(
      new Date('2026-08-02T00:00:00.000Z'),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TENANT ISOLATION + the framework gate + verbatim storage.
// ─────────────────────────────────────────────────────────────────────────────
describe('PriorVisitService — tenant isolation and validation', () => {
  it('update: a foreign findingId → NotFoundException, never mutates', async () => {
    const { svc, priorVisitFinding } = makeService({
      finding: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.update('school-B', 'f-of-A', { text: 'hijack' }, 'u'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(priorVisitFinding.update).not.toHaveBeenCalled()
  })

  it('remove: a foreign findingId → NotFoundException, never deletes', async () => {
    const { svc, priorVisitFinding } = makeService({
      finding: { findFirst: vi.fn(async () => null) },
    })
    await expect(svc.remove('school-B', 'f-of-A', 'u')).rejects.toBeInstanceOf(NotFoundException)
    expect(priorVisitFinding.delete).not.toHaveBeenCalled()
  })

  it('an unknown or inactive frameworkId 400s and nothing is written', async () => {
    const { svc, priorVisitFinding, accreditationFramework } = makeService({
      framework: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.create(
        'school-A',
        { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 't', frameworkId: 'fw-x' },
        'u',
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(accreditationFramework.findFirst).toHaveBeenCalledWith({
      where: { id: 'fw-x', active: true },
      select: { id: true },
    })
    expect(priorVisitFinding.create).not.toHaveBeenCalled()
  })

  it('a NULL frameworkId is legal — a school may hold a report for a framework it never adopted here', async () => {
    const { svc, priorVisitFinding, accreditationFramework } = makeService({})
    await svc.create(
      'school-A',
      { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 't' },
      'u',
      NOW,
    )
    expect(accreditationFramework.findFirst).not.toHaveBeenCalled()
    expect(priorVisitFinding.create.mock.calls[0][0].data.frameworkId).toBeNull()
  })

  it('an explicit null on a NOT NULL column is a 400, not a 500', async () => {
    // @IsOptional() skips BOTH undefined AND null, which is what lets a PATCH clear
    // a nullable field. Without this guard the same semantics would push a null
    // into a NOT NULL column and surface a 500 for a malformed request.
    for (const field of ['visitDate', 'citedStandardCode', 'text', 'status']) {
      const { svc, priorVisitFinding } = makeService({
        finding: { findFirst: vi.fn(async () => findingRow()) },
      })
      await expect(
        svc.update('school-A', 'f1', { [field]: null } as never, 'u', NOW),
        field,
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(priorVisitFinding.update, field).not.toHaveBeenCalled()
    }
  })

  it('an explicit null on a NULLABLE column still CLEARS it', async () => {
    for (const field of ['frameworkId', 'evidenceRef']) {
      const { svc, priorVisitFinding } = makeService({
        finding: {
          findFirst: vi.fn(async () =>
            findingRow({ frameworkId: 'fw-1', evidenceRef: 'Board minutes' }),
          ),
        },
      })
      await svc.update('school-A', 'f1', { [field]: null } as never, 'u', NOW)
      expect(priorVisitFinding.update.mock.calls[0][0].data[field], field).toBeNull()
    }
  })

  it('citedStandardCode is stored VERBATIM — normalisation is a match-time concern only', async () => {
    const { svc, priorVisitFinding } = makeService({})
    await svc.create(
      'school-A',
      { visitDate: '2021-10-12', citedStandardCode: '  cog-a3  ', text: 't' },
      'u',
      NOW,
    )
    expect(priorVisitFinding.create.mock.calls[0][0].data.citedStandardCode).toBe('  cog-a3  ')
  })

  it('list ordering is deterministic: open first, then most recent visit', async () => {
    const { svc } = makeService({
      standard: { findMany: vi.fn(async () => []) },
      finding: {
        findMany: vi
          .fn()
          .mockImplementationOnce(async () => [
            findingRow({ id: 'closed-recent', status: 'closed', visitDate: new Date('2021-10-12T00:00:00.000Z') }),
            findingRow({ id: 'open-old', visitDate: new Date('2015-04-01T00:00:00.000Z') }),
            findingRow({ id: 'open-recent', visitDate: new Date('2021-10-12T00:00:00.000Z') }),
          ])
          .mockImplementationOnce(async () => []),
      },
    })
    const res = await svc.list('school-A')
    expect(res.findings.map((f) => f.id)).toEqual(['open-recent', 'open-old', 'closed-recent'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE ROUTES.
// ─────────────────────────────────────────────────────────────────────────────
const GUARDS = '__guards__'
const ROLES = 'roles'

describe('PriorVisitController — the guard chain and the role split', () => {
  it('carries the full house chain and the accreditation module gate', () => {
    const guards = (Reflect.getMetadata(GUARDS, PriorVisitController) as unknown[]) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)
    expect(guards).toContain(EntitlementGuard)
    const keys = Reflect.getMetadataKeys(PriorVisitController)
    const moduleKey = keys.find((k) => String(k).toLowerCase().includes('module'))
    expect(moduleKey, 'no @RequiresModule metadata on PriorVisitController').toBeDefined()
    expect(Reflect.getMetadata(moduleKey as string, PriorVisitController)).toBe('accreditation')
  })

  it('VIEWER MAY READ — a citation names a standard, not a person — and may not write', () => {
    const proto = PriorVisitController.prototype as unknown as Record<string, object>
    expect(Reflect.getMetadata(ROLES, proto.list)).toEqual(['owner', 'accountant', 'viewer'])
    for (const m of ['create', 'update', 'remove']) {
      const roles = Reflect.getMetadata(ROLES, proto[m]) as string[]
      expect(roles, m).toEqual(['owner', 'accountant'])
      expect(roles, m).not.toContain('viewer')
    }
  })

  it('delegates and composes nothing', async () => {
    const svc = {
      list: vi.fn(async () => ({ findings: [] })),
      create: vi.fn(async () => ({ finding: {} })),
      update: vi.fn(async () => ({ finding: {} })),
      remove: vi.fn(async () => ({ id: 'f1' })),
    }
    const c = new PriorVisitController(svc as never)
    const user = { id: 'user-1' } as never
    await c.list('school-A', { status: 'open' })
    expect(svc.list).toHaveBeenCalledWith('school-A', { status: 'open' })
    await c.create('school-A', { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 't' }, user)
    expect(svc.create).toHaveBeenCalledWith(
      'school-A',
      { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 't' },
      'user-1',
    )
    await c.update('school-A', 'f1', { status: 'closed' }, user)
    expect(svc.update).toHaveBeenCalledWith('school-A', 'f1', { status: 'closed' }, 'user-1')
    await c.remove('school-A', 'f1', user)
    expect(svc.remove).toHaveBeenCalledWith('school-A', 'f1', 'user-1')
  })
})

describe('the prior-visit DTOs — forbidNonWhitelisted has something to whitelist', () => {
  const base = { visitDate: '2021-10-12', citedStandardCode: 'COG-A3', text: 'The team wrote this.' }

  it('requires visitDate, citedStandardCode and text', async () => {
    expect(await validate(plainToInstance(CreatePriorVisitFindingDto, base))).toHaveLength(0)
    for (const key of ['visitDate', 'citedStandardCode', 'text'] as const) {
      const missing = { ...base }
      delete (missing as Record<string, unknown>)[key]
      expect(
        await validate(plainToInstance(CreatePriorVisitFindingDto, missing)),
        key,
      ).not.toHaveLength(0)
    }
  })

  it('bounds citedStandardCode at 40 chars so it cannot become a second text field', async () => {
    expect(
      await validate(plainToInstance(CreatePriorVisitFindingDto, { ...base, citedStandardCode: 'x'.repeat(41) })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(CreatePriorVisitFindingDto, { ...base, citedStandardCode: '' })),
    ).not.toHaveLength(0)
  })

  it('status is open|closed and nothing else', async () => {
    for (const status of PRIOR_VISIT_STATUSES) {
      expect(await validate(plainToInstance(CreatePriorVisitFindingDto, { ...base, status })), status).toHaveLength(0)
    }
    for (const status of ['resolved', 'dismissed', 'acknowledged']) {
      expect(
        await validate(plainToInstance(CreatePriorVisitFindingDto, { ...base, status })),
        status,
      ).not.toHaveLength(0)
    }
  })

  it('UpdatePriorVisitFindingDto is fully optional and accepts explicit nulls', async () => {
    expect(await validate(plainToInstance(UpdatePriorVisitFindingDto, {}))).toHaveLength(0)
    expect(
      await validate(
        plainToInstance(UpdatePriorVisitFindingDto, {
          frameworkId: null,
          closedDate: null,
          evidenceRef: null,
        }),
      ),
    ).toHaveLength(0)
  })

  it('ListPriorVisitFindingsQueryDto bounds unmatchedOnly to the two query strings', async () => {
    for (const unmatchedOnly of ['true', 'false']) {
      expect(await validate(plainToInstance(ListPriorVisitFindingsQueryDto, { unmatchedOnly }))).toHaveLength(0)
    }
    expect(
      await validate(plainToInstance(ListPriorVisitFindingsQueryDto, { unmatchedOnly: '1' })),
    ).not.toHaveLength(0)
  })
})

describe('module wiring — AccreditationModule gains the prior-visit pair', () => {
  it('declares the controller and the provider', async () => {
    const { AccreditationModule } = await import('./accreditation.module.js')
    expect(Reflect.getMetadata('controllers', AccreditationModule)).toContain(PriorVisitController)
    const providers = Reflect.getMetadata('providers', AccreditationModule) as { name: string }[]
    expect(providers.map((p) => p.name)).toContain('PriorVisitService')
  })

  it('does NOT export PriorVisitService — TwinRegisterService reads the table directly', async () => {
    const { AccreditationModule } = await import('./accreditation.module.js')
    const exports = ((Reflect.getMetadata('exports', AccreditationModule) as { name: string }[]) ?? []).map(
      (e) => e.name,
    )
    expect(exports).not.toContain('PriorVisitService')
  })

  // The Phase-E boot-killer, made mechanical for THIS module. Reading `providers`
  // off module metadata proves only that a decorator names a class — it never asks
  // Nest to RESOLVE anything, so a provider this module injects but that no imported
  // module EXPORTS still passes every unit test and kills the API on boot with
  // UnknownDependenciesException. In production that is a container that never
  // starts.
  //
  // It reads SOURCE, not `design:paramtypes`: vitest transforms TS with esbuild,
  // which does not implement `emitDecoratorMetadata`, so `design:paramtypes` is
  // undefined under test and the obvious version of this spec is VACUOUS. Only the
  // tsc/nest build emits it — which is exactly why the bug reached runtime.
  it('AccreditationModule RESOLVES — every injected provider is exported by an imported module', async () => {
    const { AccreditationModule } = await import('./accreditation.module.js')

    const meta = (m: unknown, key: string): unknown[] =>
      (Reflect.getMetadata(key, m as object) as unknown[]) ?? []
    const isModule = (c: unknown) => Reflect.hasMetadata('imports', c as object)
    const nameOf = (c: unknown) => (c as { name?: string })?.name ?? ''

    const exportedSurface = (m: unknown, seen = new Set<unknown>()): Set<string> => {
      const out = new Set<string>()
      if (seen.has(m)) return out
      seen.add(m)
      for (const e of meta(m, 'exports')) {
        if (isModule(e)) for (const x of exportedSurface(e, seen)) out.add(x)
        else out.add(nameOf(e))
      }
      return out
    }

    const available = new Set<string>(meta(AccreditationModule, 'providers').map(nameOf))
    for (const imp of meta(AccreditationModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [
      ...meta(AccreditationModule, 'providers'),
      ...meta(AccreditationModule, 'controllers'),
    ]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/accreditation/`).toBeDefined()
      const body = src!.slice(src!.indexOf(`export class ${name}`))
      const ctor = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(body)
      if (!ctor) continue
      for (const raw of ctor[1].split(/,(?![^(]*\))/)) {
        const param = raw.trim()
        if (!param) continue
        if (/@Optional|@Inject/.test(param)) continue
        const m = /:\s*([A-Za-z_$][\w$]*)/.exec(param)
        if (!m) continue
        const dep = m[1]
        if (!available.has(dep)) unresolved.push(`${name} injects ${dep}, which nothing exports`)
      }
    }

    expect(unresolved).toEqual([])
  })
})
