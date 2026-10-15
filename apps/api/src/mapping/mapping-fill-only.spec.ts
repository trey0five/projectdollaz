import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { ValidationPipe } from '@nestjs/common'
import { MappingService } from './mapping.service.js'
import { MappingController } from './mapping.controller.js'
import { MergeMappingDto } from './dto/merge-mapping.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fill-only mapping merges (`onlyNew`).
//
// An AUTOMATIC sort (the statement auto-sort on save, the browser's preview sort)
// must never re-point an account the school already placed — e.g. a 67000
// Diocesan Assessment re-picked to adminCost last year must not snap back to the
// engine's fixedOther guess on next year's upload. The merge is one SQL statement
// either way; fill-only only flips the jsonb `||` operands so STORED keys win.
//
// The fake $queryRaw below applies exactly the jsonb `||` semantics Postgres has
// (right-hand keys win) to whichever operand order the SQL text uses, so the
// specs fail if the operands are ever flipped back.
// ─────────────────────────────────────────────────────────────────────────────

function fakeDb(stored: Record<string, string>) {
  const state = { entries: { ...stored } }
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?').replace(/\s+/g, ' ')
    const patch = JSON.parse(String(values[0])) as Record<string, string>
    if (/SET entries = entries \|\| \?::jsonb/.test(sql)) {
      state.entries = { ...state.entries, ...patch } // patch on the right → patch wins
    } else if (/SET entries = \?::jsonb \|\| entries/.test(sql)) {
      state.entries = { ...patch, ...state.entries } // stored on the right → stored wins
    } else {
      throw new Error(`unexpected SQL: ${sql}`)
    }
    return [{ entries: state.entries }]
  })
  const svc = new MappingService({ $queryRaw } as never)
  vi.spyOn(svc, 'ensureActive').mockResolvedValue({
    mapping: { id: '00000000-0000-0000-0000-000000000001', version: 'v1' },
  } as never)
  return { svc, state, $queryRaw }
}

describe('MappingService.mergeEntries — fill-only (onlyNew)', () => {
  it('★ onlyNew keeps a category the school already stored, and adds only the missing keys', async () => {
    const { svc, state } = fakeDb({ '67000': 'adminCost' })
    const res = await svc.mergeEntries(
      's1',
      { '67000': 'fixedOther', '41000': 'tuition' },
      { onlyNew: true },
    )
    expect(state.entries['67000']).toBe('adminCost') // the school's pick survives
    expect(state.entries['41000']).toBe('tuition') // the new account is filled
    expect(res.entriesCount).toBe(2)
    expect(res.merged).toBe(1) // only 41000 took the patch's value
  })

  it('default (no flag) is unchanged: the patch wins over what is stored', async () => {
    const { svc, state } = fakeDb({ '67000': 'adminCost' })
    const res = await svc.mergeEntries('s1', { '67000': 'fixedOther', '41000': 'tuition' })
    expect(state.entries['67000']).toBe('fixedOther')
    expect(state.entries['41000']).toBe('tuition')
    expect(res.merged).toBe(2)
  })

  it('onlyNew still validates keys and categories (400 before any write)', async () => {
    const { svc, $queryRaw } = fakeDb({})
    await expect(svc.mergeEntries('s1', { '0': 'tuition' }, { onlyNew: true })).rejects.toThrow(
      /Invalid mapping key/,
    )
    await expect(
      svc.mergeEntries('s1', { '41000': 'notACategory' }, { onlyNew: true }),
    ).rejects.toThrow(/Unknown category/)
    expect($queryRaw).not.toHaveBeenCalled()
  })
})

describe('PATCH /mapping — onlyNew reaches the service and the rebuild still runs', () => {
  function make() {
    const mapping = { mergeEntries: vi.fn(async () => ({ mappingVersion: 'v1', entriesCount: 1, merged: 1 })) }
    const prisma = {
      import: {
        findMany: vi.fn(async () => [{ fiscalPeriodId: 'p1' }]),
        count: vi.fn(async () => 1),
      },
    }
    const statements = { generate: vi.fn(async () => undefined) }
    const ctrl = new MappingController(mapping as never, prisma as never, statements as never)
    return { ctrl, mapping, statements }
  }

  it('onlyNew:true → fill-only merge, periods rebuilt', async () => {
    const { ctrl, mapping, statements } = make()
    const out = await ctrl.merge({ id: 'u1' } as never, 's1', {
      entries: { '41000': 'tuition' },
      onlyNew: true,
    })
    expect(mapping.mergeEntries).toHaveBeenCalledWith('s1', { '41000': 'tuition' }, { onlyNew: true })
    expect(statements.generate).toHaveBeenCalledTimes(1)
    expect(out.statements.rebuilt).toBe(1)
  })

  it('no flag → the default (patch-wins) merge', async () => {
    const { ctrl, mapping } = make()
    await ctrl.merge({ id: 'u1' } as never, 's1', { entries: { '41000': 'tuition' } })
    expect(mapping.mergeEntries).toHaveBeenCalledWith('s1', { '41000': 'tuition' }, { onlyNew: false })
  })
})

describe('MergeMappingDto — under the global forbidNonWhitelisted pipe', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  const run = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: MergeMappingDto })

  it('accepts onlyNew', async () => {
    await expect(run({ entries: { '41000': 'tuition' }, onlyNew: true })).resolves.toMatchObject({
      onlyNew: true,
    })
    await expect(run({ entries: { '41000': 'tuition' } })).resolves.toBeInstanceOf(MergeMappingDto)
  })

  it('rejects a non-boolean onlyNew and still rejects unknown fields', async () => {
    await expect(run({ entries: { '41000': 'tuition' }, onlyNew: 'yes' })).rejects.toThrow()
    await expect(run({ entries: { '41000': 'tuition' }, fillOnly: true })).rejects.toThrow()
  })
})
