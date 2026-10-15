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
import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp, Save, CheckCircle2, AlertTriangle, Loader2, Clock } from 'lucide-react'
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
import { effectiveEnrollment, gradeGridTotal } from '../../lib/mergeFeeder.js'
import DriverAssumptionsForm from './DriverAssumptionsForm.jsx'
import FeederEnrollmentGrid from './FeederEnrollmentGrid.jsx'
import MethodToggle from './MethodToggle.jsx'
import CurrentRosterGrid, { seedCurrentRoster } from './CurrentRosterGrid.jsx'
import RetentionControl from './RetentionControl.jsx'
import ProjectedRosterGrid from './ProjectedRosterGrid.jsx'
import { seedAssumptions, toDriverPriorContext, GRADE_ROW } from './driverModel.js'
import { Section, StatStrip, Stat, Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'
import { statMoney } from './StatFigure.jsx'

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

// Variance tone → the 2px mark beside the figure (the figure itself stays ink).
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

// ── Live Forecast-vs-Budget row (module scope — editable comment cell) ─────────
function ForecastRow({ kind, label, forecast, budget, explanation, onExplain, disabled }) {
  const variance = round2((forecast ?? 0) - (budget ?? 0))
  const vp = variancePct(variance, budget)
  const tone = varianceTone(kind, variance, vp, budget)
  return (
    <tr>
      <td>{label}</td>
      <td className="dt-num font-semibold">{money(forecast)}</td>
      <td className="dt-num text-ink2">{budget == null ? '—' : money(budget)}</td>
      <VarianceCell tone={tone}>{budget == null ? '—' : signed(variance)}</VarianceCell>
      <td className="dt-num text-[12px] text-ink2">{pctText(vp)}</td>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={explanation ?? ''}
          placeholder={disabled ? '' : 'Comment…'}
          aria-label={`Comment on ${label}`}
          onChange={(e) => onExplain(clampExplanation(e.target.value))}
          className="h-7 w-full min-w-[140px] rounded-[4px] border border-hair/[0.18] bg-white px-2 text-[12.5px] text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
    </tr>
  )
}

// ── Group header + totals rows ────────────────────────────────────────────────
function GroupHeader({ title }) {
  return (
    <tr className="dt-section">
      <td colSpan={6} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
        {title}
      </td>
    </tr>
  )
}

function TotalRow({ kind, label, forecast, budget, net }) {
  const variance = round2((forecast ?? 0) - (budget ?? 0))
  const vp = variancePct(variance, budget)
  const fav = net ? variance >= 0 : isFavorable(kind, variance)
  const tone = budget == null ? null : fav ? 'good' : 'risk'
  return (
    <tr className={net ? 'dt-section-total' : 'dt-subtotal'}>
      <td className="text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</td>
      <td className="dt-num font-semibold">{money(forecast)}</td>
      <td className="dt-num text-ink2">{budget == null ? '—' : money(budget)}</td>
      <VarianceCell tone={tone} bold>{budget == null ? '—' : signed(variance)}</VarianceCell>
      <td className="dt-num text-[12px] text-ink2">{pctText(vp)}</td>
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

// ── Phase 4 — roll-forward state normalization ────────────────────────────────
// Normalize the projectionMethod to the two valid values (missing/unknown ⇒
// 'manual', matching the shared dispatcher + server back-compat).
function normMethod(m) {
  return m === 'rollforward' ? 'rollforward' : 'manual'
}

const DEFAULT_RETENTION = 93

// Canonical, FIXED-KEY rollForward object. Both the seed baseline AND doSave
// serialize through THIS, so key order is deterministic and opening a forecast is
// never falsely dirty (the known exNorm key-order gotcha, mirrored). currentByGrade
// is a fixed 15-key grid; retentionByGrade / projectedOverrideByGrade are sparse
// (only present keys), each with a stable GRADE_ROW iteration order.
function canonicalRollForward(rf) {
  const src = rf || {}
  const cur = src.currentByGrade || {}
  const currentByGrade = {}
  for (const g of GRADE_ROW) currentByGrade[g] = Number(cur[g]) || 0

  const retSrc = src.retentionByGrade || {}
  const retentionByGrade = {}
  for (const g of GRADE_ROW) {
    const v = retSrc[g]
    if (v !== undefined && v !== null && v !== '') retentionByGrade[g] = Number(v)
  }

  const ovSrc = src.projectedOverrideByGrade || {}
  const projectedOverrideByGrade = {}
  for (const g of GRADE_ROW) {
    const v = ovSrc[g]
    if (v !== undefined && v !== null && v !== '') projectedOverrideByGrade[g] = Number(v)
  }

  const pct = src.retentionPct
  return {
    currentByGrade,
    retentionPct: Number.isFinite(Number(pct)) && pct !== '' && pct != null ? Number(pct) : DEFAULT_RETENTION,
    retentionByGrade,
    graduatingGrade: GRADE_ROW.includes(src.graduatingGrade)
      ? src.graduatingGrade
      : GRADE_ROW[GRADE_ROW.length - 1],
    projectedOverrideByGrade,
  }
}

// Keep only current GRADE_ROW keys from a per-grade map, dropping legacy grades
// (e.g. PK0–PK2 saved before the PK3–12 change). Preserves the sparse shape so a
// re-save doesn't 400 on the forbidNonWhitelisted DTO (which only whitelists the
// live grade keys).
function pickGrades(map) {
  const src = map || {}
  const out = {}
  for (const g of GRADE_ROW) if (src[g] !== undefined && src[g] !== null) out[g] = src[g]
  return out
}

// Strip legacy grade keys from driver assumptions' enrollmentByGrade (the only
// per-grade map on the assumptions object).
function normalizeAssumptions(a) {
  if (!a || typeof a !== 'object') return a
  return { ...a, enrollmentByGrade: pickGrades(a.enrollmentByGrade) }
}

// Build the initial canonical rollForward for a forecast: saved config if present,
// else seed currentByGrade from saved driver assumptions / operational total.
function initialRollForward({ savedForecast, budget, budgetContext }) {
  if (savedForecast?.rollForward) return canonicalRollForward(savedForecast.rollForward)
  const driverAssumptions = budget?.lines?.driverModel?.assumptions ?? null
  return canonicalRollForward({
    currentByGrade: seedCurrentRoster({ driverAssumptions, budgetContext }),
    retentionPct: DEFAULT_RETENTION,
    graduatingGrade: GRADE_ROW[GRADE_ROW.length - 1],
  })
}

// The ONE serialization used for BOTH the autosave change-signal and the synced
// baseline. rollForward rides along ONLY in rollforward mode (manual omits it).
function serializeDraft({ method, assumptions, feeder, rollForward, explanations }) {
  return normMethod(method) === 'rollforward'
    ? JSON.stringify({ projectionMethod: 'rollforward', assumptions, feeder, rollForward, explanations })
    : JSON.stringify({ projectionMethod: 'manual', assumptions, feeder, explanations })
}

export default function ForecastWorkspace({ schoolId, periodId, canEdit, budget, budgetContext, onSaved }) {
  const reduce = useReducedMotion()
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
    normalizeAssumptions(
      savedForecast?.assumptions ??
        budget?.lines?.driverModel?.assumptions ??
        seedAssumptions(budgetContext),
    )
  const [assumptions, setAssumptions] = useState(initialAssumptions)
  const [feeder, setFeeder] = useState(() =>
    pickGrades(savedFeeder ?? savedForecast?.feederEnrollmentByGrade ?? {}),
  )
  const [explanations, setExplanations] = useState(
    () => savedForecast?.explanations ?? { revenue: {}, expense: {} },
  )
  // Phase 4 — projection method + canonical roll-forward config.
  const [projectionMethod, setProjectionMethod] = useState(() => normMethod(savedForecast?.projectionMethod))
  const [rollForward, setRollForward] = useState(() => initialRollForward({ savedForecast, budget, budgetContext }))
  // Which projected-roster grade is being inline-overridden (UI-only, not saved).
  const [editingGrade, setEditingGrade] = useState(null)

  // Change-signal vs synced-baseline: opening writes nothing. `baseline` holds the
  // serialized draft last SYNCED from the server (seed or save result); the save
  // only fires when the live draft diverges from it. It's STATE (not a ref) so the
  // `dirty` derivation below stays a pure render value (React-Compiler refs rule).
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)
  const touchedRef = useRef(false)
  const [baseline, setBaseline] = useState('')

  // Serialize the saveable draft (the change-signal for autosave + dirty check).
  // rollForward is included ONLY in rollforward mode — manual saves OMIT it, so
  // the manual draft shape is byte-identical to pre-Phase-4 (no shape churn). Both
  // the canonical baseline (seed effect) and doSave serialize through this same
  // shape, so opening either mode is never falsely dirty.
  const draftKey = useMemo(
    () =>
      JSON.stringify(
        normMethod(projectionMethod) === 'rollforward'
          ? { projectionMethod: 'rollforward', assumptions, feeder, rollForward, explanations }
          : { projectionMethod: 'manual', assumptions, feeder, explanations },
      ),
    [projectionMethod, assumptions, feeder, rollForward, explanations],
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
        const a = normalizeAssumptions(
          savedForecast?.assumptions ?? budget?.lines?.driverModel?.assumptions ?? seedAssumptions(budgetContext),
        )
        const f = pickGrades(savedFeeder ?? savedForecast?.feederEnrollmentByGrade ?? {})
        const ex = savedForecast?.explanations ?? { revenue: {}, expense: {} }
        // Normalize ONCE and use the same object for both the state and the
        // autosave baseline — otherwise a shape/key-order mismatch makes draftKey
        // diverge from baseline on a fresh open and fires a no-op PUT.
        const exNorm = { revenue: { ...(ex.revenue || {}) }, expense: { ...(ex.expense || {}) } }
        // Phase 4 — seed method + CANONICAL rollForward (fixed-key, deterministic
        // order). The baseline serializes through the IDENTICAL serializeDraft so
        // opening either mode (incl. legacy manual forecasts, which omit
        // rollForward in the draft) is never dirty and writes nothing.
        const m = normMethod(savedForecast?.projectionMethod)
        const rf = initialRollForward({ savedForecast, budget, budgetContext })
        setAssumptions(a)
        setFeeder(f)
        setExplanations(exNorm)
        setProjectionMethod(m)
        setRollForward(rf)
        setEditingGrade(null)
        setBaseline(
          serializeDraft({ method: m, assumptions: a, feeder: f, rollForward: rf, explanations: exNorm }),
        )
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

  // ── Phase 4 change handlers (all set touchedRef like onFeederChange) ───────
  const onMethodChange = useCallback((next) => {
    touchedRef.current = true
    setProjectionMethod(normMethod(next))
  }, [])
  const onCurrentRosterChange = useCallback((nextGrid) => {
    touchedRef.current = true
    setRollForward((cur) => ({ ...cur, currentByGrade: nextGrid }))
  }, [])
  const onRetentionDefaultChange = useCallback((pct) => {
    touchedRef.current = true
    setRollForward((cur) => ({ ...cur, retentionPct: pct }))
  }, [])
  const onRetentionOverrideChange = useCallback((grade, value) => {
    touchedRef.current = true
    setRollForward((cur) => {
      const next = { ...(cur.retentionByGrade || {}) }
      if (value === undefined) delete next[grade]
      else next[grade] = value
      return { ...cur, retentionByGrade: next }
    })
  }, [])
  const onGraduatingChange = useCallback((grade) => {
    touchedRef.current = true
    setRollForward((cur) => ({ ...cur, graduatingGrade: grade }))
  }, [])
  const onProjectedOverrideChange = useCallback((grade, value) => {
    touchedRef.current = true
    setRollForward((cur) => {
      const next = { ...(cur.projectedOverrideByGrade || {}) }
      next[grade] = value
      return { ...cur, projectedOverrideByGrade: next }
    })
  }, [])
  const onProjectedOverrideClear = useCallback((grade) => {
    touchedRef.current = true
    setRollForward((cur) => {
      const next = { ...(cur.projectedOverrideByGrade || {}) }
      delete next[grade]
      return { ...cur, projectedOverrideByGrade: next }
    })
  }, [])
  // Seed currentByGrade from saved driver assumptions / operational total.
  const onSeedCurrentRoster = useCallback(() => {
    touchedRef.current = true
    const driverAssumptions = budget?.lines?.driverModel?.assumptions ?? null
    const seeded = seedCurrentRoster({ driverAssumptions, budgetContext })
    setRollForward((cur) => ({ ...cur, currentByGrade: seeded }))
  }, [budget, budgetContext])

  // ── Live preview (DERIVED) ────────────────────────────────────────────────
  const prior = useMemo(() => toDriverPriorContext(budgetContext), [budgetContext])
  // The ONE source of effectiveEnrollmentByGrade for BOTH the preview and the
  // server save (same @finrep/analytics helper) — so they can never drift. Manual
  // mode routes to the unchanged mergeFeederEnrollment path inside the dispatcher.
  const effective = useMemo(
    () =>
      effectiveEnrollment({
        projectionMethod: normMethod(projectionMethod),
        enrollmentByGrade: assumptions.enrollmentByGrade,
        feederEnrollmentByGrade: feeder,
        rollForward,
      }),
    [projectionMethod, assumptions.enrollmentByGrade, feeder, rollForward],
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

  const isRollforward = normMethod(projectionMethod) === 'rollforward'
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
    const method = normMethod(projectionMethod)
    const body = {
      projectionMethod: method,
      assumptions,
      feederEnrollmentByGrade: feeder && Object.keys(feeder).length ? feeder : null,
      explanations,
    }
    // rollForward is sent ONLY in rollforward mode (the server requires it there
    // and OMITS it in manual — keeping manual stored shape byte-identical).
    if (method === 'rollforward') body.rollForward = rollForward
    await analyticsApi.saveForecast(schoolId, periodId, body)
    // The server recomputed authoritatively — re-pull so the preview shows the
    // canonical figures + computedAt, and reset the dirty baseline (through the
    // IDENTICAL serializer so the post-save state is clean).
    await refetch()
    setBaseline(serializeDraft({ method, assumptions, feeder, rollForward, explanations }))
    // Let an embedding page (PlanningPage) relight ITS OWN hook copies (KPI row,
    // attention rail, outlook) — this component's refetch only refreshes itself.
    onSaved?.()
  }, [schoolId, periodId, projectionMethod, assumptions, feeder, rollForward, explanations, refetch, onSaved])

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
    return (
      <StatStrip cols={4} className="stats-compact">
        <Stat
          label="Projected students"
          value={Math.round(k.enrollmentTotal ?? 0)}
          title={isRollforward ? 'Rolled-forward roster + new entrants' : 'Base enrollment + feeder'}
        />
        <Stat label="Forecast revenue" value={statMoney(k.totalRevenue)} title="Total projected revenue" />
        <Stat label="Forecast expense" value={statMoney(k.totalExpense)} title="Total projected expense" />
        <Stat
          label="Net surplus / (deficit)"
          value={signed(k.netIncome)}
          status={!k.netIncome ? 'neutral' : k.netIncome > 0 ? 'good' : 'risk'}
          title="Forecast revenue − expense"
        />
      </StatStrip>
    )
  }

  const renderTable = () => (
    <Section
      label="Forecast vs. budget"
      className="!mt-0 min-w-0"
      aside={
        savedAt ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Clock size={12} aria-hidden="true" /> Saved{' '}
            {new Date(savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        ) : null
      }
    >
      <p className="mb-3 text-small text-ink2">
        Where the year lands under your revised assumptions, compared to the active budget. Add a comment
        per line for the board packet.
      </p>
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
    </Section>
  )

  // The save bar is the one raised surface here (an action): a Panel pinned to
  // the bottom of the viewport while the form scrolls — solid white, no glass.
  const renderSaveBar = () => (
    <div key="forecast-save-bar" className="panel sticky bottom-4 z-10">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">Save forecast</p>
          <p className="hidden text-small text-ink2 sm:block">
            Re-projects on the server and stores it for the board report. Your active budget is left
            unchanged.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!saving && saveError && (
            <span className="b2-callout py-1" data-tone="risk" role="alert">
              <AlertTriangle size={14} aria-hidden="true" /> {saveError}
            </span>
          )}
          {!saving && !saveError && !dirty && savedAt && (
            <span className="b2-callout py-1" data-tone="good" role="status">
              <CheckCircle2 size={14} aria-hidden="true" /> Saved
            </span>
          )}
          {!canEdit && (
            <span className="text-small italic text-ink2">View-only — owner/accountant can save.</span>
          )}
          <Button
            variant="primary"
            onClick={saveNow}
            disabled={!canEdit || !dirty || saving}
            icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          >
            {saving ? 'Saving…' : 'Save forecast'}
          </Button>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="b2-note" aria-busy="true">
        <p>Loading the forecast…</p>
      </div>
    )
  }

  return (
    <motion.div
      id="forecast-workspace"
      key="forecast"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex items-start gap-2.5">
        <TrendingUp size={18} aria-hidden="true" className="mt-1.5 shrink-0 text-ink2" />
        <div>
          <h3 className="font-serif text-title font-medium text-ink">Fiscal-year-end forecast</h3>
          <p className="mt-0.5 text-small text-ink2">
            {isRollforward
              ? 'Roll this year’s roster forward a grade with retention, add new entrants, then compare where the year lands to the budget you set.'
              : 'Revise your assumptions and add anticipated feeder students to project where the year lands — then compare it to the budget you set.'}
          </p>
        </div>
      </div>

      {!hasBaseBudget && (
        <p className="b2-callout" data-tone="watch">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            <strong>No base budget yet.</strong> Build a budget on the <em>Budget</em> tab first —
            until then there&rsquo;s nothing to compare against, so the variance columns stay blank.
          </span>
        </p>
      )}

      {projected == null && (
        <p className="b2-callout" data-tone="watch">
          <AlertTriangle size={14} aria-hidden="true" />
          Live preview pending — the compute engine is finishing integration. Your assumptions still
          re-project server-side on save.
        </p>
      )}

      {renderKpiStrip()}

      <MethodToggle
        projectionMethod={projectionMethod}
        onMethodChange={onMethodChange}
        disabled={!canEdit}
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        {/* id anchors Penny's "add your feeder students" glide. */}
        <div id="forecast-feeder-input" className="min-w-0 space-y-6">
          {isRollforward ? (
            <>
              <CurrentRosterGrid
                current={rollForward.currentByGrade}
                onChange={onCurrentRosterChange}
                onSeed={onSeedCurrentRoster}
                disabled={!canEdit}
              />
              <RetentionControl
                retentionPct={rollForward.retentionPct}
                retentionByGrade={rollForward.retentionByGrade}
                graduatingGrade={rollForward.graduatingGrade}
                onDefaultChange={onRetentionDefaultChange}
                onOverrideChange={onRetentionOverrideChange}
                onGraduatingChange={onGraduatingChange}
                disabled={!canEdit}
              />
              <FeederEnrollmentGrid
                feeder={feeder}
                onChange={onFeederChange}
                disabled={!canEdit}
                mode="rollforward"
              />
              <ProjectedRosterGrid
                effective={effective}
                overrides={rollForward.projectedOverrideByGrade}
                editingGrade={editingGrade}
                onStartEdit={setEditingGrade}
                onSetOverride={onProjectedOverrideChange}
                onClearOverride={onProjectedOverrideClear}
                disabled={!canEdit}
              />
              {/* enrollmentByGrade is DERIVED in roll-forward mode (the projected
                  roster drives tuition), so hide the manual enrollment grid and
                  keep only the rate / split / staffing / inflation assumptions. */}
              <DriverAssumptionsForm
                assumptions={assumptions}
                onChange={onAssumptionsChange}
                disabled={!canEdit}
                sections={['tuition', 'split', 'staffing', 'inflation']}
              />
            </>
          ) : (
            <>
              <FeederEnrollmentGrid feeder={feeder} onChange={onFeederChange} disabled={!canEdit} />
              <DriverAssumptionsForm assumptions={assumptions} onChange={onAssumptionsChange} disabled={!canEdit} />
            </>
          )}
        </div>
        <div className="min-w-0">{renderTable()}</div>
      </div>

      {renderSaveBar()}

      {feederTotal > 0 && (
        <p className="text-[12px] text-ink2">
          {isRollforward ? (
            <>
              {feederTotal} new entrant{feederTotal === 1 ? '' : 's'} included in the projected roster
              of {(projected?.kpis?.enrollmentTotal ?? 0).toLocaleString('en-US')} student
              {(projected?.kpis?.enrollmentTotal ?? 0) === 1 ? '' : 's'}.
            </>
          ) : (
            <>
              {feederTotal} anticipated feeder student{feederTotal === 1 ? '' : 's'} added on top of
              your projected enrollment (
              {(projected?.kpis?.enrollmentTotal ?? 0).toLocaleString('en-US')} total).
            </>
          )}
        </p>
      )}
    </motion.div>
  )
}
