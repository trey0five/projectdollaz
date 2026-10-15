// Consolidated Statements tab — the multi-school CONSOLIDATED financial
// statements for the caller's organization. Reads the statements-rollup endpoint
// (one call site in api.js) and renders a per-school summary table plus a
// consolidated Statement of Activities (SOA) and Statement of Financial Position
// (SFP), summed across each school's STORED snapshot (the server never re-runs the
// engine). Strict org isolation is enforced server-side; the web just renders what
// it gets. Advisory / pre-elimination — a straight sum, not an audited consolidation.
//
// Pure presentation over the `rollup` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe).
import { fmt } from '../../lib/format.js'
import { Section, StatStrip, Stat, DataTable } from '../ui/surface/index.js'

// Friendly labels for the engine's flat SOA/SFP field abbreviations. Anything not
// listed falls back to a titleized key, so a new engine field still renders sanely.
const LABELS = {
  // SOA — revenue
  tuition: 'Tuition & fees',
  dev: 'Development & gifts',
  studAct: 'Student activities',
  textbook: 'Textbooks',
  other: 'Other revenue',
  support: 'Sponsor / affiliate support',
  intlRev: 'International program revenue',
  investments: 'Investment income',
  interest: 'Interest income',
  totalRev: 'Total revenue',
  // SOA — expense
  instructional: 'Instruction',
  facilities: 'Facilities & operations',
  fixedOther: 'Other fixed costs',
  intlExp: 'International program expense',
  bus: 'Transportation',
  food: 'Food service',
  studActExp: 'Student activities expense',
  athletics: 'Athletics',
  admin: 'Administration',
  restricted: 'Restricted program expense',
  totalExp: 'Total expense',
  netChange: 'Change in net assets',
  // SFP — assets
  cash: 'Cash & equivalents',
  restrictedCash: 'Restricted cash',
  tuitionRec: 'Tuition receivable',
  prepaid: 'Prepaid expenses',
  totalCurrentA: 'Total current assets',
  ppNet: 'Property & equipment, net',
  rouAsset: 'Right-of-use asset',
  restrictInvst: 'Restricted investments',
  totalAssets: 'Total assets',
  // SFP — liabilities
  apAccrued: 'Accounts payable & accrued',
  leaseCurr: 'Lease liability, current',
  studentClubs: 'Student club funds',
  deferredIntl: 'Deferred international revenue',
  totalCurrL: 'Total current liabilities',
  leaseNonCurr: 'Lease liability, non-current',
  totalLiab: 'Total liabilities',
  // SFP — net assets
  naWithout: 'Without donor restrictions',
  naWith: 'With donor restrictions',
  totalNA: 'Total net assets',
  totalLiabNA: 'Total liabilities & net assets',
  // SCF — cash flows (bundle.scf, flat)
  depr: 'Depreciation',
  arAdj: 'Accounts receivable',
  prepaidAdj: 'Prepaid expenses',
  apAdj: 'Accounts payable & accrued',
  deferredAdj: 'Deferred tuition',
  clubsAdj: 'Due to student organizations',
  operatingCash: 'Net cash from operating activities',
  investmentsCash: 'Purchase of (proceeds from) investments',
  ppePurchases: 'Purchases of property & equipment',
  investingCash: 'Net cash from investing activities',
  leasePayments: 'Payments on lease obligations',
  financingCash: 'Net cash from financing activities',
  netCashChange: 'Net increase (decrease) in cash',
  cashBegin: 'Cash, beginning of year',
  cashEnd: 'Cash, end of year',
  cashUnrestricted: 'Cash',
  cashRestricted: 'Restricted cash',
  // Changes in Net Assets (bundle.netAssets.cy)
  begin: 'Net assets, beginning of year',
  change: 'Change in net assets',
  end: 'Net assets, end of year',
  withoutDonor: 'Without donor restrictions',
  withDonor: 'With donor restrictions',
}

// Subtotal/total rows render emphasized; everything else is a plain line.
const EMPHASIS = new Set([
  'totalRev', 'totalExp', 'netChange', 'totalCurrentA', 'totalAssets',
  'totalCurrL', 'totalLiab', 'totalNA', 'totalLiabNA',
  // SCF subtotals + Changes-in-Net-Assets total
  'operatingCash', 'investingCash', 'financingCash', 'netCashChange', 'cashEnd', 'end',
])

function labelFor(key) {
  if (LABELS[key]) return LABELS[key]
  const spaced = String(key || 'Other')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Ordered rows for a section: only the keys present in `obj`, in the given order,
// skipping subtotal/total keys that the section header handles separately.
function lineRows(obj, keys) {
  if (!obj) return []
  return keys
    .filter((k) => k in obj)
    .map((k) => ({ key: k, value: Number(obj[k]) || 0, emphasis: EMPHASIS.has(k) }))
}

const SOA_REVENUE = ['tuition', 'dev', 'studAct', 'textbook', 'other', 'support', 'intlRev', 'investments', 'interest', 'totalRev']
const SOA_EXPENSE = ['instructional', 'facilities', 'fixedOther', 'intlExp', 'bus', 'food', 'studActExp', 'athletics', 'admin', 'restricted', 'totalExp']
const SFP_ASSETS = ['cash', 'restrictedCash', 'tuitionRec', 'prepaid', 'totalCurrentA', 'ppNet', 'rouAsset', 'restrictInvst', 'totalAssets']
const SFP_LIAB = ['apAccrued', 'leaseCurr', 'studentClubs', 'deferredIntl', 'totalCurrL', 'leaseNonCurr', 'totalLiab']
const SFP_NA = ['naWithout', 'naWith', 'totalNA', 'totalLiabNA']
// SCF section order mirrors StatementOfCashFlows.jsx (operating → investing →
// financing → net change → cash reconciliation).
const SCF_OPERATING = ['netChange', 'depr', 'arAdj', 'prepaidAdj', 'apAdj', 'deferredAdj', 'clubsAdj', 'operatingCash']
const SCF_INVESTING = ['investmentsCash', 'ppePurchases', 'investingCash']
const SCF_FINANCING = ['leasePayments', 'financingCash']
const SCF_NET = ['netCashChange']
const SCF_CASH = ['cashBegin', 'cashEnd', 'cashUnrestricted', 'cashRestricted']
// Changes-in-Net-Assets: roll-forward (begin → change → end) then donor split.
const NA_ROLL = ['begin', 'change', 'end']
const NA_SPLIT = ['withoutDonor', 'withDonor']

// Per-school summary columns (DataTable) — money right-aligned & tabular; the
// reported state is the 2px status mark + an ink word, not a coloured icon.
const money = (block, key) => (r) => (r[block] ? fmt(r[block][key]) : '—')
const SCHOOL_COLUMNS = [
  // The reported state is the row's 2px mark; an unreported school also says so
  // in ink-2 under its name (no separate "Status" column — it pushed the table
  // to 10 columns and wrapped every name). Names hold one line; numbers scroll.
  {
    key: 'name',
    header: 'School',
    className: 'whitespace-nowrap',
    render: (r) => (
      <span className="block">
        <span className="font-medium">{r.name}</span>
        {!r.reported && <span className="block text-[12px] leading-4 text-ink2">Not yet reported</span>}
      </span>
    ),
  },
  { key: 'rev', header: 'Revenue', num: true, render: money('soa', 'totalRev') },
  { key: 'exp', header: 'Expense', num: true, render: money('soa', 'totalExp') },
  { key: 'net', header: 'Net change', num: true, render: money('soa', 'netChange') },
  { key: 'assets', header: 'Total assets', num: true, render: money('sfp', 'totalAssets') },
  { key: 'liab', header: 'Total liabilities', num: true, render: money('sfp', 'totalLiab') },
  { key: 'na', header: 'Net assets', num: true, render: money('sfp', 'totalNA') },
  { key: 'opcash', header: 'Operating cash', num: true, render: money('scf', 'operatingCash') },
  { key: 'cashEnd', header: 'Cash, end', num: true, render: money('scf', 'cashEnd') },
]

export default function OrgStatements({ rollup, loading, error }) {
  if (loading) {
    return (
      <div className="b2-note mt-8" aria-busy="true">
        <p>Consolidating your organization’s statements…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="b2-note mt-8">
        <p>{error}</p>
      </div>
    )
  }
  if (!rollup) return null

  const schools = rollup.schools || []
  const consolidated = rollup.consolidated || {}
  const soa = consolidated.soa || {}
  const sfp = consolidated.sfp || {}
  const scf = consolidated.scf || {}
  const netAssets = consolidated.netAssets || {}
  const notReported = rollup.notReported || []
  const reportedCount = consolidated.reportedCount ?? schools.filter((s) => s.reported).length
  const schoolCount = consolidated.schoolCount ?? schools.length
  // Four INDEPENDENT coverage denominators (a school can be SOA-reported yet lack an
  // SFP / cash-flow / net-assets block). Fall back to counting the per-school flags so
  // an older API response (pre-deploy) still renders honest coverage.
  const sfpReportedCount = consolidated.sfpReportedCount ?? schools.filter((s) => s.sfpReported).length
  const scfReportedCount = consolidated.scfReportedCount ?? schools.filter((s) => s.scfReported).length
  const naReportedCount = consolidated.naReportedCount ?? schools.filter((s) => s.naReported).length
  const noSfp = Math.max(0, reportedCount - sfpReportedCount)
  const noScf = Math.max(0, reportedCount - scfReportedCount)
  const noNa = Math.max(0, reportedCount - naReportedCount)

  const totalRev = soa.totalRev ?? null
  const totalExp = soa.totalExp ?? null
  const netChange =
    soa.netChange ?? (totalRev != null && totalExp != null ? totalRev - totalExp : null)

  const noneReported = reportedCount === 0

  const soaRows = [...lineRows(soa, SOA_REVENUE), ...lineRows(soa, SOA_EXPENSE), ...lineRows(soa, ['netChange'])]
  const sfpRows = [...lineRows(sfp, SFP_ASSETS), ...lineRows(sfp, SFP_LIAB), ...lineRows(sfp, SFP_NA)]
  const scfRows = [
    ...lineRows(scf, SCF_OPERATING),
    ...lineRows(scf, SCF_INVESTING),
    ...lineRows(scf, SCF_FINANCING),
    ...lineRows(scf, SCF_NET),
    ...lineRows(scf, SCF_CASH),
  ]
  const naRows = [...lineRows(netAssets, NA_ROLL), ...lineRows(netAssets, NA_SPLIT)]
  const scfEmpty = scfReportedCount === 0
  const naEmpty = naReportedCount === 0

  return (
    <div>
      {/* Coverage + the consolidated headline — never let the totals look complete
          while a school is missing a statement. Four independent denominators, so
          partial SFP/SCF/NA coverage is surfaced distinctly. */}
      <Section
        label="Consolidated"
        aside={<span className="italic">Advisory consolidation — straight sum, pre-elimination.</span>}
      >
        <p className="text-small font-semibold text-ink">
          {reportedCount} of {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} reported
        </p>
        {(noSfp > 0 || noScf > 0 || noNa > 0) && (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink2">
            {noSfp > 0 && (
              <span>
                <span className="font-semibold text-ink">{noSfp}</span> {noSfp === 1 ? 'has' : 'have'} no balance sheet (SFP)
              </span>
            )}
            {noScf > 0 && (
              <span>
                <span className="font-semibold text-ink">{noScf}</span> {noScf === 1 ? 'has' : 'have'} no cash-flow statement
              </span>
            )}
            {noNa > 0 && (
              <span>
                <span className="font-semibold text-ink">{noNa}</span> {noNa === 1 ? 'has' : 'have'} no net-assets statement
              </span>
            )}
          </div>
        )}
        <StatStrip cols={3} className="mt-2">
          <Stat label="Consolidated revenue" value={totalRev == null ? null : fmt(totalRev)} />
          <Stat label="Consolidated expense" value={totalExp == null ? null : fmt(totalExp)} />
          <Stat
            label="Change in net assets"
            value={netChange == null ? null : fmt(netChange)}
            status={netChange == null ? undefined : !netChange ? 'neutral' : netChange > 0 ? 'good' : 'risk'}
          />
        </StatStrip>
      </Section>

      {/* Per-school summary */}
      <Section label="Schools in your organization">
        <DataTable
          columns={SCHOOL_COLUMNS}
          rows={schools}
          rowKey="schoolId"
          markOf={(r) => (r.reported ? 'good' : 'neutral')}
          empty="No schools found for your organization."
          caption="Schools in your organization"
        />
        {/* Not-reported note — totals are never silently understated. */}
        {notReported.length > 0 && (
          <p className="sec-note">
            <span className="font-semibold text-ink">Not yet reported:</span>{' '}
            {notReported.map((n) => n.name).join(', ')}. These schools are excluded from the consolidated
            totals above.
          </p>
        )}
      </Section>

      {/* Consolidated statements */}
      {noneReported ? (
        <div className="b2-note mt-8">
          <p>No statements reported for this fiscal year yet.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          <StatementTable title="Consolidated Statement of Activities" rows={soaRows} />
          <StatementTable title="Consolidated Statement of Financial Position" rows={sfpRows} />
          <StatementTable
            title="Consolidated Statement of Cash Flows"
            rows={scfRows}
            emptyText={
              scfEmpty
                ? 'No cash-flow statements reported — a cash-flow statement needs audited beginning balances.'
                : undefined
            }
          />
          <StatementTable
            title="Consolidated Statement of Changes in Net Assets"
            rows={naRows}
            emptyText={naEmpty ? 'No changes-in-net-assets statements reported for this fiscal year yet.' : undefined}
          />
        </div>
      )}
    </div>
  )
}

// Module-scope helper component (NOT defined inside render — React-Compiler safe).
// A statement on the ground: a Section rule, then a `.dt` sheet — plain lines,
// subtotal/total lines on the 2px rule in ink weight, money right-aligned.
function StatementTable({ title, rows, emptyText }) {
  return (
    <Section label={title} className="!mt-0 min-w-0">
      <div className="dt-wrap">
        <table className="dt">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col" className="dt-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="dt-empty">
                <td colSpan={2}>{emptyText || 'No data yet.'}</td>
              </tr>
            )}
            {rows.map((r) =>
              r.emphasis ? (
                <tr key={r.key} className="dt-section-total">
                  <td className="text-[11px] uppercase tracking-[0.06em]">{labelFor(r.key)}</td>
                  <td className="dt-num">{fmt(r.value)}</td>
                </tr>
              ) : (
                <tr key={r.key}>
                  <td>{labelFor(r.key)}</td>
                  <td className="dt-num">{fmt(r.value)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
