import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { RequestMethod } from '@nestjs/common'
import { EMPTY_INTAKE_MEMORY, syntheticKey } from '@finrep/ingestion'
import { ImportsService, INTAKE_MEMORY_SCAN } from './imports.service.js'
import { ImportsController } from './imports.controller.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'

// ─────────────────────────────────────────────────────────────────────────────
// #32 / #41 — GET /schools/:schoolId/intake-memory.
//
// Memory is DERIVED from Import.metadata (no table, no migration): the column
// layouts a person picked for a file KYRO couldn't read, and the numbers KYRO
// gave unnumbered P&L accounts. The service must read ONLY metadata (never the
// rows), newest first, bounded, tenant-scoped by schoolId — and it must ignore
// the live QuickBooks sync's imports (buildIntakeMemory's rule).
// ─────────────────────────────────────────────────────────────────────────────

/** Nest's metadata keys (@nestjs/common/constants): route path, HTTP method, guards. */
const PATH_METADATA = 'path'
const METHOD_METADATA = 'method'
const GUARDS_METADATA = '__guards__'

const LAYOUT = {
  sheet: 'Sheet1',
  headerRow: 2,
  acct: 0,
  desc: 1,
  amount: 2,
  debit: -1,
  credit: -1,
  signature: 'w=3:acct|desc',
  source: 'picked' as const,
}

const SYNTH_PL = {
  source: 'upload',
  sourceName: 'Unnumbered P&L.xlsx',
  rowCount: 2,
  statement: {
    type: 'pl',
    title: 'Profit and Loss',
    partial: 'pl',
    synthesized: [
      { acct: 4100, name: 'Tuition', section: 'revenue' },
      { acct: 6100, name: 'Salaries', section: 'expense' },
      // A BS family number is never pinned.
      { acct: 1000, name: 'Checking', section: 'asset' },
    ],
  },
}

function serviceWith(rows: Array<{ metadata: unknown }>) {
  const findMany = vi.fn(async () => rows)
  const prisma = { import: { findMany } }
  const svc = new ImportsService(prisma as never, {} as never, {} as never, {} as never)
  return { svc, findMany }
}

describe('ImportsService.intakeMemory', () => {
  it('reads ONLY metadata, newest first, bounded, scoped to the school', async () => {
    const { svc, findMany } = serviceWith([])
    await svc.intakeMemory('school-1')
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: INTAKE_MEMORY_SCAN,
    })
    expect(INTAKE_MEMORY_SCAN).toBe(400)
  })

  it('an empty school (or one with only plain uploads) → { layouts: [], synthetic: {} }', async () => {
    expect(await serviceWith([]).svc.intakeMemory('s')).toEqual({ layouts: [], synthetic: {} })
    expect(await serviceWith([]).svc.intakeMemory('s')).toEqual(EMPTY_INTAKE_MEMORY)
    const plain = await serviceWith([
      { metadata: null },
      { metadata: { source: 'upload', sourceName: 'TB.xlsx', rowCount: 40 } },
      { metadata: 'not an object' },
    ]).svc.intakeMemory('s')
    expect(plain).toEqual({ layouts: [], synthetic: {} })
  })

  it('returns the picked layout and the P&L synthetic pins (BS entries never pinned)', async () => {
    const mem = await serviceWith([
      { metadata: { source: 'upload', sourceName: 'Odd TB.xlsx', rowCount: 6, layout: LAYOUT } },
      { metadata: SYNTH_PL },
    ]).svc.intakeMemory('s')
    expect(mem.layouts).toEqual([LAYOUT])
    expect(mem.synthetic[syntheticKey('revenue', 'Tuition')]).toEqual({
      acct: 4100,
      section: 'revenue',
      name: 'Tuition',
    })
    expect(mem.synthetic[syntheticKey('expense', 'Salaries')]).toMatchObject({ acct: 6100, section: 'expense' })
    expect(Object.values(mem.synthetic).some((p) => p.acct === 1000)).toBe(false)
    // JSON-serialisable as-is (it is the HTTP response body).
    expect(JSON.parse(JSON.stringify(mem))).toEqual(mem)
  })

  it('ignores the live QuickBooks sync’s imports', async () => {
    const mem = await serviceWith([
      { metadata: { ...SYNTH_PL, source: 'quickbooks', layout: LAYOUT } },
    ]).svc.intakeMemory('s')
    expect(mem).toEqual({ layouts: [], synthetic: {} })
  })

  it('the newest layout per signature wins', async () => {
    const newer = { ...LAYOUT, amount: 3, source: 'remembered' as const }
    const mem = await serviceWith([
      { metadata: { source: 'upload', layout: newer } },
      { metadata: { source: 'upload', layout: LAYOUT } },
    ]).svc.intakeMemory('s')
    expect(mem.layouts).toEqual([newer])
  })

  it('drops malformed client-written layouts instead of returning them', async () => {
    const mem = await serviceWith([
      { metadata: { layout: { ...LAYOUT, acct: 'A' } } },
      { metadata: { layout: { ...LAYOUT, signature: null } } },
      { metadata: { layout: { ...LAYOUT, source: 'hacked' } } },
    ]).svc.intakeMemory('s')
    expect(mem.layouts).toEqual([])
  })
})

describe('ImportsController — GET schools/:schoolId/intake-memory', () => {
  const handler = ImportsController.prototype.intakeMemory

  it('is a GET on the documented path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('schools/:schoolId/intake-memory')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)
  })

  it('is owner/accountant only (a board viewer never reads upload memory)', () => {
    expect(Reflect.getMetadata('roles', handler)).toEqual(['owner', 'accountant'])
  })

  it('sits behind the class JwtAuthGuard + RolesGuard and is NOT entitlement-gated', () => {
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, ImportsController) as unknown[]) ?? []
    expect(classGuards).toContain(JwtAuthGuard)
    expect(classGuards).toContain(RolesGuard)
    const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []
    expect(methodGuards).not.toContain(EntitlementGuard)
  })

  it('delegates to ImportsService.intakeMemory with the route schoolId', async () => {
    const intakeMemory = vi.fn(async () => ({ layouts: [], synthetic: {} }))
    const ctrl = new ImportsController({ intakeMemory } as never)
    await expect(ctrl.intakeMemory('school-9')).resolves.toEqual({ layouts: [], synthetic: {} })
    expect(intakeMemory).toHaveBeenCalledWith('school-9')
  })
})
