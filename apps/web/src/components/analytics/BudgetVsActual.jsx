// Phase 3 (robust) — budget vs. actual by category. Budget each revenue/expense
// line (the revenue_mix / expense_mix breakdown components), with variance $ and
// %, subtotals, net surplus/(deficit), and a simple next-year forecast from a
// growth assumption. Budgets autosave into the period_budgets `lines` JSON.
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Scale } from 'lucide-react'
import { useBudget } from '../../hooks/useAnalytics.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { fmtDollar } from '../../lib/format.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'

const parseNum = (s) => {
  const t = String(s).trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const toStrMap = (m) => {
  const o = {}
  if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) o[k] = v == null ? '' : String(v)
  return o
}
const toNumMap = (draft) => {
  const o = {}
  for (const [k, v] of Object.entries(draft)) {
    const n = parseNum(v)
    if (n != null && !Number.isNaN(n)) o[k] = n
  }
  return o
}
const variancePct = (v, bud) => (bud ? `${v >= 0 ? '+' : '−'}${Math.abs((v / bud) * 100).toFixed(1)}%` : '—')

export default function BudgetVsActual({ schoolId, periodId, canEdit, metrics }) {
  const reduce = useReducedMotion()
  const { budget, save } = useBudget(schoolId, periodId)

  const [revDraft, setRevDraft] = useState({})
  const [expDraft, setExpDraft] = useState({})
  const [growth, setGrowth] = useState('')

  // Sync drafts from the saved row on school/period change (render-time).
  const syncKey = `${schoolId}:${periodId}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (budget && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    const L = budget.lines || {}
    setRevDraft(toStrMap(L.revenue))
    setExpDraft(toStrMap(L.expense))
    setGrowth(L.growthPct != null ? String(L.growthPct) : '')
  }

  const metric = (k) => (metrics ?? []).find((x) => x.key === k)
  const revM = metric('revenue_mix')
  const expM = metric('expense_mix')
  const revLines = revM?.components ?? []
  const expLines = expM?.components ?? []
  const hasLines = revLines.length > 0 || expLines.length > 0
  const actRevTotal = revM?.available ? revM.value : null
  const actExpTotal = expM?.available ? expM.value : null

  const budRevTotal = Object.values(toNumMap(revDraft)).reduce((a, b) => a + b, 0)
  const budExpTotal = Object.values(toNumMap(expDraft)).reduce((a, b) => a + b, 0)

  const buildLines = () => ({
    revenue: toNumMap(revDraft),
    expense: toNumMap(expDraft),
    ...(parseNum(growth) != null && !Number.isNaN(parseNum(growth))
      ? { growthPct: parseNum(growth) }
      : {}),
  })

  // Dirty vs. saved (compared as numeric maps so formatting can't loop autosave).
  const savedLines = budget?.lines || {}
  const sameMap = (a, b) => {
    const an = toNumMap(a)
    const bn = b && typeof b === 'object' ? b : {}
    const keys = new Set([...Object.keys(an), ...Object.keys(bn)])
    for (const k of keys) if (Math.round((an[k] ?? 0) * 100) !== Math.round((bn[k] ?? 0) * 100)) return false
    return true
  }
  const growthNum = parseNum(growth)
  const dirty =
    canEdit &&
    budget != null &&
    (!sameMap(revDraft, savedLines.revenue) ||
      !sameMap(expDraft, savedLines.expense) ||
      (growthNum ?? null) !== (savedLines.growthPct ?? null))

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: JSON.stringify([revDraft, expDraft, growth]),
    delay: 1000,
    save: async () => {
      await save({ lines: buildLines() })
    },
  })

  const inputCls =
    'w-28 rounded border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04]'

  const renderRow = ({ rowKey, label, bud, act, favHigher, isTotal, budInput }) => {
    const variance = bud != null && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    return (
      <tr
        key={rowKey}
        className={isTotal ? 'border-t border-rule font-semibold' : 'border-b border-rule/40'}
      >
        <td className={`py-1.5 pr-2 ${isTotal ? 'text-navy' : 'text-ink'}`}>{label}</td>
        <td className="px-2 py-1.5 text-right">
          {budInput ?? (bud != null ? <span className="tabular-nums text-muted">{fmtDollar(bud)}</span> : '—')}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-navy">
          {act != null ? fmtDollar(act) : '—'}
        </td>
        <td
          className={`px-2 py-1.5 text-right tabular-nums ${
            favorable == null ? 'text-muted' : favorable ? 'text-[#7a5e00]' : 'text-danger'
          }`}
        >
          {variance != null ? fmtDollar(variance) : '—'}
        </td>
        <td
          className={`py-1.5 pl-2 text-right tabular-nums text-[12px] ${
            favorable == null ? 'text-muted' : favorable ? 'text-[#7a5e00]' : 'text-danger'
          }`}
        >
          {variance != null ? variancePct(variance, bud) : '—'}
        </td>
      </tr>
    )
  }

  const lineInput = (draft, setDraft, key) => (
    <input
      className={inputCls}
      inputMode="decimal"
      value={draft[key] ?? ''}
      disabled={!canEdit}
      onChange={(e) =>
        setDraft((p) => ({ ...p, [key]: sanitizeDecimal(e.target.value, { allowNegative: true }) }))
      }
      placeholder="—"
    />
  )

  // Forecast (next year) = actual × (1 + growth%).
  const g = growthNum != null && !Number.isNaN(growthNum) ? growthNum / 100 : null
  const projRev = actRevTotal != null && g != null ? actRevTotal * (1 + g) : null
  const projExp = actExpTotal != null && g != null ? actExpTotal * (1 + g) : null

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
              ? 'Budget each line — actuals come from your statements.'
              : 'Budget vs. actual for this period.'}
          </p>
        </div>
      </div>

      {!hasLines ? (
        <p className="rounded-lg border border-dashed border-border bg-section px-4 py-6 text-center text-[13px] italic text-muted">
          Category budgeting unlocks once this period has generated statements (it needs the
          revenue &amp; expense breakdown).
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-rule text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-2 text-left font-semibold"> </th>
                  <th className="px-2 py-2 text-right font-semibold">Budget</th>
                  <th className="px-2 py-2 text-right font-semibold">Actual</th>
                  <th className="px-2 py-2 text-right font-semibold">Var $</th>
                  <th className="py-2 pl-2 text-right font-semibold">Var %</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-gold">
                    Revenue
                  </td>
                </tr>
                {revLines.map((c) =>
                  renderRow({
                    rowKey: `r-${c.key}`,
                    label: c.label,
                    bud: parseNum(revDraft[c.key]),
                    act: c.value,
                    favHigher: true,
                    budInput: lineInput(revDraft, setRevDraft, c.key),
                  }),
                )}
                {renderRow({
                  rowKey: 'rev-total',
                  label: 'Total revenue',
                  bud: budRevTotal,
                  act: actRevTotal,
                  favHigher: true,
                  isTotal: true,
                })}

                <tr>
                  <td colSpan={5} className="pt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gold">
                    Expenses
                  </td>
                </tr>
                {expLines.map((c) =>
                  renderRow({
                    rowKey: `e-${c.key}`,
                    label: c.label,
                    bud: parseNum(expDraft[c.key]),
                    act: c.value,
                    favHigher: false,
                    budInput: lineInput(expDraft, setExpDraft, c.key),
                  }),
                )}
                {renderRow({
                  rowKey: 'exp-total',
                  label: 'Total expenses',
                  bud: budExpTotal,
                  act: actExpTotal,
                  favHigher: false,
                  isTotal: true,
                })}

                {renderRow({
                  rowKey: 'net',
                  label: 'Net surplus / (deficit)',
                  bud: budRevTotal - budExpTotal,
                  act: actRevTotal != null && actExpTotal != null ? actRevTotal - actExpTotal : null,
                  favHigher: true,
                  isTotal: true,
                })}
              </tbody>
            </table>
          </div>

          {/* Forecast */}
          <div className="mt-4 rounded-lg border border-gold/25 bg-gold/[0.04] p-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-navy">Forecast (next year)</span>
              <span className="text-muted">at</span>
              <input
                className="w-16 rounded border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums outline-none focus:border-gold disabled:bg-navy/[0.04]"
                inputMode="decimal"
                value={growth}
                disabled={!canEdit}
                onChange={(e) => setGrowth(sanitizeDecimal(e.target.value, { allowNegative: true }))}
                placeholder="0"
              />
              <span className="text-muted">% growth on actuals</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Revenue</p>
                <p className="tabular-nums text-navy">{projRev != null ? fmtDollar(projRev) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Expenses</p>
                <p className="tabular-nums text-navy">{projExp != null ? fmtDollar(projExp) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Net</p>
                <p className="tabular-nums text-navy">
                  {projRev != null && projExp != null ? fmtDollar(projRev - projExp) : '—'}
                </p>
              </div>
            </div>
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
        </>
      )}
    </motion.div>
  )
}
