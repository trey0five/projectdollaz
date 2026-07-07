// Fixture-JSON unit tests for the PURE AR/AP aging parser + bucket rollup. The
// fixture mirrors the real reports/AgedReceivableDetail shape: a Columns declaration,
// then per-bucket Section rows whose LABELS ARE DELIBERATELY WRONG for some rows — the
// parser must IGNORE section labels and compute each item's bucket from
// (report_date − due_date) itself. Also exercises the entity-query fallback, the
// credit-memo/negative clamp, and the top-N rollup.
import { describe, expect, it } from 'vitest'
import {
  bucketFor,
  parseAgedDetail,
  parseEntityAging,
  rollupAging,
  type QboOpenEntity,
} from './qbo-aging.js'

const ENV = 'sandbox' as const
const AS_OF = '2026-07-07'

function row(
  date: string,
  type: string,
  num: string,
  party: string,
  due: string,
  bal: string,
  id: string,
) {
  return {
    ColData: [
      { value: date, id },
      { value: type },
      { value: num },
      { value: party },
      { value: due },
      { value: bal },
    ],
  }
}

// AR detail: 5 open items across parties. The '91 and over' SECTION deliberately holds
// rows that are really d1_30 / d61_90 / d90_plus — proving the parser computes buckets
// from due_date, not the (wrong) section header. Includes a Credit Memo (negative).
const AR_DETAIL = {
  Columns: {
    Column: [
      { ColType: 'tx_date', ColTitle: 'Date' },
      { ColType: 'txn_type', ColTitle: 'Transaction Type' },
      { ColType: 'doc_num', ColTitle: 'Num' },
      { ColType: 'cust_name', ColTitle: 'Customer' },
      { ColType: 'due_date', ColTitle: 'Due Date' },
      { ColType: 'subt_open_bal', ColTitle: 'Open Balance' },
    ],
  },
  Rows: {
    Row: [
      {
        Header: { ColData: [{ value: 'Current' }] },
        Rows: { Row: [row('2026-07-01', 'Invoice', '1001', 'Acme', '2026-07-31', '1000.00', 'i1')] },
        Summary: { ColData: [{ value: 'Total' }, {}, {}, {}, {}, { value: '1000.00' }] },
      },
      {
        // WRONG label on purpose — these rows span several real buckets.
        Header: { ColData: [{ value: '91 and over' }] },
        Rows: {
          Row: [
            row('2026-06-01', 'Invoice', '1002', 'Acme', '2026-06-20', '2000.00', 'i2'), // d1_30
            row('2026-04-01', 'Invoice', '1003', 'Beta', '2026-04-20', '500.00', 'i3'), // d61_90
            row('2026-02-01', 'Invoice', '1004', 'Gamma', '2026-03-01', '3000.00', 'i4'), // d90_plus
            row('2026-02-15', 'Credit Memo', 'CM1', 'Gamma', '2026-03-10', '-400.00', 'cm1'), // d90_plus credit
            // spacer row (no date, no amount) — must be skipped.
            { ColData: [{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
          ],
        },
      },
    ],
  },
}

describe('bucketFor', () => {
  it('maps days-overdue to the 5 buckets (boundaries inclusive on the low side)', () => {
    expect(bucketFor(0)).toBe('current')
    expect(bucketFor(-5)).toBe('current')
    expect(bucketFor(1)).toBe('d1_30')
    expect(bucketFor(30)).toBe('d1_30')
    expect(bucketFor(31)).toBe('d31_60')
    expect(bucketFor(60)).toBe('d31_60')
    expect(bucketFor(61)).toBe('d61_90')
    expect(bucketFor(90)).toBe('d61_90')
    expect(bucketFor(91)).toBe('d90_plus')
    expect(bucketFor(400)).toBe('d90_plus')
  })
})

describe('parseAgedDetail', () => {
  it('emits one AgingItem per detail row, bucket computed from due_date (NOT the section label)', () => {
    const items = parseAgedDetail(AR_DETAIL, AS_OF, 'ar', ENV)
    expect(items).toHaveLength(5) // spacer skipped

    const byId = Object.fromEntries(items.map((i) => [i.txnId, i]))
    expect(byId.i1.bucket).toBe('current')
    expect(byId.i2.bucket).toBe('d1_30') // in the '91 and over' section, but really 17 days late
    expect(byId.i3.bucket).toBe('d61_90')
    expect(byId.i4.bucket).toBe('d90_plus')
    expect(byId.cm1.bucket).toBe('d90_plus')
    expect(byId.cm1.amount).toBe(-400) // signed credit
    expect(byId.i2.party).toBe('Acme')
  })

  it('builds QuickBooks deep-links from the txn type + id', () => {
    const items = parseAgedDetail(AR_DETAIL, AS_OF, 'ar', ENV)
    const i1 = items.find((i) => i.txnId === 'i1')!
    expect(i1.deepLink).toBe('https://app.sandbox.qbo.intuit.com/app/invoice?txnId=i1')
  })
})

describe('rollupAging', () => {
  it('sums buckets over ALL rows (credits net out) and clamps overdue/90+ ≥ 0', () => {
    const roll = rollupAging(parseAgedDetail(AR_DETAIL, AS_OF, 'ar', ENV))
    expect(roll.buckets.current).toBe(1000)
    expect(roll.buckets.d1_30).toBe(2000)
    expect(roll.buckets.d61_90).toBe(500)
    expect(roll.buckets.d90_plus).toBe(2600) // 3000 − 400 credit
    expect(roll.total).toBe(6100)
    expect(roll.overdue).toBe(5100) // 2000 + 500 + 2600
    expect(roll.d90Plus).toBe(2600)
    expect(roll.dueSoon).toBe(1000) // the Current bucket
    expect(roll.accounts).toBe(3) // Acme, Beta, Gamma with positive totals
    expect(roll.overdue90Count).toBe(1) // Gamma's net 90+ is positive
  })

  it('ranks top parties by overdue desc, then |total|', () => {
    const roll = rollupAging(parseAgedDetail(AR_DETAIL, AS_OF, 'ar', ENV))
    expect(roll.top.map((p) => p.party)).toEqual(['Gamma', 'Acme', 'Beta'])
    // Per-party overdue is GROSS positive (the −400 credit nets out of the aggregate
    // bucket, but a party's overdue owed is the sum of its positive past-due items).
    expect(roll.top[0].overdue).toBe(3000)
    expect(roll.top[1].overdue).toBe(2000) // Acme's current $1000 is NOT counted as overdue
  })

  it('a net-credit overdue bucket clamps overdue to 0 (a credit is never money owed)', () => {
    const items = parseEntityAging(
      [
        { Id: '9', DueDate: '2026-05-25', Balance: '-800.00', CustomerRef: { name: 'Refund Co' } },
      ] as QboOpenEntity[],
      AS_OF,
      'ar',
      ENV,
    )
    const roll = rollupAging(items)
    expect(roll.buckets.d31_60).toBe(-800)
    expect(roll.overdue).toBe(0) // clamped
    expect(roll.d90Plus).toBe(0)
  })
})

describe('parseEntityAging (fallback)', () => {
  it('computes aging from Invoice/Bill entity rows; skips zero-balance items', () => {
    const entities: QboOpenEntity[] = [
      { Id: '55', DocNumber: '2001', TxnDate: '2026-05-01', DueDate: '2026-05-15', Balance: '750.00', CustomerRef: { name: 'Zed' } },
      { Id: '56', DocNumber: '2002', TxnDate: '2026-06-01', DueDate: '2026-06-30', Balance: 0, CustomerRef: { name: 'Paid' } },
    ]
    const items = parseEntityAging(entities, AS_OF, 'ar', ENV)
    expect(items).toHaveLength(1) // zero-balance skipped
    expect(items[0].party).toBe('Zed')
    expect(items[0].bucket).toBe('d31_60') // 53 days late
    expect(items[0].type).toBe('Invoice')
    expect(items[0].deepLink).toBe('https://app.sandbox.qbo.intuit.com/app/invoice?txnId=55')
  })

  it('AP side routes bills to the bill deep-link + reads VendorRef', () => {
    const items = parseEntityAging(
      [{ Id: '77', DueDate: '2026-06-01', Balance: '1200.00', VendorRef: { name: 'Landlord' } }] as QboOpenEntity[],
      AS_OF,
      'ap',
      ENV,
    )
    expect(items[0].party).toBe('Landlord')
    expect(items[0].type).toBe('Bill')
    expect(items[0].deepLink).toBe('https://app.sandbox.qbo.intuit.com/app/bill?txnId=77')
  })
})
