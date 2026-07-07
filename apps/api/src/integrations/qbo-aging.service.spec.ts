// Unit tests for the aging ORCHESTRATOR, driven through fakes (no Nest, no DB, no
// live QBO). Pins: bucketize/top-N from a live pull, the LRU+TTL cache (+ refresh
// bypass), the DETAIL→entity fallback, the write-through upsert, graceful stale-on-
// failure (last snapshot, never a throw), and not-connected.
import { describe, expect, it } from 'vitest'
import { QboAgingService } from './qbo-aging.service.js'
import { OrgQboTokenService } from './qbo-org-token.service.js'

const AS_OF_ROW = () => new Date()

function arDetail(rows: Array<[string, string, string]>) {
  // rows: [party, dueDate, openBal]
  return {
    Columns: {
      Column: [
        { ColType: 'tx_date' },
        { ColType: 'txn_type' },
        { ColType: 'doc_num' },
        { ColType: 'cust_name' },
        { ColType: 'due_date' },
        { ColType: 'subt_open_bal' },
      ],
    },
    Rows: {
      Row: rows.map(([party, due, bal], i) => ({
        ColData: [
          { value: '2026-01-01', id: `inv${i}` },
          { value: 'Invoice' },
          { value: String(1000 + i) },
          { value: party },
          { value: due },
          { value: bal },
        ],
      })),
    },
  }
}

const EMPTY_REPORT = { Rows: { Row: [] } }

interface Overrides {
  connection?: unknown
  arReport?: unknown
  apReport?: unknown
  openInvoices?: unknown
  openBills?: unknown
  storedRow?: unknown
  snapshot?: unknown
  /** The fake OrgQboTokenService.forSchool result (Topology B org-fed branch). */
  orgToken?: unknown
}

function makeService(over: Overrides = {}) {
  const calls = { arDetail: 0, apDetail: 0, openInvoices: 0, openBills: 0, upsert: 0 }
  // The last department opts each aged report received (Topology B slice assertions).
  const deptSeen: { ar?: string[]; ap?: string[] } = {}
  const conn =
    over.connection === undefined
      ? { conn: { realmId: 'realm-1', environment: 'sandbox', companyName: 'Acme Co' }, token: 'tok' }
      : over.connection

  const qbo = { connectionForSchool: async () => conn }
  const client = {
    getAgedReceivableDetail: async (_r: string, _t: string, _asOf: string, opts?: { department?: string[] }) => {
      calls.arDetail++
      deptSeen.ar = opts?.department
      return over.arReport ?? EMPTY_REPORT
    },
    getAgedPayableDetail: async (_r: string, _t: string, _asOf: string, opts?: { department?: string[] }) => {
      calls.apDetail++
      deptSeen.ap = opts?.department
      return over.apReport ?? EMPTY_REPORT
    },
    queryOpenInvoices: async () => {
      calls.openInvoices++
      return over.openInvoices ?? { QueryResponse: { Invoice: [] } }
    },
    queryOpenBills: async () => {
      calls.openBills++
      return over.openBills ?? { QueryResponse: { Bill: [] } }
    },
  }
  const prisma = {
    statementSnapshot: {
      findFirst: async () =>
        over.snapshot ?? { payload: { soaResults: { cy: { totalRev: 1_000_000, totalExp: 900_000 } } } },
    },
    arApAgingSnapshot: {
      upsert: async () => {
        calls.upsert++
        return {}
      },
      findFirst: async () => over.storedRow ?? null,
    },
    school: { findUnique: async () => ({ organizationId: 'org-1' }) },
    orgQboConnection: { findUnique: async () => null },
    orgQboMapping: { count: async () => 0 },
  }
  const orgToken = over.orgToken !== undefined ? over.orgToken : { forSchool: async () => null }
  // QboService AND OrgQboTokenService are resolved lazily via ModuleRef (breaks the
  // eval-time import cycle for the former; keeps the leaf accessor cycle-safe for the latter).
  const moduleRef = { get: (token: unknown) => (token === OrgQboTokenService ? orgToken : qbo) }
  const svc = new QboAgingService(prisma as never, client as never, moduleRef as never)
  return { svc, calls, deptSeen }
}

describe('QboAgingService.getAging', () => {
  it('bucketizes a live pull, computes DSO, caps top parties, and write-through-persists', async () => {
    const { svc, calls } = makeService({
      arReport: arDetail([
        ['Acme', '2026-07-31', '1000.00'], // current
        ['Beta', '2026-06-20', '2000.00'], // overdue
        ['Beta', '2026-03-01', '3000.00'], // 90+
      ]),
    })
    const res = await svc.getAging('school-1', { refresh: true })
    expect(res.connected).toBe(true)
    expect(res.stale).toBe(false)
    expect(res.source).toBe('aging-detail')
    expect(res.companyName).toBe('Acme Co')
    expect(res.ar.total).toBe(6000)
    expect(res.ar.buckets.current).toBe(1000)
    expect(res.ar.overdue).toBe(5000)
    expect(res.ar.over90).toBe(3000)
    expect(res.ar.top[0].party).toBe('Beta')
    expect(typeof res.ar.dso).toBe('number') // annualRevenue known → DSO computed
    expect(res.net).toBe(6000) // no AP
    expect(calls.upsert).toBe(1) // write-through
  })

  it('caches the pull (2nd call hits cache), but refresh bypasses it', async () => {
    const { svc, calls } = makeService({ arReport: arDetail([['Acme', '2026-06-01', '500.00']]) })
    await svc.getAging('school-1', {})
    await svc.getAging('school-1', {}) // cached → no 2nd QBO call
    expect(calls.arDetail).toBe(1)
    await svc.getAging('school-1', { refresh: true }) // bypasses cache
    expect(calls.arDetail).toBe(2)
  })

  it('falls back to the entity query when the detail report is empty (stamps source)', async () => {
    const { svc, calls } = makeService({
      arReport: EMPTY_REPORT,
      apReport: EMPTY_REPORT,
      openInvoices: {
        QueryResponse: {
          Invoice: [{ Id: '55', DueDate: '2026-05-15', Balance: '750.00', CustomerRef: { name: 'Zed' } }],
        },
      },
    })
    const res = await svc.getAging('school-1', { refresh: true })
    expect(calls.openInvoices).toBe(1)
    expect(res.source).toBe('entity-fallback')
    expect(res.ar.total).toBe(750)
    expect(res.ar.items[0].deepLink).toContain('/app/invoice?txnId=55')
  })

  it('GRACEFUL: a live-pull failure returns the last stored snapshot with stale:true (never throws)', async () => {
    const { svc } = makeService({
      connection: { conn: { realmId: 'r', environment: 'sandbox', companyName: null }, token: 't' },
    })
    // Make the client throw for BOTH detail and the entity fallback.
    ;(svc as unknown as { client: Record<string, unknown> }).client = {
      getAgedReceivableDetail: async () => {
        throw new Error('QBO 401')
      },
      getAgedPayableDetail: async () => {
        throw new Error('QBO 401')
      },
      queryOpenInvoices: async () => {
        throw new Error('QBO 401')
      },
      queryOpenBills: async () => {
        throw new Error('QBO 401')
      },
    }
    ;(svc as unknown as { prisma: { arApAgingSnapshot: { findFirst: () => Promise<unknown> } } }).prisma.arApAgingSnapshot.findFirst =
      async () => ({
        asOfDate: AS_OF_ROW(),
        source: 'aging-detail',
        arTotal: 4000,
        arOverdue: 1500,
        ar90Plus: 500,
        arAccounts: 3,
        apTotal: 200,
        apOverdue: 0,
        apDueSoon: 0,
        apVendors: 1,
        arBuckets: { current: 2500, d1_30: 1000, d31_60: 0, d61_90: 0, d90_plus: 500 },
        apBuckets: { current: 200, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
        arTop: [{ party: 'Stored Co', total: 4000, overdue: 1500, oldestBucket: 'd90_plus', count: 2, worstDeepLink: null }],
        apTop: [],
      })
    const res = await svc.getAging('school-1', { refresh: true })
    expect(res.connected).toBe(true)
    expect(res.stale).toBe(true)
    expect(res.ar.total).toBe(4000)
    expect(res.note).toBeTruthy()
  })

  it('not connected → connected:false (org-fed flag surfaced)', async () => {
    const { svc } = makeService({ connection: null })
    const res = await svc.getAging('school-1', {})
    expect(res.connected).toBe(false)
    expect(res.ar.total).toBe(0)
  })

  it('ORG-FED (Topology B) with attributed items → connected:true, dept-filtered, with a note', async () => {
    const { svc, deptSeen, calls } = makeService({
      connection: null, // no direct connection → org-fed branch
      orgToken: {
        forSchool: async () => ({
          conn: { realmId: 'org-realm', companyName: 'Diocese of Example' },
          token: 'org-tok',
          env: 'sandbox',
          dimension: 'department',
          filterableQboIds: ['1'], // St. Mary Campus
          includesUnspecified: false,
          dimensionNames: ['St. Mary Campus'],
        }),
      },
      arReport: arDetail([
        ['Acme', '2026-06-20', '2000.00'], // overdue, tagged to this Location
      ]),
    })
    const res = await svc.getAging('school-1', { refresh: true })
    expect(res.connected).toBe(true)
    expect(res.orgFed).toBe(true)
    expect(res.companyName).toBe('Diocese of Example')
    expect(res.ar.total).toBe(2000)
    expect(res.note).toBeTruthy() // the honest "tagged to this school's location" note
    // The aged reports were sliced to the school's mapped Location(s) via &department=.
    expect(deptSeen.ar).toEqual(['1'])
    expect(deptSeen.ap).toEqual(['1'])
    expect(calls.upsert).toBe(1) // wrote the school's OWN snapshot
  })

  it('ORG-FED with NO attributed items → keeps the panel (connected:false, orgFed:true), no entity fallback', async () => {
    const { svc, calls } = makeService({
      connection: null,
      orgToken: {
        forSchool: async () => ({
          conn: { realmId: 'org-realm', companyName: 'Diocese of Example' },
          token: 'org-tok',
          env: 'sandbox',
          dimension: 'department',
          filterableQboIds: ['1'],
          includesUnspecified: false,
          dimensionNames: ['St. Mary Campus'],
        }),
      },
      arReport: EMPTY_REPORT,
      apReport: EMPTY_REPORT,
    })
    const res = await svc.getAging('school-1', { refresh: true })
    expect(res.connected).toBe(false)
    expect(res.orgFed).toBe(true)
    // The whole-company entity query must NOT run for an org-fed empty slice (wrong number).
    expect(calls.openInvoices).toBe(0)
    expect(calls.openBills).toBe(0)
    expect(calls.upsert).toBe(0)
  })

  it('ORG-FED school mapped only to "Not Specified" → panel (no id to filter by)', async () => {
    const { svc, calls } = makeService({
      connection: null,
      orgToken: {
        forSchool: async () => ({
          conn: { realmId: 'org-realm', companyName: 'Diocese of Example' },
          token: 'org-tok',
          env: 'sandbox',
          dimension: 'department',
          filterableQboIds: [], // only __unspecified__ mapped
          includesUnspecified: true,
          dimensionNames: [],
        }),
      },
    })
    const res = await svc.getAging('school-1', { refresh: true })
    expect(res.connected).toBe(false)
    expect(res.orgFed).toBe(true)
    expect(calls.arDetail).toBe(0) // never pulled — no id to slice by
  })
})
