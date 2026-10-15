// #32 in KYRO chat — a spreadsheet ingest() can't read.
//
// The digest the model sees carries ONLY the plain reason + ask from the
// IngestError (column LETTERS / row NUMBERS — never cell text) plus a pointer to
// the Add-data column picker. e.preview (raw cells) must never reach a digest,
// a log line or a response. The intake memory, when passed, threads into
// ingest(): a remembered layout reads a file the automatic read can't, and
// pinned synthetic numbers stay stable — with no memory, output is unchanged.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Logger } from '@nestjs/common'
import {
  EMPTY_INTAKE_MEMORY,
  IngestError,
  buildIntakeMemory,
  ingest,
  syntheticKey,
  type IntakeMemory,
} from '@finrep/ingestion'
import { AssistantFilesService, PICKER_HINT } from './assistant-files.service.js'
import { AssistantService } from './assistant.service.js'
import { Redactor } from './redaction.js'

// The api has no direct xlsx dependency; borrow the ingestion package's copy
// (the same library that reads the bytes) to build fixtures.
const here = dirname(fileURLToPath(import.meta.url))
const XLSX = createRequire(join(here, '../../../../packages/ingestion/package.json'))('xlsx') as {
  utils: {
    book_new: () => unknown
    aoa_to_sheet: (rows: unknown[][]) => unknown
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
  }
  write: (wb: unknown, opts: { type: 'buffer'; bookType: 'xlsx' }) => Buffer
}

const config = { get: () => true } as unknown as ConstructorParameters<typeof AssistantFilesService>[0]
const svc = (): AssistantFilesService => new AssistantFilesService(config)

function xlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const xlsxAttachment = (name: string, sheets: Record<string, unknown[][]>) => ({
  name,
  kind: 'xlsx' as const,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 0,
  dataBase64: xlsxBuffer(sheets).toString('base64'),
})

/** safety.test.ts B3 — account numbers + names, but the amount column has no header. */
const UNLABELED: unknown[][] = [
  ['Trial Balance FY26'],
  ['Acct', 'Desc', null],
  [1010, 'Cash', 500],
  [4000, 'Tuition', -500],
]
const UNLABELED_CELLS = ['Trial Balance FY26', 'Acct', 'Desc', 'Cash', 'Tuition', '1010', '4000', '500', '-500']

/** The digest minus the parts that legitimately carry the file name / a random id. */
function bodyOf(digest: string, attachmentId: string, fileName: string): string {
  return digest.split(attachmentId).join('<id>').split(fileName).join('<file>')
}

describe('AssistantFilesService.prepare — a spreadsheet ingest() cannot read', () => {
  it('the digest carries the plain reason + ask + the picker hint, and NONE of the file’s cell text', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      const prep = await svc().prepare([xlsxAttachment('TB_FY26.xlsx', { Sheet1: UNLABELED })], new Redactor(false))
      expect(prep.importCandidates).toHaveLength(0)
      expect(prep.digests).toHaveLength(1)
      const [attachmentId] = [...prep.rawFiles.keys()]
      const digest = prep.digests[0]!
      expect(digest).toContain('We found account numbers in column A but no amount column.')
      expect(digest).toContain('Which column holds the balances?')
      expect(digest).toContain(PICKER_HINT)
      expect(digest).toContain(`file_document with attachmentId "${attachmentId}"`)
      const body = bodyOf(digest, attachmentId!, 'TB_FY26.xlsx')
      for (const cell of UNLABELED_CELLS) expect(body, `cell "${cell}" leaked`).not.toContain(cell)

      // The log keeps the technical message (unchanged contract) — and never the preview grid.
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n')
      expect(logged).toMatch(/attachment parse failed for a spreadsheet: .*no amount column/)
      expect(logged).not.toMatch(/"rows"|"guess"|preview/)
    } finally {
      warn.mockRestore()
    }
  })

  it('e.preview never reaches the digest, even when it holds identifying text', () => {
    const preview = {
      sheet: 'Sheet1',
      sheets: ['Sheet1'],
      rows: [['STUDENT-JANE-DOE', 'SECRET-CELL', '999']],
      totalRows: 1,
      columnCount: 3,
      columns: [],
      guess: { headerRow: -1, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1 },
      debitCreditHeader: false,
      readsAsStatement: false,
      signature: null,
    }
    const err = new IngestError(
      'legacy technical text STUDENT-JANE-DOE',
      'no-amount',
      'We found account numbers in column A but no amount column.',
      'Which column holds the balances?',
      preview as never,
    )
    const digest = (svc() as unknown as {
      parseFailureDigest: (id: string, e: unknown, r: Redactor) => string
    }).parseFailureDigest('att-1', err, new Redactor(false))
    expect(digest).toContain('We found account numbers in column A but no amount column. Which column holds the balances?')
    expect(digest).not.toContain('STUDENT-JANE-DOE')
    expect(digest).not.toContain('SECRET-CELL')
    expect(digest).not.toContain('legacy technical text')
  })

  it('a plain (non-IngestError) failure keeps today’s generic text + the picker hint, never the raw message', () => {
    const digest = (svc() as unknown as {
      parseFailureDigest: (id: string, e: unknown, r: Redactor) => string
    }).parseFailureDigest('att-1', new Error('boom: Header cells seen: Jane Doe'), new Redactor(false))
    expect(digest).toMatch(/could not be parsed as a trial balance/)
    expect(digest).toContain(PICKER_HINT)
    expect(digest).not.toMatch(/boom|Jane Doe/)
  })

  it('an IngestError without an ask prints the reason alone', () => {
    const err = new IngestError('No ingestion adapter', 'unsupported', 'KYRO reads Excel (.xlsx, .xls) and .csv files.', null)
    const digest = (svc() as unknown as {
      parseFailureDigest: (id: string, e: unknown, r: Redactor) => string
    }).parseFailureDigest('att-1', err, new Redactor(false))
    expect(digest).toContain('"KYRO reads Excel (.xlsx, .xls) and .csv files."')
    expect(digest).not.toContain('null')
  })
})

describe('AssistantFilesService.prepare — intake memory threading', () => {
  /** A TB whose amount column has no header — the automatic read refuses it. */
  const ODD_TB = (banner: string[][]): unknown[][] => [
    ...banner,
    ['Sunny Day School'],
    ['Trial Balance June 30, 2026'],
    ['Acct', 'Desc', null],
    [1010, 'Cash', 250000],
    [1200, 'Tuition Receivable', 40000],
    [2100, 'Accounts Payable', -30000],
    [3000, 'Net Assets', -200000],
    [4000, 'Tuition', -512000],
    [4100, 'Fees', -12000],
    [5000, 'Salaries', 452000],
    [5100, 'Benefits', 12000],
  ]

  function memoryFromPicked(): IntakeMemory {
    const bytes = ab(xlsxBuffer({ Sheet1: ODD_TB([]) }))
    let guess: unknown
    try {
      ingest('Odd TB 6-30-26.xlsx', bytes)
      throw new Error('expected the automatic read to fail')
    } catch (e) {
      guess = (e as IngestError).preview?.guess
    }
    expect(guess).toMatchObject({ acct: 0, desc: 1, amount: 2 })
    const picked = ingest('Odd TB 6-30-26.xlsx', bytes, { columns: guess as never })
    expect(picked.metadata?.layout?.source).toBe('picked')
    return buildIntakeMemory([picked.metadata])
  }

  it('a remembered layout reads a same-layout file the automatic read refuses (extra banner row on top)', async () => {
    const memory = memoryFromPicked()
    expect(memory.layouts).toHaveLength(1)
    const att = xlsxAttachment('Odd TB 6-30-26 v2.xlsx', { Sheet1: ODD_TB([['Prepared by the office']]) })

    const without = await svc().prepare([att], new Redactor(false))
    expect(without.parsed.size).toBe(0)
    expect(without.digests[0]).toContain('no amount column')

    const withMem = await svc().prepare([att], new Redactor(false), { memory })
    expect(withMem.importCandidates).toHaveLength(1)
    const parsed = withMem.parsed.get(withMem.importCandidates[0]!.attachmentId)!
    expect(parsed.metadata?.layout?.source).toBe('remembered')
    expect(parsed.rows).toHaveLength(8)
    expect(parsed.rows.find((r) => r.acct === 4000)?.total).toBe(-512000)
  })

  it('memory null / empty / absent reads a plain trial balance identically', async () => {
    const tb = xlsxAttachment('TB_CurrentYear_FY26.xlsx', {
      Sheet1: [
        ['Sample School — Current Year Trial Balance'],
        ['Fiscal Year FY26 — As of June 30, 2026'],
        [],
        ['Number', 'Description', 'Debit', 'Credit', 'Total'],
        [100, 'Cash', 500000, null, 500000],
        [120, 'Receivable', 30000, null, 30000],
        [200, 'Payable', null, 20000, -20000],
        [300, 'Net assets', null, 374000, -374000],
        [401, 'Tuition', null, 500000, -500000],
        [402, 'Fees', null, 20000, -20000],
        [500, 'Salaries', 300000, null, 300000],
        [510, 'Benefits', 60000, null, 60000],
        [600, 'Supplies', 24000, null, 24000],
      ],
    })
    const first = (p: Awaited<ReturnType<AssistantFilesService['prepare']>>) => {
      const [only] = [...p.parsed.values()]
      return { rows: only!.rows, metadata: only!.metadata }
    }
    const base = first(await svc().prepare([tb], new Redactor(false)))
    expect(base.rows).toHaveLength(9)
    expect(first(await svc().prepare([tb], new Redactor(false), { memory: null }))).toEqual(base)
    expect(first(await svc().prepare([tb], new Redactor(false), { memory: EMPTY_INTAKE_MEMORY }))).toEqual(base)
    // A layout memory never hijacks a file the automatic read handles.
    expect(first(await svc().prepare([tb], new Redactor(false), { memory: memoryFromPicked() }))).toEqual(base)
  })

  it('pinned synthetic numbers reach unnumbered P&L rows — single sheet AND the multi-sheet fan-out', async () => {
    const pnl = (period: string, tuition: number): unknown[][] => [
      ['Profit and Loss'],
      [period],
      [],
      ['', 'Total'],
      ['Income'],
      ['   Tuition', tuition],
      ['   Fees', 9600],
      ['Total Income', tuition + 9600],
      ['Expenses'],
      ['   Salaries', 300000],
      ['Total Expenses', 300000],
      ['Net Income', tuition + 9600 - 300000],
    ]
    const memory: IntakeMemory = {
      layouts: [],
      synthetic: { [syntheticKey('revenue', 'Tuition')]: { acct: 4100, section: 'revenue', name: 'Tuition' } },
    }

    const single = await svc().prepare(
      [xlsxAttachment('Unnumbered P&L 6-30-26.xlsx', { Sheet1: pnl('July 2025 - June 2026', 512000) })],
      new Redactor(false),
      { memory },
    )
    const sp = [...single.parsed.values()][0]!
    expect(sp.rows.find((r) => r.desc === 'Tuition')?.acct).toBe(4100)
    expect(sp.metadata?.statement?.synthesized.find((s) => s.name === 'Tuition')).toMatchObject({
      acct: 4100,
      source: 'remembered',
    })
    // Without memory the hashed number is used (and is not marked remembered).
    const plain = await svc().prepare(
      [xlsxAttachment('Unnumbered P&L 6-30-26.xlsx', { Sheet1: pnl('July 2025 - June 2026', 512000) })],
      new Redactor(false),
    )
    const pp = [...plain.parsed.values()][0]!
    expect(pp.metadata?.statement?.synthesized.find((s) => s.name === 'Tuition')?.source).toBeUndefined()

    // Two P&L tabs (not a P&L + BS pair) → the multi-sheet path via listStatementSheets.
    const multi = await svc().prepare(
      [
        xlsxAttachment('Two P&Ls FY26.xlsx', {
          'P&L Jan 2026': pnl('January 2026', 64000),
          'P&L FY26': pnl('July 2025 - June 2026', 768000),
        }),
      ],
      new Redactor(false),
      { memory },
    )
    expect(multi.parsed.size).toBe(2)
    for (const p of multi.parsed.values()) {
      expect(p.rows.find((r) => r.desc === 'Tuition')?.acct).toBe(4100)
    }
  })
})

describe('AssistantService — intake memory is best-effort', () => {
  const bare = (imports: unknown) =>
    Object.assign(Object.create(AssistantService.prototype), { imports }) as {
      intakeMemoryOrNull: (schoolId: string) => Promise<IntakeMemory | null>
    }

  it('returns the school’s memory', async () => {
    const mem: IntakeMemory = { layouts: [], synthetic: {} }
    const intakeMemory = vi.fn(async () => mem)
    await expect(bare({ intakeMemory }).intakeMemoryOrNull('s1')).resolves.toBe(mem)
    expect(intakeMemory).toHaveBeenCalledWith('s1')
  })

  it('any failure (rejection, throw, missing service) → null, so the chat reads files as before', async () => {
    await expect(bare({ intakeMemory: async () => Promise.reject(new Error('db down')) }).intakeMemoryOrNull('s1')).resolves.toBeNull()
    await expect(
      bare({
        intakeMemory: () => {
          throw new Error('sync')
        },
      }).intakeMemoryOrNull('s1'),
    ).resolves.toBeNull()
    await expect(bare(undefined).intakeMemoryOrNull('s1')).resolves.toBeNull()
    await expect(bare({ intakeMemory: vi.fn() }).intakeMemoryOrNull('')).resolves.toBeNull()
  })
})
