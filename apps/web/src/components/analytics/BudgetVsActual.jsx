// Phase 3 — budget vs. actual. Owner/accountant enter budgeted revenue + expenses
// (autosaved); actuals come from the period's metrics (revenue_mix / expense_mix
// = total revenue / expenses), so no snapshot re-fetch. Variance is favourable
// when actual revenue ≥ budget and actual expenses ≤ budget.
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Scale } from 'lucide-react'
import { useBudget } from '../../hooks/useAnalytics.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { fmtDollar } from '../../lib/format.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'

const toStr = (v) => (v == null ? '' : String(v))
const labelCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted'
const inputCls =
  'w-full rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-ink outline-none transition-all focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

const numEq = (a, b) => {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100)
}
const parseNum = (s) => {
  const t = String(s).trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

export default function BudgetVsActual({ schoolId, periodId, canEdit, metrics }) {
  const reduce = useReducedMotion()
  const { budget, save } = useBudget(schoolId, periodId)

  const [rev, setRev] = useState('')
  const [exp, setExp] = useState('')

  // Sync from the saved row when school/period changes (render-time).
  const syncKey = `${schoolId}:${periodId}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (budget && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    setRev(toStr(budget.totalRevenue))
    setExp(toStr(budget.totalExpenses))
  }

  const revNum = parseNum(rev)
  const expNum = parseNum(exp)
  const invalid = [revNum, expNum].some(
    (v) => Number.isNaN(v) || (typeof v === 'number' && v < 0),
  )
  const dirty =
    canEdit &&
    !invalid &&
    budget != null &&
    (!numEq(revNum, budget.totalRevenue) || !numEq(expNum, budget.totalExpenses))

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: `${rev}|${exp}`,
    delay: 1000,
    save: async () => {
      await save({ totalRevenue: revNum, totalExpenses: expNum })
    },
  })

  // Actuals from the period's metrics.
  const metricVal = (key) => {
    const m = (metrics ?? []).find((x) => x.key === key)
    return m && m.available && m.value != null ? m.value : null
  }
  const actRev = metricVal('revenue_mix')
  const actExp = metricVal('expense_mix')
  const budRev = budget?.totalRevenue ?? null
  const budExp = budget?.totalExpenses ?? null

  const mkRow = (label, bud, act, favHigher) => {
    const variance = bud != null && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    return { label, bud, act, variance, favorable }
  }
  const rows = [
    mkRow('Revenue', budRev, actRev, true),
    mkRow('Expenses', budExp, actExp, false),
    mkRow(
      'Net surplus / (deficit)',
      budRev != null && budExp != null ? budRev - budExp : null,
      actRev != null && actExp != null ? actRev - actExp : null,
      true,
    ),
  ]
  const anyActual = actRev != null || actExp != null

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
          <p className="text-[12px] text-muted">
            {canEdit
              ? 'Enter the period budget — actuals come from your statements.'
              : 'Budget vs. actual for this period.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Budgeted revenue</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              className={`${inputCls} pl-7`}
              inputMode="decimal"
              value={rev}
              disabled={!canEdit}
              onChange={(e) => setRev(sanitizeDecimal(e.target.value))}
              placeholder="e.g. 10800000"
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Budgeted expenses</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              className={`${inputCls} pl-7`}
              inputMode="decimal"
              value={exp}
              disabled={!canEdit}
              onChange={(e) => setExp(sanitizeDecimal(e.target.value))}
              placeholder="e.g. 10400000"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-rule text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pr-3 text-left font-semibold"> </th>
              <th className="px-3 py-2 text-right font-semibold">Budget</th>
              <th className="px-3 py-2 text-right font-semibold">Actual</th>
              <th className="py-2 pl-3 text-right font-semibold">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-rule/50 last:border-0">
                <td className="py-2 pr-3 text-navy">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {r.bud != null ? fmtDollar(r.bud) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">
                  {r.act != null ? fmtDollar(r.act) : '—'}
                </td>
                <td
                  className={`py-2 pl-3 text-right tabular-nums ${
                    r.favorable == null ? 'text-muted' : r.favorable ? 'text-[#7a5e00]' : 'text-danger'
                  }`}
                >
                  {r.variance != null ? fmtDollar(r.variance) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!anyActual && (
          <p className="mt-2 text-[11px] italic text-muted">
            Actuals appear once this period has a generated statement snapshot.
          </p>
        )}
      </div>

      {err && <div className="mt-3"><FormError>{err}</FormError></div>}
      {canEdit && (
        <AutosaveBar
          saving={saving}
          dirty={dirty}
          error={!!err}
          onSaveNow={saveNow}
          className="mt-3"
        />
      )}
    </motion.div>
  )
}
