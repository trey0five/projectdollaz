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
import { effectiveEnrollment, gradeGridTotal } from '../../lib/mergeFeeder.js'
import DriverAssumptionsForm from './DriverAssumptionsForm.jsx'
import FeederEnrollmentGrid from './FeederEnrollmentGrid.jsx'
import MethodToggle from './MethodToggle.jsx'
import CurrentRosterGrid, { seedCurrentRoster } from './CurrentRosterGrid.jsx'
import RetentionControl from './RetentionControl.jsx'
import ProjectedRosterGrid from './ProjectedRosterGrid.jsx'
import { seedAssumptions, toDriverPriorContext, GRADE_ROW } from './driverModel.js'

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
  }, [schoolId, periodId, projectionMethod, assumptions, feeder, rollForward, explanations, refetch])

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
      {
        label: 'Projected students',
        value: (k.enrollmentTotal ?? 0).toLocaleString('en-US'),
        hint: isRollforward ? 'Rolled-forward roster + new entrants' : 'Base enrollment + feeder',
      },
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
      id="forecast-workspace"
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
            {isRollforward
              ? 'Roll this year’s roster forward a grade with retention, add new entrants, then compare where the year lands to the budget you set.'
              : 'Revise your assumptions and add anticipated feeder students to project where the year lands — then compare it to the budget you set.'}
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

      <MethodToggle
        projectionMethod={projectionMethod}
        onMethodChange={onMethodChange}
        disabled={!canEdit}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
        {/* id anchors Penny's "add your feeder students" glide. */}
        <div id="forecast-feeder-input" className="space-y-4">
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
        <div className="space-y-4">{renderTable()}</div>
      </div>

      {renderSaveBar()}

      {feederTotal > 0 && (
        <p className="text-[12px] text-muted">
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
