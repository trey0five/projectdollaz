// Unit tests for the PURE engine-acct → QBO-account-id reversal. These pin the
// inverse of deriveAcct/qboPlSection: revenue/expense block arithmetic, real-AcctNum
// union, balance-sheet deriveAcct-replay union, and the non-reversible cases that
// must degrade to [] (shown but not linkable, excluded from the reconcile).
import { describe, expect, it } from 'vitest'
import { type QboAccountMeta } from './qbo.client.js'
import { buildAccountLinkage, reverseAcct } from './qbo-drill.linkage.js'

function meta(p: Partial<QboAccountMeta> & { id: number }): QboAccountMeta {
  return {
    id: p.id,
    acctNum: p.acctNum ?? null,
    accountType: p.accountType ?? '',
    accountSubType: p.accountSubType ?? '',
    classification: p.classification ?? '',
  }
}

// A realistic live account list: two banks (→ engine 100), an income + expense with
// no AcctNum (→ 40000/60000 blocks), and one school-numbered AcctNum account.
const METAS: QboAccountMeta[] = [
  meta({ id: 35, accountType: 'Bank' }), // → engine 100 (cash)
  meta({ id: 41, accountType: 'Bank' }), // → engine 100 (cash), UNION
  meta({ id: 82, accountType: 'Income' }), // → engine 40082
  meta({ id: 80, accountType: 'Expense' }), // → engine 60080
  meta({ id: 7, acctNum: 1200, accountType: 'Other Current Asset' }), // real AcctNum 1200
]

describe('reverseAcct', () => {
  it('revenue block: resolves to the QBO id whose deriveAcct lands on the engine acct', () => {
    expect(reverseAcct(40082, METAS)).toEqual(['82'])
  })

  it('expense block: resolves to the QBO id whose deriveAcct lands on the engine acct', () => {
    expect(reverseAcct(60080, METAS)).toEqual(['80'])
  })

  it('balance-sheet fixed number: UNION of every QBO account deriveAcct lands on 100', () => {
    expect(reverseAcct(100, METAS).sort()).toEqual(['35', '41'])
  })

  it('real AcctNum: union of QBO ids carrying that number', () => {
    expect(reverseAcct(1200, METAS)).toEqual(['7'])
  })

  it('synthetic ≥90000 is non-reversible → [] (shown but not linkable)', () => {
    expect(reverseAcct(90001, METAS)).toEqual([])
  })

  // Regression (Reviewer A): a 5-digit real AcctNum that falls INSIDE the revenue
  // block range must resolve to its real QBO id, NOT the block-arithmetic acct−40000.
  it('5-digit revenue AcctNum resolves to its real id, not block arithmetic', () => {
    const metas = [...METAS, meta({ id: 88, acctNum: 45000, accountType: 'Income' })]
    expect(reverseAcct(45000, metas)).toEqual(['88']) // NOT ['5000']
  })

  // Regression (Reviewer A): a fixed BS number with one numbered + one unnumbered
  // contributor must UNION both (the old byAcctNum-OR-derive branch dropped one).
  it('fixed BS number unions a numbered and an unnumbered contributor', () => {
    const metas = [
      meta({ id: 11, acctNum: 100, accountType: 'Bank' }), // numbered, derives to 100
      meta({ id: 22, accountType: 'Bank' }), // unnumbered, derives to 100
    ]
    expect(reverseAcct(100, metas).sort()).toEqual(['11', '22'])
  })
})

describe('buildAccountLinkage', () => {
  it('dedupes by engine acct, keeps the lineage desc, and flags linkability', () => {
    const links = buildAccountLinkage(
      [
        { acct: 100, desc: 'Checking' },
        { acct: 100, desc: 'Savings' }, // same engine acct → collapsed
        { acct: 40082, desc: 'Design income' },
        { acct: 90001, desc: 'Mystery synthetic' }, // non-linkable
      ],
      METAS,
    )
    expect(links).toHaveLength(3)

    const cash = links.find((l) => l.acct === 100)!
    expect(cash.qboAccountIds.sort()).toEqual(['35', '41'])
    expect(cash.linkable).toBe(true)
    expect(cash.name).toBe('Checking') // first desc wins

    const income = links.find((l) => l.acct === 40082)!
    expect(income).toMatchObject({ qboAccountIds: ['82'], linkable: true })

    const synthetic = links.find((l) => l.acct === 90001)!
    expect(synthetic).toMatchObject({ qboAccountIds: [], linkable: false })
  })
})
