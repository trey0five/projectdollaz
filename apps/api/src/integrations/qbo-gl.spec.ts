// Fixture-JSON unit tests for the PURE GeneralLedger parser + deep-link builder.
// The fixture mirrors the real reports/GeneralLedger shape: a Columns declaration,
// then per-account Section rows (Header names the account, nested Data rows carry
// positional ColData with a txn id on the tx_date cell, then a Summary). The parser
// is filter-agnostic — every emitted row self-describes its account.
import { describe, expect, it } from 'vitest'
import { buildDeepLink, parseGeneralLedger, parseTransactionList } from './qbo-gl.js'

// A two-account GL: "Checking" (a bank) with two txns, "Design income" with one.
const GL_FIXTURE = {
  Columns: {
    Column: [
      { ColTitle: 'Date', ColType: 'tx_date' },
      { ColTitle: 'Transaction Type', ColType: 'txn_type' },
      { ColTitle: 'Num', ColType: 'doc_num' },
      { ColTitle: 'Name', ColType: 'name' },
      { ColTitle: 'Memo/Description', ColType: 'memo' },
      { ColTitle: 'Amount', ColType: 'subt_nat_amount' },
    ],
  },
  Rows: {
    Row: [
      {
        Header: { ColData: [{ value: 'Checking', id: '35' }] },
        Rows: {
          Row: [
            {
              ColData: [
                { value: '2025-09-03', id: '1043' },
                { value: 'Check' },
                { value: '1043' },
                { value: 'Aramark' },
                { value: 'Supplies' },
                { value: '-4,210.00' },
              ],
            },
            {
              ColData: [
                { value: '2025-09-08', id: '1044' },
                { value: 'Bill Payment' },
                { value: '' },
                { value: 'Pearson' },
                { value: '' },
                { value: '-1,200.50' },
              ],
            },
            // A spacer/blank row the parser must skip (no date, no amount).
            { ColData: [{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
          ],
        },
        Summary: { ColData: [{ value: 'Total for Checking' }, {}, {}, {}, {}, { value: '-5,410.50' }] },
      },
      {
        Header: { ColData: [{ value: 'Design income', id: '82' }] },
        Rows: {
          Row: [
            {
              ColData: [
                { value: '2025-10-01', id: '2201' },
                { value: 'Invoice' },
                { value: '5005' },
                { value: 'Acme Co' },
                { value: 'Design work' },
                { value: '2,250.00' },
              ],
            },
          ],
        },
        Summary: { ColData: [{ value: 'Total for Design income' }, {}, {}, {}, {}, { value: '2,250.00' }] },
      },
    ],
  },
}

describe('parseGeneralLedger', () => {
  it('emits one GlTxn per detail row, self-describing account + txn id', () => {
    const txns = parseGeneralLedger(GL_FIXTURE)
    expect(txns).toHaveLength(3) // 2 Checking + 1 Design income; spacer skipped

    const [t0, t1, t2] = txns
    expect(t0).toMatchObject({
      txnId: '1043',
      date: '2025-09-03',
      type: 'Check',
      docNumber: '1043',
      payee: 'Aramark',
      memo: 'Supplies',
      amount: -4210,
      acctId: '35',
      acctName: 'Checking',
    })
    // Blank doc_num/memo become null, not ''.
    expect(t1).toMatchObject({ txnId: '1044', docNumber: null, memo: null, amount: -1200.5, acctName: 'Checking' })
    expect(t2).toMatchObject({ txnId: '2201', type: 'Invoice', amount: 2250, acctId: '82', acctName: 'Design income' })
  })

  it('is filter-agnostic — the caller can partition rows by their self-described account', () => {
    const txns = parseGeneralLedger(GL_FIXTURE)
    const checking = txns.filter((t) => t.acctName === 'Checking')
    const income = txns.filter((t) => t.acctName === 'Design income')
    expect(checking.map((t) => t.txnId)).toEqual(['1043', '1044'])
    expect(income.map((t) => t.txnId)).toEqual(['2201'])
  })

  it('tolerates empty / malformed input without throwing', () => {
    expect(parseGeneralLedger(undefined)).toEqual([])
    expect(parseGeneralLedger({})).toEqual([])
    expect(parseGeneralLedger({ Rows: { Row: [] } })).toEqual([])
  })

  it('reads a Location/Department (dept_name) column when the report carries one (additive)', () => {
    const withDept = {
      Columns: {
        Column: [
          { ColTitle: 'Date', ColType: 'tx_date' },
          { ColTitle: 'Transaction Type', ColType: 'txn_type' },
          { ColTitle: 'Num', ColType: 'doc_num' },
          { ColTitle: 'Name', ColType: 'name' },
          { ColTitle: 'Memo', ColType: 'memo' },
          { ColTitle: 'Amount', ColType: 'subt_nat_amount' },
          { ColTitle: 'Account', ColType: 'account_name' },
          { ColTitle: 'Location', ColType: 'dept_name' },
        ],
      },
      Rows: {
        Row: [
          {
            Header: { ColData: [{ value: 'Advertising', id: '7' }] },
            Rows: {
              Row: [
                {
                  ColData: [
                    { value: '2025-09-01', id: '101' },
                    { value: 'Bill' },
                    { value: '' },
                    { value: 'Vendor' },
                    { value: '' },
                    { value: '405.00' },
                    { value: 'Advertising' },
                    { value: 'St. Joseph Campus' },
                  ],
                },
              ],
            },
          },
        ],
      },
    }
    const txns = parseGeneralLedger(withDept)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({ txnId: '101', amount: 405, acctName: 'Advertising', dept: 'St. Joseph Campus' })
  })

  it('leaves dept null when the report carries no dimension column', () => {
    const txns = parseGeneralLedger(GL_FIXTURE)
    expect(txns.every((t) => t.dept === null)).toBe(true)
  })
})

describe('parseTransactionList (fallback B)', () => {
  it('reads a flat report, taking the account from each row account_name column', () => {
    const flat = {
      Columns: {
        Column: [
          { ColTitle: 'Date', ColType: 'tx_date' },
          { ColTitle: 'Transaction Type', ColType: 'txn_type' },
          { ColTitle: 'Num', ColType: 'doc_num' },
          { ColTitle: 'Name', ColType: 'name' },
          { ColTitle: 'Memo', ColType: 'memo' },
          { ColTitle: 'Amount', ColType: 'subt_nat_amount' },
          { ColTitle: 'Account', ColType: 'account_name' },
        ],
      },
      Rows: {
        Row: [
          {
            ColData: [
              { value: '2025-09-03', id: '1043' },
              { value: 'Check' },
              { value: '1043' },
              { value: 'Aramark' },
              { value: 'Supplies' },
              { value: '-4,210.00' },
              { value: 'Checking' },
            ],
          },
        ],
      },
    }
    const txns = parseTransactionList(flat)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({ txnId: '1043', amount: -4210, acctName: 'Checking', acctId: null })
  })
})

describe('buildDeepLink', () => {
  it('routes by transaction type against the sandbox host', () => {
    expect(buildDeepLink('Invoice', '2201', 'sandbox')).toBe(
      'https://app.sandbox.qbo.intuit.com/app/invoice?txnId=2201',
    )
    expect(buildDeepLink('Bill Payment', '1044', 'sandbox')).toBe(
      'https://app.sandbox.qbo.intuit.com/app/billpayment?txnId=1044',
    )
  })

  it('uses the production host for production and txnview for unknown types', () => {
    expect(buildDeepLink('Something Weird', '9', 'production')).toBe(
      'https://app.qbo.intuit.com/app/txnview?txnId=9',
    )
  })

  it('falls back to the account register when there is no txn id', () => {
    expect(buildDeepLink('Journal Entry', null, 'sandbox', '35')).toBe(
      'https://app.sandbox.qbo.intuit.com/app/register?accountId=35',
    )
    // No txn id AND no fallback account → null (no misleading link).
    expect(buildDeepLink('Journal Entry', null, 'sandbox', null)).toBeNull()
  })
})
