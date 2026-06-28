// Budget vs. actual — a driver-aware budget BUILDER, not a blank column. Each
// line picks a method (Manual / Copy last year / Grow prior by % / Trend / —for
// tuition— enrollment × per-student), resolved against real prior-year actuals
// and operational drivers from the budget-context endpoint. "Build from history"
// fills the whole budget in one click. Presentation: RAG variance chips, inline
// mini-bars, and a Budget→Actual bridge. Resolved amounts + method metadata
// autosave into the period_budgets `lines` JSON (no schema change).
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Scale, Wand2 } from 'lucide-react'
import { useBudget, useBudgetContext } from '../../hooks/useAnalytics.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { fmtDollar } from '../../lib/format.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'
import BudgetBridge from './BudgetBridge.jsx'

const parseNum = (s) => {
  const t = String(s ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const round2 = (n) => Math.round(n * 100) / 100
const variancePct = (v, bud) =>
  bud ? `${v >= 0 ? '+' : '−'}${Math.abs((v / bud) * 100).toFixed(1)}%` : '—'

const DEFAULT_PLAN = { method: 'manual', value: '' }
const getPlan = (state, key) => state[key] ?? DEFAULT_PLAN

// Build the plan map from a saved budget (amounts + stored method metadata).
const buildPlans = (amounts, methods) => {
  const out = {}
  const keys = new Set([...Object.keys(amounts || {}), ...Object.keys(methods || {})])
  for (const k of keys) {
    out[k] = methods?.[k]
      ? { ...methods[k] }
      : { method: 'manual', value: amounts?.[k] != null ? String(amounts[k]) : '' }
  }
  return out
}

// CAGR projection from history points strictly before the active period.
const trendProject = (history, kind, key, activeEnd) => {
  const pts = (history || [])
    .filter((h) => h.periodEndDate < activeEnd && Number.isFinite(h?.[kind]?.[key]))
    .map((h) => h[kind][key])
  if (pts.length < 2) return pts.length === 1 ? pts[0] : null
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (first <= 0) return last
  const cagr = Math.pow(last / first, 1 / (pts.length - 1)) - 1
  return last * (1 + cagr)
}

// Resolve a line's budgeted amount from its plan + context. Null when the inputs
// a method needs are missing (no prior actual, blank field, etc.).
const resolveLine = (plan, kind, key, ctx) => {
  const base = ctx?.prior?.[kind]?.[key]
  switch (plan.method) {
    case 'manual': {
      const n = parseNum(plan.value)
      return n != null && !Number.isNaN(n) ? n : null
    }
    case 'copy':
      return Number.isFinite(base) ? base : null
    case 'grow': {
      const p = parseNum(plan.pct)
      if (!Number.isFinite(base) || p == null || Number.isNaN(p)) return null
      return base * (1 + p / 100)
    }
    case 'trend':
      return ctx ? trendProject(ctx.history, kind, key, ctx.periodEndDate) : null
    case 'driver': {
      const e = parseNum(plan.enrollment)
      const ps = parseNum(plan.perStudent)
      if (e == null || ps == null || Number.isNaN(e) || Number.isNaN(ps)) return null
      return e * ps
    }
    default:
      return null
  }
}

// RAG color for a variance: favorable=green; small miss=amber; big miss=red.
const ragColor = (favorable, magPct) =>
  favorable == null ? '#8a93a6' : favorable ? '#1b7a4b' : magPct > 10 ? '#c0392b' : '#b8860b'

export default function BudgetVsActual({ schoolId, periodId, canEdit, metrics }) {
  const reduce = useReducedMotion()
  const { budget, save } = useBudget(schoolId, periodId)
  const { context: ctx, loading: ctxLoading } = useBudgetContext(schoolId, periodId)

  const [revPlan, setRevPlan] = useState({})
  const [expPlan, setExpPlan] = useState({})
  const [buildPct, setBuildPct] = useState('3')

  // Sync plans from the saved row on school/period change (render-time, matches
  // the codebase's established budget-sync pattern).
  const syncKey = `${schoolId}:${periodId}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (budget && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    const L = budget.lines || {}
    const m = L.methods || {}
    setRevPlan(buildPlans(L.revenue, m.revenue))
    setExpPlan(buildPlans(L.expense, m.expense))
  }

  const metric = (k) => (metrics ?? []).find((x) => x.key === k)
  const revLines = metric('revenue_mix')?.components ?? []
  const expLines = metric('expense_mix')?.components ?? []
  const revM = metric('revenue_mix')
  const expM = metric('expense_mix')
  const hasLines = revLines.length > 0 || expLines.length > 0
  const actRevTotal = revM?.available ? revM.value : null
  const actExpTotal = expM?.available ? expM.value : null

  const resolveFor = (kind, key) =>
    resolveLine(getPlan(kind === 'revenue' ? revPlan : expPlan, key), kind, key, ctx)

  const budRevTotal = revLines.reduce((a, c) => a + (resolveFor('revenue', c.key) ?? 0), 0)
  const budExpTotal = expLines.reduce((a, c) => a + (resolveFor('expense', c.key) ?? 0), 0)

  // Persisted shape: resolved amounts + per-line method metadata.
  const buildLines = () => {
    const revenue = {}
    const expense = {}
    const methods = { revenue: {}, expense: {} }
    for (const c of revLines) {
      const plan = getPlan(revPlan, c.key)
      const amt = resolveLine(plan, 'revenue', c.key, ctx)
      if (amt != null) revenue[c.key] = round2(amt)
      if (plan.method !== 'manual' || amt != null) methods.revenue[c.key] = plan
    }
    for (const c of expLines) {
      const plan = getPlan(expPlan, c.key)
      const amt = resolveLine(plan, 'expense', c.key, ctx)
      if (amt != null) expense[c.key] = round2(amt)
      if (plan.method !== 'manual' || amt != null) methods.expense[c.key] = plan
    }
    return { revenue, expense, methods }
  }

  // Dirty = built lines differ from saved (amounts rounded; plans compared raw).
  const roundMap = (m) => {
    const o = {}
    for (const [k, v] of Object.entries(m || {})) if (Number.isFinite(Number(v))) o[k] = round2(Number(v))
    return o
  }
  const sigOf = (lines) =>
    JSON.stringify({
      revenue: roundMap(lines?.revenue),
      expense: roundMap(lines?.expense),
      methods: lines?.methods ?? {},
    })
  const dirty =
    canEdit && budget != null && !ctxLoading && sigOf(buildLines()) !== sigOf(budget.lines || {})

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit && !ctxLoading,
    dirty,
    signal: JSON.stringify([revPlan, expPlan]),
    delay: 1000,
    save: async () => {
      await save({ lines: buildLines() })
    },
  })

  // ── Plan editing ────────────────────────────────────────────────────────────
  const setPlan = (kind, key, patch) => {
    const setter = kind === 'revenue' ? setRevPlan : setExpPlan
    setter((p) => ({ ...p, [key]: { ...getPlan(p, key), ...patch } }))
  }
  const onMethod = (kind, key, method) => {
    // Seed sensible defaults when switching into a parametric method.
    const patch = { method }
    if (method === 'grow' && getPlan(kind === 'revenue' ? revPlan : expPlan, key).pct == null) {
      patch.pct = buildPct
    }
    if (method === 'driver') {
      const d = ctx?.drivers
      patch.enrollment = String(d?.baselineEnrollment ?? d?.current?.enrollment ?? d?.prior?.enrollment ?? '')
      patch.perStudent =
        d?.priorNetTuitionPerStudent != null ? String(round2(d.priorNetTuitionPerStudent)) : ''
    }
    setPlan(kind, key, patch)
  }

  const buildFromHistory = () => {
    const apply = (lines, kind) => {
      const out = {}
      for (const c of lines) {
        const base = ctx?.prior?.[kind]?.[c.key]
        if (kind === 'revenue' && c.key === 'tuition' && ctx?.drivers?.priorNetTuitionPerStudent != null) {
          out[c.key] = {
            method: 'driver',
            enrollment: String(
              ctx.drivers.baselineEnrollment ?? ctx.drivers.current?.enrollment ?? ctx.drivers.prior?.enrollment ?? '',
            ),
            perStudent: String(round2(ctx.drivers.priorNetTuitionPerStudent)),
          }
        } else if (Number.isFinite(base)) {
          out[c.key] = { method: 'grow', pct: buildPct }
        } else {
          out[c.key] = { method: 'manual', value: '' }
        }
      }
      return out
    }
    setRevPlan(apply(revLines, 'revenue'))
    setExpPlan(apply(expLines, 'expense'))
  }

  // Methods available for a line given the data we have.
  const methodsFor = (kind, key) => {
    const opts = [{ v: 'manual', t: 'Manual' }]
    const hasBase = Number.isFinite(ctx?.prior?.[kind]?.[key])
    if (hasBase) opts.push({ v: 'copy', t: 'Copy last yr' }, { v: 'grow', t: 'Grow prior %' })
    const trendPts = (ctx?.history || []).filter(
      (h) => h.periodEndDate < ctx?.periodEndDate && Number.isFinite(h?.[kind]?.[key]),
    ).length
    if (trendPts >= 2) opts.push({ v: 'trend', t: 'Trend (CAGR)' })
    if (kind === 'revenue' && key === 'tuition') opts.push({ v: 'driver', t: 'Enrollment ×' })
    return opts
  }

  const selectCls =
    'rounded border border-border bg-white px-1.5 py-1 text-[13px] text-ink outline-none focus:border-gold disabled:bg-navy/[0.04]'
  const numCls =
    'w-20 rounded border border-border bg-white px-1.5 py-1 text-right text-[14px] tabular-nums text-ink outline-none focus:border-gold disabled:bg-navy/[0.04]'

  // The method-specific control(s) shown in the Budget cell.
  const planControl = (kind, key, plan) => {
    if (!canEdit) return null
    if (plan.method === 'manual')
      return (
        <input
          className={numCls + ' w-28'}
          inputMode="decimal"
          value={plan.value ?? ''}
          onChange={(e) => setPlan(kind, key, { value: sanitizeDecimal(e.target.value, { allowNegative: true }) })}
          placeholder="—"
        />
      )
    if (plan.method === 'grow')
      return (
        <span className="inline-flex items-center gap-1">
          <input
            className="w-14 rounded border border-border bg-white px-1.5 py-1 text-right text-[14px] tabular-nums outline-none focus:border-gold"
            inputMode="decimal"
            value={plan.pct ?? ''}
            onChange={(e) => setPlan(kind, key, { pct: sanitizeDecimal(e.target.value, { allowNegative: true }) })}
            placeholder="0"
          />
          <span className="text-[13px] text-muted">%</span>
        </span>
      )
    if (plan.method === 'driver')
      return (
        <span className="inline-flex items-center gap-1">
          <input
            className="w-16 rounded border border-border bg-white px-1.5 py-1 text-right text-[14px] tabular-nums outline-none focus:border-gold"
            inputMode="decimal"
            value={plan.enrollment ?? ''}
            onChange={(e) => setPlan(kind, key, { enrollment: sanitizeDecimal(e.target.value) })}
            placeholder="students"
            title="Projected enrollment"
          />
          <span className="text-[13px] text-muted">×</span>
          <input
            className="w-20 rounded border border-border bg-white px-1.5 py-1 text-right text-[14px] tabular-nums outline-none focus:border-gold"
            inputMode="decimal"
            value={plan.perStudent ?? ''}
            onChange={(e) => setPlan(kind, key, { perStudent: sanitizeDecimal(e.target.value) })}
            placeholder="$/student"
            title="Net tuition per student"
          />
        </span>
      )
    // copy / trend — no inputs; value is derived.
    return <span className="text-[13px] italic text-muted">auto</span>
  }

  const renderLine = ({ kind, key, label, act, favHigher }) => {
    const plan = getPlan(kind === 'revenue' ? revPlan : expPlan, key)
    const bud = resolveLine(plan, kind, key, ctx)
    const variance = bud != null && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const color = ragColor(favorable, magPct)
    const scale = Math.max(bud ?? 0, act ?? 0, 1)
    return (
      <tr key={`${kind}-${key}`} className="border-b border-rule/40 align-middle">
        <td className="py-1.5 pr-2">
          <div className="text-ink">{label}</div>
          {canEdit && (
            <select
              className={selectCls + ' mt-1'}
              value={plan.method}
              onChange={(e) => onMethod(kind, key, e.target.value)}
            >
              {methodsFor(kind, key).map((o) => (
                <option key={o.v} value={o.v}>
                  {o.t}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="px-2 py-1.5 text-right">{planControl(kind, key, plan)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-muted">
          {bud != null ? fmtDollar(bud) : '—'}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-navy">
          {act != null ? fmtDollar(act) : '—'}
          {/* mini dual bar: budget (muted) vs actual (navy) */}
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
        <td className="py-1.5 pr-2 text-navy" colSpan={2}>
          {label}
        </td>
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
      const bud = resolveFor('revenue', c.key)
      if (bud != null && c.value != null) rows.push({ label: c.label, bud, act: c.value, favHigher: true })
    }
    for (const c of expLines) {
      const bud = resolveFor('expense', c.key)
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
  const showBridge =
    actRevTotal != null && actExpTotal != null && (budRevTotal > 0 || budExpTotal > 0)

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-vital p-3 sm:p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <Scale size={18} />
          </span>
          <div>
            <h3 className="font-serif text-lg font-semibold text-navy">Budget vs. actual</h3>
            <p className="text-[14px] text-muted">
              {canEdit
                ? 'Build each line from history — actuals come from your statements.'
                : 'Budget vs. actual for this period.'}
            </p>
          </div>
        </div>
        {canEdit && hasLines && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-1.5 py-1 text-[13px] text-muted">
              <input
                className="w-9 bg-transparent text-right tabular-nums text-ink outline-none"
                inputMode="decimal"
                value={buildPct}
                onChange={(e) => setBuildPct(sanitizeDecimal(e.target.value, { allowNegative: true }))}
                aria-label="Growth assumption percent"
              />
              %
            </span>
            <button
              type="button"
              onClick={buildFromHistory}
              disabled={!ctx?.prior}
              title={ctx?.prior ? `Pre-fill from ${ctx.prior.label}` : 'No prior-year actuals yet'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[14px] font-semibold text-navy transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Wand2 size={13} className="text-gold" />
              Build from history
            </button>
          </div>
        )}
      </div>

      {!hasLines ? (
        <p className="rounded-lg border border-dashed border-border bg-section px-4 py-6 text-center text-[15px] italic text-muted">
          Category budgeting unlocks once this period has generated statements (it needs the
          revenue &amp; expense breakdown).
        </p>
      ) : (
        <>
          {canEdit && ctx?.prior && (
            <p className="mb-2 text-[13px] text-muted">
              Methods build off <span className="font-semibold text-navy">{ctx.prior.label}</span>{' '}
              actuals
              {ctx.drivers?.priorNetTuitionPerStudent != null && ctx.drivers?.baselineEnrollment != null && (
                <>
                  {' '}· tuition driver ({ctx.drivers.baselineLabel}):{' '}
                  {ctx.drivers.baselineEnrollment.toLocaleString('en-US')} students ×{' '}
                  {fmtDollar(round2(ctx.drivers.priorNetTuitionPerStudent))}/student
                </>
              )}
              .
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-rule text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-2 text-left font-semibold">Line / method</th>
                  <th className="px-2 py-2 text-right font-semibold">Budget</th>
                  <th className="px-2 py-2 text-right font-semibold">$ </th>
                  <th className="px-2 py-2 text-right font-semibold">Actual</th>
                  <th className="py-2 pl-2 text-right font-semibold">Var %</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="pt-2 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
                    Revenue
                  </td>
                </tr>
                {revLines.map((c) =>
                  renderLine({ kind: 'revenue', key: c.key, label: c.label, act: c.value, favHigher: true }),
                )}
                {totalRow('Total revenue', budRevTotal, actRevTotal, true)}

                <tr>
                  <td colSpan={5} className="pt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
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

          {err && (
            <div className="mt-3">
              <FormError>{err}</FormError>
            </div>
          )}
          {canEdit && (
            <AutosaveBar saving={saving} dirty={dirty} error={!!err} onSaveNow={saveNow} className="mt-3" />
          )}
        </>
      )}
    </motion.div>
  )
}
