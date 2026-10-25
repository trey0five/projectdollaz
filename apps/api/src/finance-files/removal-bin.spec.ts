import { describe, expect, it, vi } from 'vitest'
import { restoreFromBin } from './removal-bin.js'

const sqlOf = (v: unknown) =>
  v && typeof v === 'object' && 'sql' in v ? String((v as { sql: string }).sql) : String(v)

describe('restoreFromBin', () => {
  it('inserts only the columns the binned JSON carries (a newer column keeps its DEFAULT)', async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ column_name: 'id' }, { column_name: 'created_at' }, { column_name: 'weird"name' }]),
      $executeRaw: vi.fn(async () => 2),
    }
    const n = await restoreFromBin(tx as never, 'r1', 'import')
    expect(n).toBe(2)
    const [strings, ...vals] = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
    const rendered = strings.reduce((acc, s, i) => acc + s + (i < vals.length ? sqlOf(vals[i]) : ''), '')
    expect(rendered).toContain('INSERT INTO imports ("id", "created_at", "weird""name")')
    expect(rendered).toContain('SELECT r."id", r."created_at", r."weird""name"')
    expect(rendered).toContain('jsonb_populate_record(NULL::imports')
    const [qStrings, ...qVals] = tx.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
    expect(qStrings.join('?')).toContain('information_schema.columns')
    expect(qVals).toContain('imports') // a bound value, never spliced from input
  })

  it('an empty bin inserts nothing and reports 0', async () => {
    const tx = { $queryRaw: vi.fn(async () => []), $executeRaw: vi.fn() }
    expect(await restoreFromBin(tx as never, 'r1', 'period_budget')).toBe(0)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
})
