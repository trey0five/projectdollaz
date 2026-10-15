// ─────────────────────────────────────────────────────────────────────────────
// #32 / #40 — the intake says what it read, in plain words, and never acts on
// a guess by itself.
//
//   • a file KYRO couldn't read says WHY ("We found account numbers in column A
//     but no amount column.") and asks the one question that unblocks it, and
//     the column picker shows the guess but applies nothing until "Use these
//     columns" is pressed (A32-8);
//   • half a trial balance is never called "Balanced" (A40-1);
//   • unreadable files get their own "Couldn't read" group, not "Needs a role".
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ingest, previewFile } from '@finrep/ingestion'
import { validateDataset } from '@finrep/engine'
import ColumnPicker from './ColumnPicker.jsx'
import { failureFromError, failureText } from '../../lib/ingestFailure.js'
import { workbook, HF_PL } from '../../lib/__fixtures__/holyFamily.js'

let app = {}
vi.mock('../../context/AppContext.jsx', () => ({ useApp: () => app }))

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
afterEach(() => cleanup())

// The A32 shape: account numbers + names, an amounts column with NO header.
const ODD = [
  ['Sunny Day School'],
  ['Trial Balance June 30, 2026'],
  ['Acct', 'Desc', null],
  [1010, 'Cash', 250_000],
  [1200, 'Tuition Receivable', 40_000],
  [2100, 'Accounts Payable', -30_000],
  [3000, 'Net Assets', -200_000],
  [4000, 'Tuition', -512_000],
  [5000, 'Salaries', 452_000],
]
const bytes = workbook({ Sheet1: ODD })
const failure = (() => {
  try {
    ingest('Odd TB 6-30-26.xlsx', bytes)
    return null
  } catch (e) {
    return failureFromError(e)
  }
})()

describe('#32 — the plain reason', () => {
  it('says why and asks the one question, naming columns by LETTER only', () => {
    expect(failure.code).toBe('no-amount')
    expect(failureText(failure)).toBe(
      'We found account numbers in column A but no amount column. Which column holds the balances?',
    )
    // No cell text from the file ever lands in the reason.
    for (const cell of ['Sunny Day School', 'Cash', 'Tuition Receivable', 'Salaries']) {
      expect(failure.reason).not.toContain(cell)
    }
    expect(failure.canPick).toBe(true)
  })

  it('an Error with no IngestError shape still reads as one plain line', () => {
    const f = failureFromError(new Error('Disk on fire'))
    expect(f).toMatchObject({ code: null, reason: 'Disk on fire', ask: null, preview: null, canPick: false })
  })
})

describe('A32-8 — the column picker', () => {
  const renderPicker = (onApply = vi.fn()) => {
    render(
      <ColumnPicker
        fileName="Odd TB 6-30-26.xlsx"
        bytes={bytes}
        preview={failure.preview}
        initial={failure.preview.guess}
        onApply={onApply}
        onCancel={() => {}}
      />,
    )
    return onApply
  }
  const select = (label) => screen.getByLabelText(label, { selector: 'select' })

  it('opens with the guess pre-selected and a live read of it', () => {
    renderPicker()
    expect(screen.getByText('Show KYRO where your numbers are')).toBeTruthy()
    expect(select('Column names are in').value).toBe('2')
    expect(select('Account numbers').value).toBe('0')
    expect(select('Names').value).toBe('1')
    expect(select('Amounts').value).toBe('2')
    // A good read: the green callout with its ONE check icon (no second "✓"
    // character in the words).
    const liveBox = screen.getByTestId('picker-live')
    expect(liveBox.dataset.tone).toBe('good')
    expect(liveBox.textContent).toMatch(/^6 accounts · read as a trial balance/)
    expect(liveBox.textContent).not.toContain('✓')
    expect(liveBox.querySelectorAll('svg')).toHaveLength(1)
  })

  it('changing Amounts re-reads live, and a failing read disables "Use these columns"', () => {
    const onApply = renderPicker()
    fireEvent.change(select('Amounts'), { target: { value: '1' } })
    expect(screen.getByTestId('picker-live').dataset.tone).toBe('watch')
    expect(screen.getByTestId('picker-live').textContent).not.toMatch(/accounts · read as/)
    const use = screen.getByRole('button', { name: 'Use these columns' })
    expect(use.disabled).toBe(true)
    fireEvent.click(use)
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.change(select('Amounts'), { target: { value: '2' } })
    expect(screen.getByTestId('picker-live').dataset.tone).toBe('good')
    expect(screen.getByTestId('picker-live').textContent).toMatch(/^6 accounts · read as/)
  })

  it('never applies on its own — only the press calls onApply, with the choice', () => {
    const onApply = renderPicker()
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use these columns' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0]).toMatchObject({ headerRow: 2, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1 })
  })

  it('one column, one job: a column another question uses is greyed out and says which (#10)', () => {
    renderPicker()
    const opt = (label, value) =>
      [...select(label).querySelectorAll('option')].find((o) => o.value === value)
    // Names is column B (index 1): Amounts can't offer it…
    expect(opt('Amounts', '1').disabled).toBe(true)
    expect(opt('Amounts', '1').textContent).toMatch(/used for Names/)
    // …Account numbers (A) can't either way round…
    expect(opt('Names', '0').disabled).toBe(true)
    expect(opt('Names', '0').textContent).toMatch(/used for Account numbers/)
    // …and a question's OWN column stays pickable.
    expect(opt('Amounts', '2').disabled).toBe(false)
    expect(opt('Names', '1').disabled).toBe(false)
    // The shared Aurora select (field-plain field-select + ChevronDown).
    expect(select('Amounts').className).toMatch(/field-plain field-select/)
  })

  it('the preview table scrolls inside itself (no page scroll on a phone)', () => {
    expect(read('components/intake/ColumnPicker.jsx')).toMatch(/overflow-x-auto/)
  })
})

describe('the file card', () => {
  const baseApp = () => ({
    setFileRole: vi.fn(),
    removeFile: vi.fn(),
    canEdit: true,
    openColumnPicker: vi.fn(),
    schoolId: 's1',
  })

  it('a file KYRO couldn’t read shows the reason, the ask in bold, and "Pick the columns"', async () => {
    const FileStatusCard = (await import('../FileStatusCard.jsx')).default
    app = baseApp()
    render(
      <FileStatusCard
        file={{ id: 'e1', fileName: 'Odd TB 6-30-26.xlsx', status: 'error', error: failureText(failure), failure, bytes }}
        needsReview={false}
      />,
    )
    const msg = screen.getByTestId('file-error')
    expect(msg.textContent).toBe(failureText(failure))
    expect(within(msg).getByText('Which column holds the balances?').className).toMatch(/font-semibold/)
    fireEvent.click(screen.getByRole('button', { name: 'Pick the columns' }))
    expect(app.openColumnPicker).toHaveBeenCalledWith('e1')
  })

  it('A40-1 — a P&L half says "Income only" and never "Balanced"', async () => {
    const FileStatusCard = (await import('../FileStatusCard.jsx')).default
    app = baseApp()
    const r = ingest('Holy Family Profit and Loss 6-30-26.xlsx', workbook({ PL: HF_PL }))
    const file = {
      id: 'p1',
      fileName: 'Holy Family Profit and Loss 6-30-26.xlsx',
      status: 'ready',
      rows: r.rows,
      metadata: r.metadata,
      warnings: r.warnings,
      role: 'cy',
      roleConfirmed: true,
      balance: validateDataset(r.rows),
    }
    // The arithmetic of a P&L alone can "balance" — the card must not say so.
    render(<FileStatusCard file={{ ...file, balance: { ...file.balance, balanced: true } }} needsReview={false} />)
    expect(screen.getByTestId('half-pill').textContent).toContain('Income only')
    expect(screen.queryByText('Balanced')).toBeNull()
    expect(screen.getByText('Income statement only — add a Balance Sheet export for the full picture.')).toBeTruthy()
  })
})

describe('IntakeBar groups', () => {
  it('"Needs a role" holds only readable files; unreadable ones get "Couldn’t read"', () => {
    const bar = read('components/IntakeBar.jsx')
    expect(bar).toMatch(/files\.filter\(\(f\) => !slottedIds\.has\(f\.id\) && f\.status !== 'error'\)/)
    expect(bar).toMatch(/files\.filter\(\(f\) => !slottedIds\.has\(f\.id\) && f\.status === 'error'\)/)
    expect(bar).toMatch(/Couldn&rsquo;t read/)
  })

  it('the picker is opened from a handler, never an effect', () => {
    const ctx = read('context/AppContext.jsx')
    expect(ctx).toMatch(/if \(failure\.canPick\) setPickerFileId\(\(prev\) => prev \?\? id\)/)
    expect(ctx).not.toMatch(/useEffect\([^)]*setPickerFileId/)
  })

  it('a save never sends the file bytes — rows and metadata only', () => {
    const ctx = read('context/AppContext.jsx')
    const at = ctx.indexOf('imports.push({')
    const save = ctx.slice(at, ctx.indexOf('})', at))
    expect(save).toMatch(/rows: entry\.rows/)
    expect(save).not.toMatch(/bytes/)
  })
})

// MUST 1 (live UX review): unlabelled DEBIT (C) and CREDIT (D) columns. The
// picker guessed Amounts = C only, said the read was fine, the card said
// "Balanced" over half the books, and "Debit and credit columns…" snapped back
// to "Pick a column…" with no boxes.
describe('MUST 1 — debit and credit columns are never half-read', () => {
  const LEDGER = [
    ['St Rita School'],
    ['Ledger export'],
    [],
    ['Acct', 'Description', null, null, 'Memo'],
    [10100, 'Operating Checking', 612400, null, 'FY26'],
    [10200, 'Savings - Reserve', 1050000, null, 'FY26'],
    [15000, 'Buildings & Improvements', 2400000, null, 'FY26'],
    [20000, 'Accounts Payable', null, 96500, 'FY26'],
    [24000, 'Deferred Tuition Revenue', null, 410000, 'FY26'],
    [30000, 'Net Assets', null, 3555900, 'FY26'],
    [40100, 'Tuition', null, 3850000, 'FY26'],
    [60100, 'Salaries - Faculty', 2140000, null, 'FY26'],
    [61000, 'Payroll Taxes & Benefits', 1710000, null, 'FY26'],
  ]
  const lbytes = workbook({ Sheet1: LEDGER })
  const lpreview = previewFile('ledger export.xlsx', lbytes)
  const renderLedger = (initial = { ...lpreview.guess, amount: 2, debit: -1, credit: -1 }) => {
    render(
      <ColumnPicker
        fileName="ledger export.xlsx"
        bytes={lbytes}
        preview={lpreview}
        initial={initial}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    )
  }
  const select = (label) => screen.getByLabelText(label, { selector: 'select' })

  it('Amounts = C alone says the books are off, and asks about column D', () => {
    renderLedger()
    const live = screen.getByTestId('picker-live')
    expect(live.dataset.tone).toBe('watch')
    expect(screen.getByTestId('picker-offby').textContent).toMatch(/Debits and credits are \$[\d,]+ apart — is a column missing\?/)
    expect(screen.getByTestId('picker-stray').textContent).toMatch(/Column D also has numbers — is it your credits\?/)
  })

  it('"Debit and credit columns…" stays chosen and shows BOTH boxes, prefilled C + D', () => {
    renderLedger()
    fireEvent.change(select('Amounts'), { target: { value: 'dc' } })
    expect(select('Amounts').value).toBe('dc')
    expect(select('Debit').value).toBe('2')
    expect(select('Credit').value).toBe('3')
    const live = screen.getByTestId('picker-live')
    expect(live.dataset.tone).toBe('good')
    expect(screen.queryByTestId('picker-offby')).toBeNull()
    expect(screen.queryByTestId('picker-stray')).toBeNull()
  })

  it('"Use C as debits and D as credits" does the same in one press', () => {
    renderLedger()
    fireEvent.click(screen.getByRole('button', { name: /as debits and .* as credits/ }))
    expect(select('Amounts').value).toBe('dc')
    expect(select('Credit').value).toBe('3')
  })

  it('with nothing guessable the boxes still appear, offering every column', () => {
    const bare = { ...lpreview, suggestedDebitCredit: null, columns: lpreview.columns.map((c) => ({ ...c, numeric: false, kind: 'text' })) }
    render(
      <ColumnPicker
        fileName="ledger export.xlsx"
        bytes={lbytes}
        preview={bare}
        initial={{ ...lpreview.guess, amount: -1, debit: -1, credit: -1 }}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(select('Amounts'), { target: { value: 'dc' } })
    expect(select('Amounts').value).toBe('dc')
    const opts = [...select('Debit').querySelectorAll('option')].map((o) => o.value)
    expect(opts).toEqual(expect.arrayContaining(['2', '3', '4']))
  })

  it('a card whose debits and credits are far apart never says "Balanced"', async () => {
    const { balancePill } = await import('../../lib/statementNotes.js')
    expect(balancePill({ balance: { balanced: true, difference: 7_371_775 } })).toEqual({
      kind: 'offBy',
      amount: 7_371_775,
      label: 'Off by $7,371,775',
    })
    expect(balancePill({ balance: { balanced: true, difference: 0.004 } }).kind).toBe('balanced')
    expect(balancePill({ balance: { balanced: false, difference: 5 } }).kind).toBe('unbalanced')
  })
})
