// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY Forecast view for the Reports hub.
//
// This renders the SAVED fiscal-year-end forecast result for a period — purely a
// presentation of the precomputed server object (useForecast → forecast). There
// are NO inputs and NO save here: the forecast is ENTERED in Planning &
// Forecasting (/planning, the input surface) and only VIEWED here. The variance
// figures are read
// STRAIGHT off forecast.variance (server-stored, never recomputed); we only
// format. KPIs come from forecast.projected.kpis.
//
// React-Compiler safety: hooks at top level; the table rows are produced by
// MODULE-scope row helpers (mirroring ForecastWorkspace's ForecastRow), not
// nested component definitions; no setState-in-render/effect — this view is pure
// read.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, Clock, Users, ArrowDownLeft, ArrowUpRight, Scale, Table2 } from 'lucide-react'
import {
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { useForecast } from '../../hooks/useAnalytics.js'
import { useBilling } from '../../context/BillingContext.jsx'
import { AuroraButton, AuroraEmpty, AuroraSection, HowThisWorks, VerdictEm } from '../ui/aurora/index.js'
import { FinanceSubBand } from '../statements/financeSub.jsx'
import { moneyShort } from '../finance/financeAurora.js'
import '../../styles/pending/b2-finance.css'

// ── Where "enter the forecast" actually goes ─────────────────────────────────
// GATE THE DESTINATION ON ENTITLEMENT, DON'T ASSUME IT. /planning is client-side
// gated on the 'planning' module, and a NEW SCHOOL IS LICENSED TO 'finance' ONLY
// (POST /schools → licensedModules: [{key:'finance'}]). So the unconditional
// "Enter the forecast in Planning →" pill sent every default school to a module
// paywall — verified end-to-end — with no other forecast input anywhere
// (wizardConfigs.finance offers tb / monthly / budget, no forecast).
//
// Licensed → the real input surface. Not licensed → say plainly that the FY-end
// forecast is part of the add-on and link the place that sells it
// (/settings/billing#modules, the house upsell destination used by
// CoverageCta / SignalPanel / ModuleInfoPopup). Never a pill whose only outcome
// is a wall.
function forecastEntry(hasPlanning) {
  return hasPlanning
    ? { to: '/planning', label: 'Enter the forecast in Planning →' }
    : { to: '/settings/billing#modules', label: 'Add Planning & Forecasting →' }
}

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

// Variance tone → a 2px mark beside the (ink) figure; never coloured text.
function varianceTone(kind, variance, vp, budget) {
  if (budget == null) return null
  if (isFavorable(kind, variance)) return 'good'
  return Math.abs(vp ?? 0) > 10 ? 'risk' : 'watch'
}
function VarianceCell({ tone, children, bold }) {
  return (
    <td className={`dt-num whitespace-nowrap ${bold ? 'font-semibold' : ''}`}>
      {tone ? <i className={`mark tone-${tone} mr-1.5`} aria-label={tone === 'good' ? 'favorable' : 'unfavorable'} /> : null}
      {children}
    </td>
  )
}

// ── Read-only Forecast-vs-Budget row (module scope) — variance is STORED. ──────
function ForecastRow({ kind, label, forecast, budget, variance, explanation }) {
  const vp = budget == null ? null : variancePct(variance ?? 0, budget)
  const tone = varianceTone(kind, variance ?? 0, vp, budget)
  return (
    <tr>
      <td>{label}</td>
      <td className="dt-num font-semibold">{money(forecast)}</td>
      <td className="dt-num text-ink2">{budget == null ? '—' : money(budget)}</td>
      <VarianceCell tone={tone}>{budget == null ? '—' : signed(variance)}</VarianceCell>
      <td className="dt-num text-[12px] text-ink2">{budget == null ? '—' : pctText(vp)}</td>
      <td className="text-[12.5px] text-ink2">{explanation ? explanation : ''}</td>
    </tr>
  )
}

function GroupHeader({ title }) {
  return (
    <tr className="dt-section">
      <td colSpan={6} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
        {title}
      </td>
    </tr>
  )
}

function TotalRow({ kind, label, forecast, budget, variance, net }) {
  const vp = budget == null ? null : variancePct(variance ?? 0, budget)
  const fav = net ? (variance ?? 0) >= 0 : isFavorable(kind, variance ?? 0)
  const tone = budget == null ? null : fav ? 'good' : 'risk'
  return (
    <tr className={net ? 'dt-section-total' : 'dt-subtotal'}>
      <td className="text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</td>
      <td className="dt-num font-semibold">{money(forecast)}</td>
      <td className="dt-num text-ink2">{budget == null ? '—' : money(budget)}</td>
      <VarianceCell tone={tone} bold>{budget == null ? '—' : signed(variance)}</VarianceCell>
      <td className="dt-num text-[12px] text-ink2">{budget == null ? '—' : pctText(vp)}</td>
      <td />
    </tr>
  )
}

export default function ForecastView({ schoolId, periodId }) {
  const reduce = useReducedMotion()
  const { forecast, hasBudget, loading } = useForecast(schoolId, periodId)
  const { hasModule } = useBilling()
  const entry = forecastEntry(hasModule('planning'))

  // (a) Loading note (mirrors ForecastWorkspace).
  if (loading) {
    return (
      <div>
        <FinanceSubBand eyebrow="Fiscal-year-end forecast" title="FYE Forecast" verdict="Opening the forecast…" />
        <div className="mt-8" aria-busy="true">
          <AuroraEmpty icon={TrendingUp} text="Loading the forecast…" />
        </div>
      </div>
    )
  }

  // (b) Empty state — no forecast saved yet. A ruled note on the ground with the
  // entitlement-aware destination as the one primary action.
  if (!forecast) {
    return (
      <div>
        <FinanceSubBand
          eyebrow="Fiscal-year-end forecast"
          title="FYE Forecast"
          verdict={<>No forecast is saved for this year yet.</>}
          actions={
            <AuroraButton variant="primary" to={entry.to} icon={<TrendingUp size={19} aria-hidden="true" />}>
              {entry.label}
            </AuroraButton>
          }
        />
        <div className="mt-8">
          <AuroraEmpty
            icon={TrendingUp}
            text={
              hasModule('planning')
                ? 'Save a forecast in Planning & Forecasting and it shows here.'
                : 'Projecting the year-end is part of the Planning & Forecasting add-on.'
            }
          />
        </div>
      </div>
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

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <FinanceSubBand
        eyebrow="Fiscal-year-end forecast"
        title="FYE Forecast"
        verdict={
          Number.isFinite(kpis.netIncome) ? (
            <>
              The year is forecast to end with a{' '}
              <VerdictEm tone={kpis.netIncome >= 0 ? null : 'risk'}>
                {money(Math.abs(kpis.netIncome))} {kpis.netIncome >= 0 ? 'surplus' : 'deficit'}
              </VerdictEm>
              .
            </>
          ) : (
            <>Where the year is likely to land, from your saved assumptions.</>
          )
        }
        actions={
          <AuroraButton variant="primary" to={entry.to} icon={<TrendingUp size={19} aria-hidden="true" />}>
            {hasModule('planning') ? 'Revise the forecast' : 'Add Planning & Forecasting'}
          </AuroraButton>
        }
        tools={
          savedAt ? (
            <span className="pill">
              <Clock size={11} aria-hidden="true" /> Saved{' '}
              {new Date(savedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          ) : null
        }
        kpis={[
          {
            key: 'students',
            icon: Users,
            label: 'Projected students',
            value: Number.isFinite(kpis.enrollmentTotal) ? kpis.enrollmentTotal.toLocaleString('en-US') : null,
            caption: isRollforward ? 'Roster rolled forward + new' : 'Base enrollment + feeder',
          },
          { key: 'rev', icon: ArrowDownLeft, label: 'Forecast revenue', value: moneyShort(kpis.totalRevenue ?? null), caption: 'Total projected income' },
          { key: 'exp', icon: ArrowUpRight, label: 'Forecast expense', value: moneyShort(kpis.totalExpense ?? null), caption: 'Total projected spending' },
          {
            key: 'net',
            icon: Scale,
            label: 'Net surplus / (deficit)',
            value: Number.isFinite(kpis.netIncome) ? signed(kpis.netIncome) : null,
            caption: 'Revenue minus expense',
            // A SIGN, not a band.
            verdict: Number.isFinite(kpis.netIncome) ? (kpis.netIncome >= 0 ? 'good' : 'risk') : null,
            verdictLabel: Number.isFinite(kpis.netIncome) ? (kpis.netIncome >= 0 ? 'Surplus' : 'Deficit') : null,
          },
        ]}
      />

      {/* Variance table (read-only) */}
      <AuroraSection first icon={Table2} title="Forecast vs. budget" subtitle="Line by line, against your budget">
        <div className="au-card au-card-flat au-register">
          <div className="dt-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col" className="dt-num">Forecast</th>
                  <th scope="col" className="dt-num">Budget</th>
                  <th scope="col" className="dt-num">Variance</th>
                  <th scope="col" className="dt-num">%</th>
                  <th scope="col">Comment</th>
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
      </AuroraSection>

      <HowThisWorks>
        <p>
          {isRollforward
            ? 'This year’s roster is rolled forward a grade with retention plus new entrants, then compared with the budget you set.'
            : 'Your revised assumptions and expected feeder enrollment, compared with the budget you set.'}
        </p>
        <p>
          The forecast is entered in Planning &amp; Forecasting and only shown here.{' '}
          <Link to={entry.to} className="font-semibold text-ink underline decoration-hair underline-offset-2 hover:decoration-ink">
            {hasModule('planning') ? 'Open Planning & Forecasting →' : 'Add Planning & Forecasting to your plan →'}
          </Link>
        </p>
      </HowThisWorks>
    </motion.div>
  )
}
