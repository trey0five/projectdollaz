// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — FY-End Forecast workspace.
//
// The forecast is an ASSUMPTION-DRIVEN RE-PROJECTION (not actuals-YTD): the user
// revises the same driver assumptions (reusing DriverAssumptionsForm VERBATIM)
// AND enters anticipated INCOMING (feeder) students by grade. Feeder is merged
// ADDITIVELY into the enrollment grid via the SHARED mergeFeederEnrollment helper
// (so the live preview can't drift from the server save), then run through the
// SAME computeDriverBudget. The result is compared against the active budget
// (lines.revenue/expense) to produce per-category Forecast-vs-Budget variance,
// with an editable per-line Comment column.
//
// SOURCE OF TRUTH: the SERVER recomputes on save (analyticsApi.saveForecast) and
// the result REPLACES the on-screen preview (we refetch). The client compute is
// only a live preview; mergeFeederEnrollment + computeDriverBudget are imported
// from @finrep/analytics so preview and save share the exact math.
//
// React-Compiler safety: hooks at top level; the preview is DERIVED via useMemo
// (no effects, no setState-in-render); assumptions/feeder/explanations are seeded
// with the established microtask-deferred sync-on-key pattern; the workspace is
// key-remounted per period by the parent. Save uses the useAutosave change-signal-
// vs-synced-baseline pattern so simply OPENING the tab writes nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Clock,
} from 'lucide-react'
import {
  computeDriverBudget,
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
} from '@finrep/analytics'
import { analyticsApi } from '../../lib/api.js'
import { useForecast } from '../../hooks/useAnalytics.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { mergeFeederEnrollment, gradeGridTotal } from '../../lib/mergeFeeder.js'
import DriverAssumptionsForm from './DriverAssumptionsForm.jsx'
import FeederEnrollmentGrid from './FeederEnrollmentGrid.jsx'
import { seedAssumptions, toDriverPriorContext } from './driverModel.js'

// computeDriverBudget is shared with the API; if it's not yet a function in the
// consumed build, degrade gracefully (no throw) — server save still authoritative.
function safeCompute(assumptions, prior) {
  if (typeof computeDriverBudget !== 'function') return null
  try {
    return computeDriverBudget(assumptions, prior)
  } catch {
    return null
  }
}

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

// Clamp a comment to the server's 2000-char ExplanationMapDto limit.
function clampExplanation(s) {
  return typeof s === 'string' ? s.slice(0, 2000) : ''
}

// ── Live Forecast-vs-Budget row (module scope — editable comment cell) ─────────
function ForecastRow({ kind, label, forecast, budget, explanation, onExplain, disabled }) {
  const variance = round2((forecast ?? 0) - (budget ?? 0))
  const vp = variancePct(variance, budget)
  const fav = isFavorable(kind, variance)
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
      <td className={`px-3 py-1.5 text-right text-[12px] tabular-nums ${varTone}`}>{pctText(vp)}</td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={explanation ?? ''}
          placeholder={disabled ? '' : 'Comment…'}
          onChange={(e) => onExplain(clampExplanation(e.target.value))}
          className="w-full min-w-[140px] rounded-md border border-rule bg-white px-2 py-1 text-[12.5px] text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
        />
      </td>
    </tr>
  )
}

// ── Group header + totals rows ────────────────────────────────────────────────
function GroupHeader({ title }) {
  return (
    <tr className="bg-navy-gradient">
      <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light">
        {title}
      </td>
    </tr>
  )
}

function TotalRow({ kind, label, forecast, budget, net }) {
  const variance = round2((forecast ?? 0) - (budget ?? 0))
  const vp = variancePct(variance, budget)
  const fav = net ? variance >= 0 : isFavorable(kind, variance)
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
      <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${tone}`}>{pctText(vp)}</td>
      <td />
    </tr>
  )
}

// Sum a category map over a key list.
function sumKeys(map, keys) {
  let t = 0
  for (const k of keys) t += Number(map?.[k]) || 0
  return t
}

export default function ForecastWorkspace({ schoolId, periodId, canEdit, budget, budgetContext }) {
  const {
    forecast: savedForecast,
    feederEnrollmentByGrade: savedFeeder,
    hasBudget,
    loading,
    refetch,
  } = useForecast(schoolId, periodId)

  // ── Draft state (assumptions / feeder / explanations) ─────────────────────
  // Assumptions seed order: saved forecast assumptions → saved driver model →
  // prior-context seed. Feeder seeds from the operational row (live) or the saved
  // forecast snapshot. Explanations seed from the saved forecast.
  const initialAssumptions = () =>
    savedForecast?.assumptions ??
    budget?.lines?.driverModel?.assumptions ??
    seedAssumptions(budgetContext)
  const [assumptions, setAssumptions] = useState(initialAssumptions)
  const [feeder, setFeeder] = useState(() => savedFeeder ?? savedForecast?.feederEnrollmentByGrade ?? {})
  const [explanations, setExplanations] = useState(
    () => savedForecast?.explanations ?? { revenue: {}, expense: {} },
  )

  // Change-signal vs synced-baseline: opening writes nothing. `baseline` holds the
  // serialized draft last SYNCED from the server (seed or save result); the save
  // only fires when the live draft diverges from it. It's STATE (not a ref) so the
  // `dirty` derivation below stays a pure render value (React-Compiler refs rule).
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)
  const touchedRef = useRef(false)
  const [baseline, setBaseline] = useState('')

  // Serialize the saveable draft (the change-signal for autosave + dirty check).
  const draftKey = useMemo(
    () => JSON.stringify({ assumptions, feeder, explanations }),
    [assumptions, feeder, explanations],
  )

  // Seed / re-seed on key change OR when saved data first arrives for this key,
  // while the form is pristine. Microtask-deferred (sync-on-key, no sync setState
  // in the effect body). Records the synced draft as the autosave baseline so a
  // fresh open is never dirty.
  useEffect(() => {
    let cancelled = false
    const key = `${schoolId}:${periodId}`
    Promise.resolve().then(() => {
      if (cancelled) return
      const seed = () => {
        const a = savedForecast?.assumptions ?? budget?.lines?.driverModel?.assumptions ?? seedAssumptions(budgetContext)
        const f = savedFeeder ?? savedForecast?.feederEnrollmentByGrade ?? {}
        const ex = savedForecast?.explanations ?? { revenue: {}, expense: {} }
        // Normalize ONCE and use the same object for both the state and the
        // autosave baseline — otherwise a shape/key-order mismatch makes draftKey
        // diverge from baseline on a fresh open and fires a no-op PUT.
        const exNorm = { revenue: { ...(ex.revenue || {}) }, expense: { ...(ex.expense || {}) } }
        setAssumptions(a)
        setFeeder(f)
        setExplanations(exNorm)
        setBaseline(JSON.stringify({ assumptions: a, feeder: f, explanations: exNorm }))
      }
      if (key !== seedKeyRef.current) {
        seedKeyRef.current = key
        touchedRef.current = false
        seed()
      } else if (!touchedRef.current && !loading) {
        seed()
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, savedForecast, savedFeeder, budget, budgetContext, loading])

  const onAssumptionsChange = useCallback((next) => {
    touchedRef.current = true
    setAssumptions(next)
  }, [])
  const onFeederChange = useCallback((next) => {
    touchedRef.current = true
    setFeeder(next)
  }, [])
  const onExplain = useCallback((kind, key, text) => {
    touchedRef.current = true
    setExplanations((cur) => ({
      ...cur,
      [kind]: { ...(cur?.[kind] || {}), [key]: text },
    }))
  }, [])

  // ── Live preview (DERIVED) ────────────────────────────────────────────────
  const prior = useMemo(() => toDriverPriorContext(budgetContext), [budgetContext])
  const effective = useMemo(
    () => mergeFeederEnrollment(assumptions.enrollmentByGrade, feeder),
    [assumptions.enrollmentByGrade, feeder],
  )
  const merged = useMemo(
    () => ({ ...assumptions, enrollmentByGrade: effective }),
    [assumptions, effective],
  )
  const projected = useMemo(() => safeCompute(merged, prior), [merged, prior])

  const baseBudget = useMemo(
    () => ({
      revenue: budget?.lines?.revenue ?? {},
      expense: budget?.lines?.expense ?? {},
    }),
    [budget],
  )

  const feederTotal = gradeGridTotal(feeder)
  const projectedRevenue = projected?.revenue ?? {}
  const projectedExpense = projected?.expense ?? {}

  const revBudgetTotal = sumKeys(baseBudget.revenue, REVENUE_LINE_KEYS)
  const expBudgetTotal = sumKeys(baseBudget.expense, EXPENSE_LINE_KEYS)
  const revForecastTotal = sumKeys(projectedRevenue, REVENUE_LINE_KEYS)
  const expForecastTotal = sumKeys(projectedExpense, EXPENSE_LINE_KEYS)
  const hasBaseBudget = hasBudget || revBudgetTotal !== 0 || expBudgetTotal !== 0

  // ── Save (server is authoritative; result replaces the preview) ───────────
  const dirty = canEdit && baseline !== '' && draftKey !== baseline
  const doSave = useCallback(async () => {
    if (!schoolId || !periodId) return
    const body = {
      assumptions,
      feederEnrollmentByGrade: feeder && Object.keys(feeder).length ? feeder : null,
      explanations,
    }
    await analyticsApi.saveForecast(schoolId, periodId, body)
    // The server recomputed authoritatively — re-pull so the preview shows the
    // canonical figures + computedAt, and reset the dirty baseline.
    await refetch()
    setBaseline(JSON.stringify({ assumptions, feeder, explanations }))
  }, [schoolId, periodId, assumptions, feeder, explanations, refetch])

  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: draftKey,
    save: doSave,
  })

  const savedAt = savedForecast?.computedAt ?? null

  // ── Render helpers (NOT components) ───────────────────────────────────────
  const renderKpiStrip = () => {
    const k = projected?.kpis ?? {}
    const cards = [
      { label: 'Projected students', value: (k.enrollmentTotal ?? 0).toLocaleString('en-US'), hint: 'Base enrollment + feeder' },
      { label: 'Forecast revenue', value: money(k.totalRevenue), hint: 'Total projected revenue' },
      { label: 'Forecast expense', value: money(k.totalExpense), hint: 'Total projected expense' },
      {
        label: 'Net surplus / (deficit)',
        value: signed(k.netIncome),
        tone: (k.netIncome ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600',
        hint: 'Forecast revenue − expense',
      },
    ]
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((c) => (
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
    )
  }

  const renderTable = () => (
    <div className="card-soft overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <TrendingUp size={16} />
        </span>
        <div className="flex-1">
          <h4 className="font-serif text-[15px] font-semibold text-navy">Forecast vs. Budget</h4>
          <p className="text-[12px] text-muted">
            Where the year lands under your revised assumptions, compared to the active budget. Add a
            comment per line for the board packet.
          </p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/[0.06] px-2.5 py-1 text-[11px] font-medium text-muted">
            <Clock size={12} /> Saved {new Date(savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
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
                budget={hasBaseBudget ? baseBudget.revenue[key] ?? 0 : null}
                explanation={explanations?.revenue?.[key]}
                onExplain={(t) => onExplain('revenue', key, t)}
                disabled={!canEdit}
              />
            ))}
            <TotalRow kind="revenue" label="Total revenue" forecast={revForecastTotal} budget={hasBaseBudget ? revBudgetTotal : null} />

            <GroupHeader title="Expenses" />
            {EXPENSE_LINE_KEYS.map((key) => (
              <ForecastRow
                key={`exp-${key}`}
                kind="expense"
                label={EXPENSE_LINE_LABELS[key] ?? key}
                forecast={projectedExpense[key]}
                budget={hasBaseBudget ? baseBudget.expense[key] ?? 0 : null}
                explanation={explanations?.expense?.[key]}
                onExplain={(t) => onExplain('expense', key, t)}
                disabled={!canEdit}
              />
            ))}
            <TotalRow kind="expense" label="Total expenses" forecast={expForecastTotal} budget={hasBaseBudget ? expBudgetTotal : null} />

            <TotalRow
              net
              label="Net surplus / (deficit)"
              forecast={revForecastTotal - expForecastTotal}
              budget={hasBaseBudget ? revBudgetTotal - expBudgetTotal : null}
            />
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderSaveBar = () => (
    <div
      key="forecast-save-bar"
      className="card-soft sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 border-gold/40 bg-white/95 p-4 shadow-glow backdrop-blur"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient text-white">
          <Sparkles size={17} />
        </span>
        <div>
          <p className="font-serif text-[15px] font-semibold text-navy">Save forecast</p>
          <p className="text-[12px] text-muted">
            Re-projects on the server and stores it for the board report. Your active budget is left
            unchanged.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {saving && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Loader2 size={16} className="animate-spin" /> Saving…
          </span>
        )}
        {!saving && saveError && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-rose-600">
            <AlertTriangle size={16} /> {saveError}
          </span>
        )}
        {!saving && !saveError && !dirty && savedAt && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
            <CheckCircle2 size={16} /> Saved
          </span>
        )}
        {!canEdit && (
          <span className="text-[12px] italic text-muted">View-only — owner/accountant can save.</span>
        )}
        <button
          type="button"
          onClick={saveNow}
          disabled={!canEdit || !dirty || saving}
          className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={16} /> Save forecast
            </>
          )}
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">Loading the forecast…</p>
      </div>
    )
  }

  return (
    <motion.div
      key="forecast"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <TrendingUp size={20} />
        </span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Fiscal-year-end forecast</h3>
          <p className="text-[13px] text-muted">
            Revise your assumptions and add anticipated feeder students to project where the year lands
            — then compare it to the budget you set.
          </p>
        </div>
      </div>

      {!hasBaseBudget && (
        <div className="card-soft border-amber-300 bg-amber-50/60 px-4 py-3">
          <p className="flex items-start gap-2 text-[12.5px] text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <strong>No base budget yet.</strong> Build a budget on the <em>Budget</em> tab first —
              until then there&rsquo;s nothing to compare against, so the variance columns stay blank.
            </span>
          </p>
        </div>
      )}

      {projected == null && (
        <div className="card-soft border-dashed border-amber-300 bg-amber-50/50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
            <AlertTriangle size={13} />
            Live preview pending — the compute engine is finishing integration. Your assumptions still
            re-project server-side on save.
          </p>
        </div>
      )}

      {renderKpiStrip()}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(340px,420px)_1fr]">
        <div className="space-y-4">
          <FeederEnrollmentGrid feeder={feeder} onChange={onFeederChange} disabled={!canEdit} />
          <DriverAssumptionsForm assumptions={assumptions} onChange={onAssumptionsChange} disabled={!canEdit} />
        </div>
        <div className="space-y-4">{renderTable()}</div>
      </div>

      {renderSaveBar()}

      {feederTotal > 0 && (
        <p className="text-[12px] text-muted">
          {feederTotal} anticipated feeder student{feederTotal === 1 ? '' : 's'} added on top of your
          projected enrollment ({(projected?.kpis?.enrollmentTotal ?? 0).toLocaleString('en-US')}{' '}
          total).
        </p>
      )}
    </motion.div>
  )
}
