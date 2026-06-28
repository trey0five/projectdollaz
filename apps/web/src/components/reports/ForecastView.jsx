// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY Forecast view for the Reports hub.
//
// This renders the SAVED fiscal-year-end forecast result for a period — purely a
// presentation of the precomputed server object (useForecast → forecast). There
// are NO inputs and NO save here: the forecast is ENTERED in the Data hub (/data,
// the single input surface) and only VIEWED here. The variance figures are read
// STRAIGHT off forecast.variance (server-stored, never recomputed); we only
// format. KPIs come from forecast.projected.kpis.
//
// React-Compiler safety: hooks at top level; the table rows are produced by
// MODULE-scope row helpers (mirroring ForecastWorkspace's ForecastRow), not
// nested component definitions; no setState-in-render/effect — this view is pure
// read.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, Clock } from 'lucide-react'
import {
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { useForecast } from '../../hooks/useAnalytics.js'

// ── Formatting helpers — copied VERBATIM from ForecastWorkspace (module-scope
// pure fns). They are not exported there, so we duplicate to keep this view a
// fully self-contained read-only surface.
const round2 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
// Forecast-vs-budget % (variance / |budget|). Null when budget is 0/absent.
function variancePct(variance, budget) {
  if (budget == null || budget === 0) return null
  return round2((variance / Math.abs(budget)) * 100)
}
// Spend-is-bad convention: revenue favorable when variance ≥ 0, expense ≤ 0.
function isFavorable(kind, variance) {
  return kind === 'revenue' ? variance >= 0 : variance <= 0
}
function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${Math.round(n).toLocaleString('en-US')}`
}
function signed(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const s = `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`
  return n < 0 ? `(${s})` : s
}
function pctText(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`
}
// Sum a category map over a key list.
function sumKeys(map, keys) {
  let t = 0
  for (const k of keys) t += Number(map?.[k]) || 0
  return t
}

// ── Read-only Forecast-vs-Budget row (module scope) — variance is STORED. ──────
function ForecastRow({ kind, label, forecast, budget, variance, explanation }) {
  const vp = budget == null ? null : variancePct(variance ?? 0, budget)
  const fav = isFavorable(kind, variance ?? 0)
  const varTone =
    budget == null
      ? 'text-ink'
      : fav
        ? 'text-emerald-600'
        : Math.abs(vp ?? 0) > 10
          ? 'text-rose-600'
          : 'text-amber-700'
  return (
    <tr className="border-t border-rule/50 hover:bg-gold/[0.04]">
      <td className="px-3 py-1.5 text-[13px] text-ink">{label}</td>
      <td className="px-3 py-1.5 text-right text-[13px] font-semibold tabular-nums text-navy">
        {money(forecast)}
      </td>
      <td className="px-3 py-1.5 text-right text-[13px] tabular-nums text-muted">
        {budget == null ? '—' : money(budget)}
      </td>
      <td className={`px-3 py-1.5 text-right text-[13px] tabular-nums ${varTone}`}>
        {budget == null ? '—' : signed(variance)}
      </td>
      <td className={`px-3 py-1.5 text-right text-[12px] tabular-nums ${varTone}`}>
        {budget == null ? '—' : pctText(vp)}
      </td>
      <td className="px-2 py-1.5 text-[12.5px] text-muted">
        {explanation ? explanation : ''}
      </td>
    </tr>
  )
}

function GroupHeader({ title }) {
  return (
    <tr className="bg-navy-gradient">
      <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light">
        {title}
      </td>
    </tr>
  )
}

function TotalRow({ kind, label, forecast, budget, variance, net }) {
  const vp = budget == null ? null : variancePct(variance ?? 0, budget)
  const fav = net ? (variance ?? 0) >= 0 : isFavorable(kind, variance ?? 0)
  const tone =
    budget == null ? 'text-navy' : fav ? 'text-emerald-600' : 'text-rose-600'
  return (
    <tr className={net ? 'border-t-2 border-gold/60 bg-gold/10' : 'border-t border-rule bg-cream/60'}>
      <td className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-navy">{label}</td>
      <td className="px-3 py-2 text-right text-[14px] font-semibold tabular-nums text-navy">{money(forecast)}</td>
      <td className="px-3 py-2 text-right text-[13px] tabular-nums text-muted">
        {budget == null ? '—' : money(budget)}
      </td>
      <td className={`px-3 py-2 text-right text-[13px] font-semibold tabular-nums ${tone}`}>
        {budget == null ? '—' : signed(variance)}
      </td>
      <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${tone}`}>
        {budget == null ? '—' : pctText(vp)}
      </td>
      <td />
    </tr>
  )
}

export default function ForecastView({ schoolId, periodId }) {
  const { forecast, hasBudget, loading } = useForecast(schoolId, periodId)

  // (a) Loading skeleton (mirrors ForecastWorkspace).
  if (loading) {
    return (
      <div className="card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">Loading the forecast…</p>
      </div>
    )
  }

  // (b) Empty state — no forecast saved yet. Point to the Data hub (single input
  // surface) via a gold CTA pill styled like the BudgetPage CTA.
  if (!forecast) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="card-soft border-dashed px-6 py-14 text-center"
      >
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <TrendingUp size={22} />
        </span>
        <p className="font-serif text-lg italic text-muted">No forecast saved yet for this period.</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
          Project where the year lands — revise your driver assumptions and add anticipated feeder
          enrollment in the Data hub. The saved forecast then appears here and flows into your board packet.
        </p>
        <Link
          to="/data"
          className="mt-5 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-navy shadow-glow outline-none ring-gold/50 transition-transform hover:-translate-y-0.5 focus-visible:ring-2"
        >
          Enter the forecast in the Data hub →
        </Link>
      </motion.div>
    )
  }

  // (c) Forecast present — pure presentation of the precomputed object.
  const projected = forecast.projected ?? {}
  const projectedRevenue = projected.revenue ?? {}
  const projectedExpense = projected.expense ?? {}
  const baseBudget = forecast.baseBudget ?? { revenue: {}, expense: {} }
  const baseRevenue = baseBudget.revenue ?? {}
  const baseExpense = baseBudget.expense ?? {}
  const variance = forecast.variance ?? { revenue: {}, expense: {} }
  const varRevenue = variance.revenue ?? {}
  const varExpense = variance.expense ?? {}
  const explanations = forecast.explanations ?? { revenue: {}, expense: {} }
  const kpis = projected.kpis ?? {}
  const isRollforward = forecast.projectionMethod === 'rollforward'
  const savedAt = forecast.computedAt ?? null

  // hasBaseBudget — show Budget/Variance/% columns only when there's a real
  // budget to compare against (else they read '—').
  const revBudgetTotal = sumKeys(baseRevenue, REVENUE_LINE_KEYS)
  const expBudgetTotal = sumKeys(baseExpense, EXPENSE_LINE_KEYS)
  const hasBaseBudget = hasBudget || revBudgetTotal !== 0 || expBudgetTotal !== 0

  const revForecastTotal = sumKeys(projectedRevenue, REVENUE_LINE_KEYS)
  const expForecastTotal = sumKeys(projectedExpense, EXPENSE_LINE_KEYS)
  const revVarTotal = sumKeys(varRevenue, REVENUE_LINE_KEYS)
  const expVarTotal = sumKeys(varExpense, EXPENSE_LINE_KEYS)

  const kpiCards = [
    {
      label: 'Projected students',
      value: (kpis.enrollmentTotal ?? 0).toLocaleString('en-US'),
      hint: isRollforward ? 'Rolled-forward roster + new entrants' : 'Base enrollment + feeder',
    },
    { label: 'Forecast revenue', value: money(kpis.totalRevenue), hint: 'Total projected revenue' },
    { label: 'Forecast expense', value: money(kpis.totalExpense), hint: 'Total projected expense' },
    {
      label: 'Net surplus / (deficit)',
      value: signed(kpis.netIncome),
      tone: (kpis.netIncome ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600',
      hint: 'Forecast revenue − expense',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <TrendingUp size={20} />
        </span>
        <div className="flex-1">
          <h3 className="font-serif text-lg font-semibold text-navy">Fiscal-year-end forecast</h3>
          <p className="text-[13px] text-muted">
            {isRollforward
              ? 'This year’s roster rolled forward a grade with retention plus new entrants — where the year lands compared to the budget you set.'
              : 'Revised assumptions and anticipated feeder enrollment — where the year lands compared to the budget you set.'}
          </p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/[0.06] px-2.5 py-1 text-[11px] font-medium text-muted">
            <Clock size={12} /> Saved{' '}
            {new Date(savedAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="card-soft p-3.5" title={c.hint}>
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              {c.label}
            </div>
            <div className={`font-serif text-lg font-semibold tabular-nums ${c.tone ?? 'text-navy'}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Variance table (read-only) */}
      <div className="card-soft overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <TrendingUp size={16} />
          </span>
          <div className="flex-1">
            <h4 className="font-serif text-[15px] font-semibold text-navy">Forecast vs. Budget</h4>
            <p className="text-[12px] text-muted">
              Where the year lands under the saved assumptions, compared to the active budget.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Line</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">Forecast</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Budget</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Variance</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">%</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Comment</th>
              </tr>
            </thead>
            <tbody>
              <GroupHeader title="Revenue" />
              {REVENUE_LINE_KEYS.map((key) => (
                <ForecastRow
                  key={`rev-${key}`}
                  kind="revenue"
                  label={REVENUE_LINE_LABELS[key] ?? key}
                  forecast={projectedRevenue[key]}
                  budget={hasBaseBudget ? baseRevenue[key] ?? 0 : null}
                  variance={varRevenue[key] ?? 0}
                  explanation={explanations?.revenue?.[key]}
                />
              ))}
              <TotalRow
                kind="revenue"
                label="Total revenue"
                forecast={revForecastTotal}
                budget={hasBaseBudget ? revBudgetTotal : null}
                variance={revVarTotal}
              />

              <GroupHeader title="Expenses" />
              {EXPENSE_LINE_KEYS.map((key) => (
                <ForecastRow
                  key={`exp-${key}`}
                  kind="expense"
                  label={EXPENSE_LINE_LABELS[key] ?? key}
                  forecast={projectedExpense[key]}
                  budget={hasBaseBudget ? baseExpense[key] ?? 0 : null}
                  variance={varExpense[key] ?? 0}
                  explanation={explanations?.expense?.[key]}
                />
              ))}
              <TotalRow
                kind="expense"
                label="Total expenses"
                forecast={expForecastTotal}
                budget={hasBaseBudget ? expBudgetTotal : null}
                variance={expVarTotal}
              />

              <TotalRow
                net
                label="Net surplus / (deficit)"
                forecast={revForecastTotal - expForecastTotal}
                budget={hasBaseBudget ? revBudgetTotal - expBudgetTotal : null}
                variance={revVarTotal - expVarTotal}
              />
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[12px] text-muted">
        Saved in the Data hub. To revise the forecast,{' '}
        <Link to="/data" className="font-semibold text-gold underline-offset-2 hover:underline">
          enter it in the Data hub →
        </Link>
      </p>
    </motion.div>
  )
}
