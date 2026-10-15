// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-15 live garble: "Wrong numbers? Change columns" on the Holy Family
// QuickBooks workbook (read correctly, 34 accounts) opened the column picker,
// whose Account-numbers select offered — and pre-selected — the BUDGET column:
// the save became 14 rows like { acct: 2100000, desc: '60100 Salaries - Faculty' }.
//
//   • a clean QuickBooks statement read never offers "Change columns" (it was
//     read by its structure, not by columns);
//   • the picker greys out every column of amounts for "Account numbers"
//     ("Column C — “Budget” · amounts"), and a pick that uses one anyway is
//     refused live in plain words.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ingest, previewFile } from '@finrep/ingestion'
import { validateDataset } from '@finrep/engine'
import ColumnPicker, { isAmountsColumn } from './ColumnPicker.jsx'
import { statementLines } from '../../lib/statementNotes.js'
import { holyFamilyStatements, workbook } from '../../lib/__fixtures__/holyFamily.js'

let app = {}
vi.mock('../../context/AppContext.jsx', () => ({ useApp: () => app }))
afterEach(() => cleanup())

const NAME = 'Holy Family Academy Financial Statements 6-30-26.xlsx'
const bytes = holyFamilyStatements()
const OWNER = { sheet: 'Profit and Loss', headerRow: 5, desc: 0, amount: 1, acct: 2, debit: -1, credit: -1 }

const readyEntry = (fileName, b, extra = {}) => {
  const r = ingest(fileName, b, extra.columns ? { columns: extra.columns } : undefined)
  return {
    id: 'f1',
    fileName,
    status: 'ready',
    bytes: b,
    rows: r.rows,
    metadata: r.metadata,
    warnings: r.warnings,
    role: 'cy',
    roleConfirmed: true,
    balance: validateDataset(r.rows),
  }
}

describe('a clean QuickBooks statement read has no "Change columns"', () => {
  it('the Holy Family workbook (34 accounts, full) offers no column picker', () => {
    const f = readyEntry(NAME, bytes)
    expect(f.metadata.statement.partial).toBe('full')
    expect(f.rows).toHaveLength(34)
    const lines = statementLines(f)
    expect(lines.find((l) => l.key === 'layout')).toBeUndefined()
    expect(lines.some((l) => l.action?.kind === 'columns')).toBe(false)
  })

  it('the card renders no "Change columns" link for it', async () => {
    const FileStatusCard = (await import('../FileStatusCard.jsx')).default
    app = { setFileRole: vi.fn(), removeFile: vi.fn(), canEdit: true, openColumnPicker: vi.fn(), schoolId: 's1' }
    render(<FileStatusCard file={readyEntry(NAME, bytes)} needsReview={false} />)
    expect(screen.queryByRole('button', { name: 'Change columns' })).toBeNull()
    expect(screen.queryByText('Wrong numbers?')).toBeNull()
  })

  it('a plain trial balance still offers it, and a picked read still says "Change"', () => {
    const tb = workbook({ Sheet1: [['Acct', 'Desc', 'Balance'], [1010, 'Cash', 500], [4000, 'Tuition', -500]] })
    const plain = readyEntry('TB 6-30-26.xlsx', tb)
    expect(plain.metadata.statement).toBeUndefined()
    expect(statementLines(plain).find((l) => l.key === 'layout')).toMatchObject({
      text: 'Wrong numbers?',
      action: { kind: 'columns', label: 'Change columns' },
    })
    const picked = readyEntry(NAME, bytes, { columns: { ...OWNER, acct: -1 } })
    expect(statementLines(picked).find((l) => l.key === 'layout')).toMatchObject({
      text: 'Read with your columns',
      action: { kind: 'columns', label: 'Change' },
    })
  })
})

describe('the picker never offers amounts as the account numbers', () => {
  const preview = previewFile(NAME, bytes)
  const select = (label) => screen.getByLabelText(label, { selector: 'select' })
  const opt = (label, value) => [...select(label).querySelectorAll('option')].find((o) => o.value === value)
  const renderPicker = (initial) =>
    render(
      <ColumnPicker fileName={NAME} bytes={bytes} preview={preview} initial={initial} onApply={vi.fn()} onCancel={() => {}} />,
    )

  it('Holy Family P&L: C–E are greyed out and labelled "amounts"; None is the guess', () => {
    renderPicker(preview.guess)
    expect(select('Account numbers').value).toBe('-1')
    expect(opt('Account numbers', '-1').textContent).toBe('None — KYRO numbers them')
    // A is the names (greyed for that reason, not as amounts).
    expect(opt('Account numbers', '0').textContent).toMatch(/used for Names$/)
    // B is the Amounts (greyed as used); C–E are greyed as amounts.
    expect(opt('Account numbers', '1').textContent).toMatch(/used for Amounts$/)
    for (const [v, letter] of [['2', 'C'], ['3', 'D'], ['4', 'E']]) {
      expect(opt('Account numbers', v).disabled).toBe(true)
      expect(opt('Account numbers', v).textContent).toMatch(new RegExp(`^Column ${letter} — .* · amounts$`))
    }
    expect(opt('Account numbers', '2').textContent).toBe('Column C — “Budget” · amounts')
    // Amounts still offers Actual (B) — the flag only blocks the account numbers.
    expect(opt('Amounts', '1').disabled).toBe(false)
    // The guess reads the P&L section-signed: the automatic read’s 19 accounts.
    expect(screen.getByTestId('picker-live').textContent).toMatch(/^19 accounts · read as/)
  })

  it('the owner’s saved layout (Budget as account numbers) is refused live and cannot be applied', () => {
    renderPicker(OWNER)
    const live = screen.getByTestId('picker-live')
    expect(live.dataset.tone).toBe('watch')
    expect(live.textContent).toBe(
      'Column C holds amounts, not account numbers. Pick the column with your account numbers, or “None — KYRO numbers them” if there isn’t one.',
    )
    expect(screen.getByRole('button', { name: 'Use these columns' }).disabled).toBe(true)
  })

  it('isAmountsColumn reads the parser’s flag only — never budgetish (an Acct column on a budget report)', () => {
    expect(preview.columns.map((c) => isAmountsColumn(c))).toEqual([false, true, true, true, true])
    expect(isAmountsColumn({ index: 0, holdsAmounts: false, budgetish: true })).toBe(false)
    expect(isAmountsColumn({ index: 0, kind: 'acct' })).toBe(false)
    expect(isAmountsColumn({ index: 1, holdsAmounts: false }, [false, true])).toBe(true)
  })

  it('a budget report’s Acct column stays pickable for the account numbers', () => {
    const bva = workbook({
      Sheet1: [
        ['Budget vs. Actuals'],
        ['Acct', 'Desc', 'Actual', 'Budget'],
        [4000, 'Tuition', -480000, -500000],
        [5000, 'Salaries', 300000, 310000],
      ],
    })
    const p = previewFile('Budget vs Actuals.xlsx', bva)
    render(<ColumnPicker fileName="Budget vs Actuals.xlsx" bytes={bva} preview={p} initial={p.guess} onApply={vi.fn()} onCancel={() => {}} />)
    expect(select('Account numbers').value).toBe('0')
    expect(opt('Account numbers', '0').disabled).toBe(false)
    expect(opt('Account numbers', '3').textContent).toMatch(/· amounts$/)
  })

  it('moving the header row re-judges the columns', () => {
    const tb = workbook({ Sheet1: [['Acct', 'Desc', 'Balance'], [1010, 'Cash', 500], [4000, 'Tuition', -500]] })
    const p = previewFile('TB.xlsx', tb)
    render(<ColumnPicker fileName="TB.xlsx" bytes={tb} preview={p} initial={{ ...p.guess, amount: 1, desc: -1 }} onApply={vi.fn()} onCancel={() => {}} />)
    // Row 1 names column C "Balance": amounts.
    expect(opt('Account numbers', '2').textContent).toMatch(/· amounts$/)
    // No header row: C is judged by its numbers alone (500, −500) — no longer flagged.
    fireEvent.change(select('Column names are in'), { target: { value: '-1' } })
    expect(opt('Account numbers', '2').disabled).toBe(false)
    expect(opt('Account numbers', '2').textContent).not.toMatch(/amounts/)
  })

  it('a ledger export: its debit / credit columns are greyed out for the account numbers', () => {
    const ledger = workbook({
      Sheet1: [
        ['St Rita School', null, null, null],
        ['Acct', 'Description', '', ''],
        ['10100', 'Operating Checking', 612400, ''],
        ['20000', 'Accounts Payable', '', 96500],
        ['40100', 'Tuition', '', 3850000],
        ['60100', 'Salaries - Faculty', 2140000, ''],
        ['65000', 'Utilities', 1192100, ''],
      ],
    })
    const p = previewFile('ledger export.xlsx', ledger)
    render(<ColumnPicker fileName="ledger export.xlsx" bytes={ledger} preview={p} initial={p.guess} onApply={vi.fn()} onCancel={() => {}} />)
    expect(select('Account numbers').value).toBe('0')
    // Debit C / Credit D are in use; read Amounts = C alone and D is still greyed — as amounts.
    fireEvent.change(select('Amounts'), { target: { value: '2' } })
    expect(opt('Account numbers', '2').textContent).toMatch(/used for Amounts$/)
    expect(opt('Account numbers', '3').disabled).toBe(true)
    expect(opt('Account numbers', '3').textContent).toBe('Column D · amounts')
    expect(opt('Account numbers', '0').disabled).toBe(false)
  })
})
