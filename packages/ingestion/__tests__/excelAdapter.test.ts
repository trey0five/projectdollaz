// ─────────────────────────────────────────────────────────────
// Ingestion: parse the sample trial balances and assert rows are
// produced with the expected normalized shape.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ingest, parseTrialBalance, getAdapter } from '../src/index.js'
import engineFixture from '../../engine/__tests__/__fixtures__/sampleRows.json'

const here = dirname(fileURLToPath(import.meta.url))
const sampleDir = resolve(here, '..', '..', '..', 'sample-data')

function load(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(sampleDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

// Lock the ingestion output to the exact rows the ENGINE regression tests
// assert against. The sample-data .xlsx files were regenerated (new header /
// content marker rows) but the 55 account rows + balances must stay byte-
// identical to the engine fixture. If a future sample-data edit changes any
// balance, this fails loudly at the ingestion layer instead of silently
// diverging from packages/engine/__tests__/__fixtures__/sampleRows.json.
const PARITY: Array<[string, keyof typeof engineFixture]> = [
  ['TB_CurrentYear_FY26.xlsx', 'cyData'],
  ['TB_PriorYear_FY25.xlsx', 'pyData'],
  ['TB_AuditedFYEnd_FY25.xlsx', 'auditData'],
]

describe('excel adapter', () => {
  it('parses the current-year sample into normalized rows', () => {
    const { rows } = parseTrialBalance(load('TB_CurrentYear_FY26.xlsx'))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(typeof r.acct).toBe('number')
      expect(typeof r.desc).toBe('string')
      expect(typeof r.total).toBe('number')
    }
    expect(rows.some((r) => r.acct === 462)).toBe(true)
  })

  it.each(PARITY)(
    'parses %s into rows byte-identical to the engine regression fixture',
    (file, fixtureKey) => {
      const { rows } = parseTrialBalance(load(file))
      const expected = engineFixture[fixtureKey]
      expect(rows).toHaveLength(55)
      expect(rows).toEqual(expected)
    }
  )

  it('ingest facade selects the xlsx adapter by extension', () => {
    const a = getAdapter('TB_CurrentYear_FY26.xlsx')
    expect(a.format).toBe('xlsx')
    const res = ingest('TB_CurrentYear_FY26.xlsx', load('TB_CurrentYear_FY26.xlsx'))
    expect(res.sourceName).toBe('TB_CurrentYear_FY26.xlsx')
    expect(res.rows.length).toBeGreaterThan(0)
  })
})

describe('csv adapter', () => {
  it('parses equivalent CSV with identical column semantics', () => {
    const csv = [
      'Number,Description,Debit,Credit,Total',
      '401,Tuition,0,0,-100',
      '500,Salaries,200,0,200',
    ].join('\n')
    const bytes = new TextEncoder().encode(csv).buffer
    const res = getAdapter('tb.csv').parse(bytes as ArrayBuffer)
    expect(res.rows).toEqual([
      { acct: 401, desc: 'Tuition', total: -100 },
      { acct: 500, desc: 'Salaries', total: 200 },
    ])
  })
})
