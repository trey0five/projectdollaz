// Budget vs. actual — a READ-ONLY comparison. Budget figures come straight from
// the period's SAVED budget (BudgetSetup — the Budget tab and the Finance
// Add-data wizard); actuals come from the generated statements (revenue_mix /
// expense_mix metrics). Per-line and total variance with RAG chips, inline mini
// dual-bars, a Budget→Actual bridge, and auto-commentary on the biggest misses.
// No editing here — the optional `onSetUp` prop lets the host flip to its own
// setup surface (BudgetPage passes its Budget tab); without it, the no-budget
// CTA falls back to a Link to /budget.
import { motion, useReducedMotion } from 'framer-motion'
import { Wallet } from 'lucide-react'
import { useBudget } from '../../hooks/useAnalytics.js'
import { fmtDollar } from '../../lib/format.js'
import BudgetBridge from './BudgetBridge.jsx'
import { Section, Panel, Button } from '../ui/surface/index.js'

// Premium UI P3: a `.dt` table on the ground under a Section rule (Line ·
// Budget · Actual · Var %, numerics right-aligned tabular; section heading rows
// and `.dt-foot`-weight total rows), the variance as a 2px semantic mark + ink
// text, the no-budget CTA inside the one raised surface (a Panel: it is an
// action). The mini dual bars are gone — a chart in a cell is noise next to the
// BudgetBridge below, which already draws the same comparison.

const variancePct = (v, bud) =>
  bud ? `${v >= 0 ? '+' : '−'}${Math.abs((v / bud) * 100).toFixed(1)}%` : '—'

// RAG tone for a variance: favorable=good; small miss=watch; big miss=risk.
const ragTone = (favorable, magPct) =>
  favorable == null ? 'neutral' : favorable ? 'good' : magPct > 10 ? 'risk' : 'watch'

// A line's budgeted amount, read directly from the saved budget JSON (null if unset).
const budOf = (lines, kind, key) => {
  const v = lines?.[kind]?.[key]
  return Number.isFinite(Number(v)) ? Number(v) : null
}

export default function BudgetVsActual({ metrics, onSetUp = null, ...props }) {
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
    // A variance needs a REAL budget on the line: a $0 budget has nothing to
    // compare against, so the row prints "—" and carries no mark at all.
    const variance = bud != null && bud > 0 && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const tone = ragTone(favorable, magPct)
    return (
      <tr key={`${kind}-${key}`}>
        <td className="text-ink">{label}</td>
        <td className="dt-num text-ink2">{bud != null ? fmtDollar(bud) : '—'}</td>
        <td className="dt-num text-ink">{act != null ? fmtDollar(act) : '—'}</td>
        <td className="dt-num">
          {variance != null ? (
            <span className="inline-flex items-center justify-end gap-1.5">
              <i className={`mark tone-${tone}`} aria-hidden="true" />
              <span className="tabular-nums text-ink">{variancePct(variance, bud)}</span>
            </span>
          ) : (
            <span className="text-ink2">—</span>
          )}
        </td>
      </tr>
    )
  }

  const totalRow = (label, bud, act, favHigher) => {
    const variance = bud != null && bud !== 0 && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const tone = ragTone(favorable, magPct)
    return (
      <tr key={label} className="dt-section-total">
        <td className="text-ink">{label}</td>
        <td className="dt-num text-ink">{bud != null ? fmtDollar(bud) : '—'}</td>
        <td className="dt-num text-ink">{act != null ? fmtDollar(act) : '—'}</td>
        <td className="dt-num">
          {variance != null ? (
            <span className="inline-flex items-center justify-end gap-1.5">
              <i className={`mark tone-${tone}`} aria-hidden="true" />
              <span className="tabular-nums text-ink">{`${variance >= 0 ? '+' : '−'}${fmtDollar(Math.abs(variance))}`}</span>
            </span>
          ) : (
            <span className="text-ink2">—</span>
          )}
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
    <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Section label="Budget vs. actual" aside="budget from your saved budget · actuals from your statements" className="!mt-0">
      {!hasLines ? (
        <p className="py-6 text-center text-body italic text-ink2">
          Category budgeting unlocks once this period has generated statements (it needs the
          revenue &amp; expense breakdown).
        </p>
      ) : noBudget ? (
        <Panel className="text-center">
          <span className="mx-auto mb-2 inline-flex text-navy-soft" aria-hidden="true">
            <Wallet size={20} />
          </span>
          <p className="text-body text-ink">No budget set up for this period yet.</p>
          {onSetUp ? (
            <Button variant="primary" onClick={onSetUp} className="mt-3">
              Set up your budget
            </Button>
          ) : (
            <Button variant="primary" to="/budget" className="mt-3">
              Set up your budget
            </Button>
          )}
        </Panel>
      ) : (
        <>
          <div className="dt-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col" className="dt-num">Budget</th>
                  <th scope="col" className="dt-num">Actual</th>
                  <th scope="col" className="dt-num">Var %</th>
                </tr>
              </thead>
              <tbody>
                <tr className="dt-section">
                  <td colSpan={4} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                    Revenue
                  </td>
                </tr>
                {revLines.map((c) =>
                  renderLine({ kind: 'revenue', key: c.key, label: c.label, act: c.value, favHigher: true }),
                )}
                {totalRow('Total revenue', budRevTotal, actRevTotal, true)}

                <tr className="dt-section">
                  <td colSpan={4} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
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
            <div className="mt-6">
              <BudgetBridge
                budgetNet={netBud}
                actualNet={netAct}
                revVar={(actRevTotal ?? 0) - budRevTotal}
                expVar={(actExpTotal ?? 0) - budExpTotal}
              />
            </div>
          )}

          {notes.length > 0 && (
            <Section label="What moved vs. budget">
              <ul className="m-0 list-none p-0">
                {notes.map((n) => (
                  <li key={n.label} className="flex items-start gap-2 border-b border-hair py-2 text-small text-ink">
                    <i className={`mark mt-1 tone-${ragTone(n.favorable, Math.abs(n.pct))}`} aria-hidden="true" />
                    <span>
                      <span className="font-semibold text-ink">{n.label}</span> came in{' '}
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
            </Section>
          )}
        </>
      )}
      </Section>
    </motion.div>
  )
}
