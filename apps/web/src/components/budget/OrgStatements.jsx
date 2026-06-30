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
import { motion } from 'framer-motion'
import { Building2, CheckCircle2, MinusCircle, Landmark, FileBarChart } from 'lucide-react'
import { fmt } from '../../lib/format.js'

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
}

// Subtotal/total rows render emphasized; everything else is a plain line.
const EMPHASIS = new Set([
  'totalRev', 'totalExp', 'netChange', 'totalCurrentA', 'totalAssets',
  'totalCurrL', 'totalLiab', 'totalNA', 'totalLiabNA',
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

export default function OrgStatements({ rollup, loading, error }) {
  if (loading) {
    return (
      <div className="card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">Consolidating your organization’s statements…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="card-soft border-dashed px-6 py-12 text-center">
        <p className="font-serif text-base italic text-muted">{error}</p>
      </div>
    )
  }
  if (!rollup) return null

  const schools = rollup.schools || []
  const consolidated = rollup.consolidated || {}
  const soa = consolidated.soa || {}
  const sfp = consolidated.sfp || {}
  const notReported = rollup.notReported || []
  const reportedCount = consolidated.reportedCount ?? schools.filter((s) => s.reported).length
  const schoolCount = consolidated.schoolCount ?? schools.length

  const totalRev = soa.totalRev ?? null
  const totalExp = soa.totalExp ?? null
  const netChange =
    soa.netChange ?? (totalRev != null && totalExp != null ? totalRev - totalExp : null)

  const noneReported = reportedCount === 0

  const summaryCard = (label, value, accent) => (
    <div key={label} className="card-vital p-4 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`mt-1 font-serif text-xl font-semibold ${accent || 'text-navy'}`}>
        {value == null ? '—' : fmt(value)}
      </div>
    </div>
  )

  const soaRows = [...lineRows(soa, SOA_REVENUE), ...lineRows(soa, SOA_EXPENSE), ...lineRows(soa, ['netChange'])]
  const sfpRows = [...lineRows(sfp, SFP_ASSETS), ...lineRows(sfp, SFP_LIAB), ...lineRows(sfp, SFP_NA)]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {/* Coverage banner — never let the totals look complete while a school is missing. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-5 py-3">
        <p className="text-[13px] font-semibold text-navy">
          {reportedCount} of {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} reported
        </p>
        <p className="text-[11px] italic text-muted">Advisory consolidation — straight sum, pre-elimination.</p>
      </div>

      {/* Consolidated summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryCard('Consolidated revenue', totalRev, 'text-emerald-700')}
        {summaryCard('Consolidated expense', totalExp, 'text-navy')}
        {summaryCard(
          'Change in net assets',
          netChange,
          netChange != null && netChange < 0 ? 'text-rose-600' : 'text-gold',
        )}
      </div>

      {/* Per-school summary */}
      <div className="card-soft overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <Building2 size={17} />
          </span>
          <h3 className="font-serif text-base font-semibold text-navy sm:text-lg">
            Schools in your organization
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">School</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Revenue</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Expense</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Net change</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Total assets</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Net assets</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center font-serif italic text-muted">
                    No schools found for your organization.
                  </td>
                </tr>
              )}
              {schools.map((s) => (
                <tr key={s.schoolId} className="border-t border-rule/50">
                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{s.soa ? fmt(s.soa.totalRev) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{s.soa ? fmt(s.soa.totalExp) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{s.soa ? fmt(s.soa.netChange) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{s.sfp ? fmt(s.sfp.totalAssets) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{s.sfp ? fmt(s.sfp.totalNA) : '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {s.reported ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                        <CheckCircle2 size={14} /> Reported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
                        <MinusCircle size={14} /> Not yet reported
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Not-reported callout — totals are never silently understated. */}
      {notReported.length > 0 && (
        <div className="rounded-2xl border border-dashed border-rule bg-cream/40 px-5 py-3">
          <p className="text-[12px] text-muted">
            <span className="font-semibold text-navy">Not yet reported:</span>{' '}
            {notReported.map((n) => n.name).join(', ')}. These schools are excluded from the consolidated totals above.
          </p>
        </div>
      )}

      {/* Consolidated statements */}
      {noneReported ? (
        <div className="card-soft border-dashed px-6 py-12 text-center">
          <p className="font-serif text-base italic text-muted">No statements reported for this fiscal year yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatementTable title="Consolidated Statement of Activities" icon={FileBarChart} rows={soaRows} />
          <StatementTable title="Consolidated Statement of Financial Position" icon={Landmark} rows={sfpRows} />
        </div>
      )}
    </motion.div>
  )
}

// Module-scope helper component (NOT defined inside render — React-Compiler safe).
function StatementTable({ title, icon, rows }) {
  const Icon = icon
  return (
    <div className="card-soft overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
          {Icon && <Icon size={16} />}
        </span>
        <h3 className="font-serif text-base font-semibold text-navy">{title}</h3>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center font-serif italic text-muted">
                No data yet.
              </td>
            </tr>
          )}
          {rows.map((r) =>
            r.emphasis ? (
              <tr key={r.key} className="border-t border-gold/50 bg-gold/5">
                <td className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-navy">{labelFor(r.key)}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-navy">{fmt(r.value)}</td>
              </tr>
            ) : (
              <tr key={r.key} className="border-t border-rule/50">
                <td className="px-4 py-2 text-ink">{labelFor(r.key)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink">{fmt(r.value)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
