// Budget vs. actual — a READ-ONLY comparison. Budget figures come straight from
// the period's SAVED budget (set up in the Data hub — Budget card); actuals come
// from the generated statements (revenue_mix / expense_mix metrics). Per-line and
// total variance with RAG chips, inline mini dual-bars, a Budget→Actual bridge,
// and auto-commentary on the biggest misses. No editing here — budget INPUT lives
// on /data, so this tab always reflects the budget automatically.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Scale, Wallet } from 'lucide-react'
import { useBudget } from '../../hooks/useAnalytics.js'
import { fmtDollar } from '../../lib/format.js'
import BudgetBridge from './BudgetBridge.jsx'

const variancePct = (v, bud) =>
  bud ? `${v >= 0 ? '+' : '−'}${Math.abs((v / bud) * 100).toFixed(1)}%` : '—'

// RAG color for a variance: favorable=green; small miss=amber; big miss=red.
const ragColor = (favorable, magPct) =>
  favorable == null ? '#8a93a6' : favorable ? '#1b7a4b' : magPct > 10 ? '#c0392b' : '#b8860b'

// A line's budgeted amount, read directly from the saved budget JSON (null if unset).
const budOf = (lines, kind, key) => {
  const v = lines?.[kind]?.[key]
  return Number.isFinite(Number(v)) ? Number(v) : null
}

export default function BudgetVsActual({ metrics, ...props }) {
  const reduce = useReducedMotion()
  const { budget } = useBudget(props.schoolId, props.periodId)
  const lines = budget?.lines || {}

  const metric = (k) => (metrics ?? []).find((x) => x.key === k)
  const revLines = metric('revenue_mix')?.components ?? []
  const expLines = metric('expense_mix')?.components ?? []
  const revM = metric('revenue_mix')
  const expM = metric('expense_mix')
  const hasLines = revLines.length > 0 || expLines.length > 0
  const actRevTotal = revM?.available ? revM.value : null
  const actExpTotal = expM?.available ? expM.value : null

  const budRevTotal = revLines.reduce((a, c) => a + (budOf(lines, 'revenue', c.key) ?? 0), 0)
  const budExpTotal = expLines.reduce((a, c) => a + (budOf(lines, 'expense', c.key) ?? 0), 0)
  const noBudget = budRevTotal === 0 && budExpTotal === 0

  const renderLine = ({ kind, key, label, act, favHigher }) => {
    const bud = budOf(lines, kind, key)
    const variance = bud != null && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const color = ragColor(favorable, magPct)
    const scale = Math.max(bud ?? 0, act ?? 0, 1)
    return (
      <tr key={`${kind}-${key}`} className="border-b border-rule/40 align-middle">
        <td className="py-1.5 pr-2">
          <div className="text-ink">{label}</div>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-muted">
          {bud != null ? fmtDollar(bud) : '—'}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-navy">
          {act != null ? fmtDollar(act) : '—'}
          {/* mini dual bar: budget (gold) vs actual (navy) */}
          {(bud != null || act != null) && (
            <span className="mt-1 block space-y-0.5">
              <span className="block h-1 rounded-full bg-gold/40" style={{ width: `${((bud ?? 0) / scale) * 100}%` }} />
              <span className="block h-1 rounded-full bg-navy/70" style={{ width: `${((act ?? 0) / scale) * 100}%` }} />
            </span>
          )}
        </td>
        <td className="py-1.5 pl-2 text-right">
          {variance != null ? (
            <span className="inline-flex items-center justify-end gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="tabular-nums text-[14px]" style={{ color }}>
                {variancePct(variance, bud)}
              </span>
            </span>
          ) : (
            <span className="text-[14px] text-muted">—</span>
          )}
        </td>
      </tr>
    )
  }

  const totalRow = (label, bud, act, favHigher) => {
    const variance = bud != null && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const color = ragColor(favorable, magPct)
    return (
      <tr key={label} className="border-t border-rule font-semibold">
        <td className="py-1.5 pr-2 text-navy">{label}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-navy">{bud != null ? fmtDollar(bud) : '—'}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-navy">{act != null ? fmtDollar(act) : '—'}</td>
        <td className="py-1.5 pl-2 text-right tabular-nums text-[14px]" style={{ color }}>
          {variance != null ? `${variance >= 0 ? '+' : '−'}${fmtDollar(Math.abs(variance))}` : '—'}
        </td>
      </tr>
    )
  }

  // Auto-commentary: the largest material misses (|var%| > 10, both sides known).
  const commentary = () => {
    const rows = []
    for (const c of revLines) {
      const bud = budOf(lines, 'revenue', c.key)
      if (bud != null && c.value != null) rows.push({ label: c.label, bud, act: c.value, favHigher: true })
    }
    for (const c of expLines) {
      const bud = budOf(lines, 'expense', c.key)
      if (bud != null && c.value != null) rows.push({ label: c.label, bud, act: c.value, favHigher: false })
    }
    return rows
      .map((r) => {
        const v = r.act - r.bud
        const pct = r.bud ? (v / r.bud) * 100 : 0
        const favorable = r.favHigher ? v >= 0 : v <= 0
        return { ...r, v, pct, favorable }
      })
      .filter((r) => Math.abs(r.pct) > 10 && Math.abs(r.v) > 0)
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
      .slice(0, 3)
  }

  const netBud = budRevTotal - budExpTotal
  const netAct = actRevTotal != null && actExpTotal != null ? actRevTotal - actExpTotal : null
  const notes = commentary()
  const showBridge = actRevTotal != null && actExpTotal != null && (budRevTotal > 0 || budExpTotal > 0)

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-vital p-3 sm:p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <Scale size={18} />
        </span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Budget vs. actual</h3>
          <p className="text-[14px] text-muted">
            Budget comes from your saved budget; actuals come from your statements.
          </p>
        </div>
      </div>

      {!hasLines ? (
        <p className="rounded-lg border border-dashed border-border bg-section px-4 py-6 text-center text-[15px] italic text-muted">
          Category budgeting unlocks once this period has generated statements (it needs the
          revenue &amp; expense breakdown).
        </p>
      ) : noBudget ? (
        <div className="rounded-lg border border-dashed border-gold/40 bg-gold/[0.04] px-4 py-7 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Wallet size={20} />
          </span>
          <p className="text-[15px] text-navy">No budget set up for this period yet.</p>
          <Link
            to="/data"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
          >
            Set up your budget in the Data hub
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-rule text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-2 text-left font-semibold">Line</th>
                  <th className="px-2 py-2 text-right font-semibold">Budget</th>
                  <th className="px-2 py-2 text-right font-semibold">Actual</th>
                  <th className="py-2 pl-2 text-right font-semibold">Var %</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} className="pt-2 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
                    Revenue
                  </td>
                </tr>
                {revLines.map((c) =>
                  renderLine({ kind: 'revenue', key: c.key, label: c.label, act: c.value, favHigher: true }),
                )}
                {totalRow('Total revenue', budRevTotal, actRevTotal, true)}

                <tr>
                  <td colSpan={4} className="pt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
                    Expenses
                  </td>
                </tr>
                {expLines.map((c) =>
                  renderLine({ kind: 'expense', key: c.key, label: c.label, act: c.value, favHigher: false }),
                )}
                {totalRow('Total expenses', budExpTotal, actExpTotal, false)}
                {totalRow('Net surplus / (deficit)', netBud, netAct, true)}
              </tbody>
            </table>
          </div>

          {showBridge && (
            <div className="mt-4">
              <BudgetBridge
                budgetNet={netBud}
                actualNet={netAct}
                revVar={(actRevTotal ?? 0) - budRevTotal}
                expVar={(actExpTotal ?? 0) - budExpTotal}
              />
            </div>
          )}

          {notes.length > 0 && (
            <div className="mt-3 rounded-lg border border-gold/25 bg-gold/[0.04] p-3">
              <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
                What moved vs. budget
              </p>
              <ul className="space-y-1">
                {notes.map((n) => (
                  <li key={n.label} className="flex items-start gap-1.5 text-[14.5px] text-ink">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ragColor(n.favorable, Math.abs(n.pct)) }}
                    />
                    <span>
                      <span className="font-semibold text-navy">{n.label}</span> came in{' '}
                      {fmtDollar(Math.abs(n.v))} ({Math.abs(n.pct).toFixed(0)}%){' '}
                      {n.favHigher
                        ? n.v >= 0
                          ? 'above'
                          : 'below'
                        : n.v >= 0
                          ? 'over'
                          : 'under'}{' '}
                      budget{n.favorable ? '' : ' — worth a look'}.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
