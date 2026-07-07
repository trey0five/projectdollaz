// Reconcile / tie-out unit tests for the drill orchestrator, driven through fakes
// (no Nest, no DB, no live QBO). These pin the arithmetic the whole feature stands
// on: a ties-to-the-penny SOA line, a legit amber diff (a reclass gap), and the SFP
// opening-balance plug that makes a balance reconcile. Sign handling is exercised as
// `sign * natural-amount`; the exact subt_nat_amount convention is probe-pending
// (qbo-gl-probe.md), so fixtures are built to the code's arithmetic on purpose.
import { describe, expect, it } from 'vitest'
import type { QboAccountMeta } from './qbo.client.js'
import { QboDrillService } from './qbo-drill.service.js'

function meta(p: Partial<QboAccountMeta> & { id: number }): QboAccountMeta {
  return {
    id: p.id,
    acctNum: p.acctNum ?? null,
    accountType: p.accountType ?? '',
    accountSubType: p.accountSubType ?? '',
    classification: p.classification ?? '',
  }
}

/** A minimal GeneralLedger report for ONE account section (no account_name column,
 *  so rows inherit the section header's account name + id — the GL primary shape). */
function glReport(acctName: string, acctId: string, rows: Array<{ id: string; type: string; amount: number }>) {
  return {
    Columns: {
      Column: [
        { ColType: 'tx_date' },
        { ColType: 'txn_type' },
        { ColType: 'doc_num' },
        { ColType: 'name' },
        { ColType: 'memo' },
        { ColType: 'subt_nat_amount' },
      ],
    },
    Rows: {
      Row: [
        {
          Header: { ColData: [{ value: acctName, id: acctId }] },
          Rows: {
            Row: rows.map((r) => ({
              ColData: [
                { value: '2025-09-01', id: r.id },
                { value: r.type },
                { value: '' },
                { value: 'Vendor' },
                { value: '' },
                { value: String(r.amount) },
              ],
            })),
          },
        },
      ],
    },
  }
}

function makeService(opts: {
  lineage: unknown
  metas: QboAccountMeta[]
  gl: unknown
  qbSourced?: boolean
  /** undefined → the default Acme direct connection; null → no direct connection (org-fed path). */
  connection?: unknown
  /** The fake OrgQboTokenService.forSchool result (the org-fed branch). */
  orgToken?: unknown
  /** When supplied, the last getGeneralLedger opts are recorded on `.last` (dept assertions). */
  captureGl?: { last?: { department?: string[]; accountIds?: string[] } }
}) {
  const periods = { getOwnedPeriod: async () => ({ periodEndDate: new Date('2026-06-30T00:00:00Z') }) }
  const prisma = {
    statementSnapshot: { findFirst: async () => ({ payload: { lineage: opts.lineage } }) },
    import: { count: async () => (opts.qbSourced === false ? 0 : 1) },
  }
  const conn =
    opts.connection === undefined
      ? { conn: { realmId: 'R1', environment: 'sandbox', companyName: 'Acme School' }, token: 'TOKEN' }
      : opts.connection
  const qbo = { connectionForSchool: async () => conn }
  const orgToken = opts.orgToken !== undefined ? opts.orgToken : { forSchool: async () => null }
  const byId = new Map(opts.metas.map((m) => [m.id, m]))
  const client = {
    accountMeta: async () => ({ byId, byName: new Map() }),
    getGeneralLedger: async (_realm: string, _token: string, glOpts: { department?: string[]; accountIds?: string[] }) => {
      if (opts.captureGl) opts.captureGl.last = glOpts
      return opts.gl
    },
  }
  return new QboDrillService(
    prisma as never,
    periods as never,
    qbo as never,
    client as never,
    orgToken as never,
  )
}

describe('QboDrillService.drill — reconcile', () => {
  it('ties to the penny when the transactions sum to the line value', async () => {
    const svc = makeService({
      lineage: {
        soa: { cy: { instructional: { line: 'instructional', value: 500, sign: 1, sources: [{ acct: 60007, desc: 'Advertising' }] } } },
      },
      metas: [meta({ id: 7, accountType: 'Expense' })], // 60007 → id 7
      gl: glReport('Advertising', '7', [
        { id: '101', type: 'Bill', amount: 405 },
        { id: '102', type: 'Expense', amount: 95 },
      ]),
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'instructional' })
    expect(r.drillable).toBe(true)
    expect(r.transactions).toHaveLength(2)
    expect(r.reconcile.drilledSum).toBe(500)
    expect(r.reconcile.diff).toBe(0)
    expect(r.reconcile.ties).toBe(true)
    // Sorted by |amount| desc.
    expect(r.transactions.map((t) => t.amount)).toEqual([405, 95])
    // A real per-txn deep link into the sandbox company.
    expect(r.transactions[0].deepLink).toContain('app.sandbox.qbo.intuit.com')
  })

  it('reports an honest amber diff when the transactions leave a gap', async () => {
    const svc = makeService({
      lineage: {
        soa: { cy: { instructional: { line: 'instructional', value: 500, sign: 1, sources: [{ acct: 60007, desc: 'Advertising' }] } } },
      },
      metas: [meta({ id: 7, accountType: 'Expense' })],
      gl: glReport('Advertising', '7', [
        { id: '101', type: 'Bill', amount: 405 },
        { id: '102', type: 'Expense', amount: 45 },
      ]),
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'instructional' })
    expect(r.reconcile.drilledSum).toBe(450)
    expect(r.reconcile.diff).toBe(50)
    expect(r.reconcile.ties).toBe(false)
    expect(r.reconcile.note).toBeTruthy()
  })

  it('synthesizes an SFP opening-balance plug so a balance reconciles', async () => {
    const svc = makeService({
      lineage: {
        sfp: { cy: { cash: { line: 'cash', value: 4063.52, sign: 1, sources: [{ acct: 100, desc: 'Checking' }] } } },
      },
      metas: [meta({ id: 35, accountType: 'Bank' })], // 100 → id 35 (deriveAcct replay)
      gl: glReport('Checking', '35', [
        { id: '201', type: 'Deposit', amount: 2000 },
        { id: '202', type: 'Check', amount: 63.52 },
      ]),
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SFP', variant: 'cy', lineKey: 'cash' })
    expect(r.drillable).toBe(true)
    // Opening = lineValue − Σ(FY activity) = 4063.52 − 2063.52 = 2000.
    expect(r.reconcile.opening).toBe(2000)
    expect(r.reconcile.drilledSum).toBe(4063.52)
    expect(r.reconcile.ties).toBe(true)
    // The leading pseudo-row is the opening plug (not counted in the reconcile total).
    expect(r.transactions[0].type).toContain('Opening balance')
    expect(r.transactions[0].deepLink).toBeNull()
    expect(r.reconcile.total).toBe(2) // only the two real txns
  })

  it('degrades honestly for a non-QuickBooks period (source gate)', async () => {
    const svc = makeService({
      lineage: {
        soa: { cy: { instructional: { line: 'instructional', value: 500, sign: 1, sources: [{ acct: 60007, desc: 'Advertising' }] } } },
      },
      metas: [meta({ id: 7, accountType: 'Expense' })],
      gl: glReport('Advertising', '7', []),
      qbSourced: false,
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'instructional' })
    expect(r.drillable).toBe(false)
    expect(r.reason).toBe('not-quickbooks')
  })

  it('marks a calculated subtotal (empty sources) as non-drillable', async () => {
    const svc = makeService({
      lineage: { soa: { cy: { totalRev: { line: 'totalRev', value: 1000, sign: 1, sources: [] } } } },
      metas: [],
      gl: glReport('x', '1', []),
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'totalRev' })
    expect(r.drillable).toBe(false)
    expect(r.reason).toBe('subtotal')
  })

  it('drills an ORG-FED (Topology B) school against the org company, dept-filtered', async () => {
    const captureGl: { last?: { department?: string[]; accountIds?: string[] } } = {}
    const svc = makeService({
      lineage: {
        soa: { cy: { instructional: { line: 'instructional', value: 500, sign: 1, sources: [{ acct: 60007, desc: 'Advertising' }] } } },
      },
      metas: [meta({ id: 7, accountType: 'Expense' })],
      gl: glReport('Advertising', '7', [
        { id: '101', type: 'Bill', amount: 405 },
        { id: '102', type: 'Expense', amount: 95 },
      ]),
      connection: null, // no direct connection → org-fed branch
      orgToken: {
        forSchool: async () => ({
          conn: { realmId: 'ORG-REALM', companyName: 'Diocese of Example' },
          token: 'ORG-TOKEN',
          env: 'sandbox',
          dimension: 'department',
          filterableQboIds: ['2'], // St. Joseph
          includesUnspecified: false,
          dimensionNames: ['St. Joseph Campus'],
        }),
      },
      captureGl,
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'instructional' })
    expect(r.drillable).toBe(true)
    expect(r.source.topology).toBe('org')
    expect(r.source.companyName).toBe('Diocese of Example')
    expect(r.source.realmId).toBe('ORG-REALM')
    // The GL pull was sliced to the school's mapped Location(s) via &department=.
    expect(captureGl.last?.department).toEqual(['2'])
    expect(r.reconcile.ties).toBe(true)
    expect(r.reconcile.drilledSum).toBe(500)
  })

  it('keeps unsupported-topology-b for an org-fed school mapped only to "Not Specified"', async () => {
    const svc = makeService({
      lineage: {
        soa: { cy: { instructional: { line: 'instructional', value: 500, sign: 1, sources: [{ acct: 60007, desc: 'Advertising' }] } } },
      },
      metas: [meta({ id: 7, accountType: 'Expense' })],
      gl: glReport('Advertising', '7', []),
      connection: null,
      orgToken: {
        forSchool: async () => ({
          conn: { realmId: 'ORG-REALM', companyName: 'Diocese of Example' },
          token: 'ORG-TOKEN',
          env: 'sandbox',
          dimension: 'department',
          filterableQboIds: [], // only __unspecified__ mapped — no id to filter by
          includesUnspecified: true,
          dimensionNames: [],
        }),
      },
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'instructional' })
    expect(r.drillable).toBe(false)
    expect(r.reason).toBe('unsupported-topology-b')
  })

  it('reports not-connected for a school with neither a direct nor an org connection', async () => {
    const svc = makeService({
      lineage: {
        soa: { cy: { instructional: { line: 'instructional', value: 500, sign: 1, sources: [{ acct: 60007, desc: 'Advertising' }] } } },
      },
      metas: [meta({ id: 7, accountType: 'Expense' })],
      gl: glReport('Advertising', '7', []),
      connection: null,
      orgToken: { forSchool: async () => null },
    })
    const r = await svc.drill('school', { periodId: 'p', statement: 'SOA', variant: 'cy', lineKey: 'instructional' })
    expect(r.drillable).toBe(false)
    expect(r.reason).toBe('not-connected')
  })
})
