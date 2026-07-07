// ─────────────────────────────────────────────────────────────────────────────
// useStrategy — Phase 5 Strategic Planning v1 (the plans → pillars → goals →
// initiatives register + the COMPUTED self-measuring progress spine).
//
// Two hooks, same await-BEFORE-setState pattern as useAdvancement (microtask
// defer + a `cancelled` flag) so both are react-hooks/set-state-in-effect safe,
// both flip `notLicensed` on the module 402 (MODULE_NOT_LICENSED) so a school
// without the module sees a friendly panel, and both re-pull on Penny's
// `penny:data-changed` keyed 'strategy'.
//
//   useStrategyPlan(schoolId)  — the LIGHT computed hook (GET active/progress).
//                                Powers the hero + goal/pillar cards + KPIs.
//   useStrategy(schoolId)      — the register hook: the computed payload PLUS the
//                                raw editable tree (for the full initiative list +
//                                CRUD) + every write mutator. Returns the shape
//                                { plan, pillars, goals, initiatives, summary,
//                                  hasPlan, loading, error, notLicensed, refresh, … }.
//
// Everything the flashy surfaces read comes from the FROZEN computed payload
// (fractions 0..1). The raw tree is only used to enumerate initiatives for the
// Initiatives tab + resolve ids for edits; it is fetched in its own try/catch so a
// shape surprise degrades to "no initiatives" rather than blanking the page.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { strategyApi, schoolsApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

// ── The bindable metric catalog (mirror of the semantic registry's bindable keys;
// revenue_mix / expense_mix are deliberately excluded — they are not scalar). unit
// drives the GoalForm target input: a 'percent' metric is entered in its natural
// display unit (8.5 = 8.5%) and stored as the 0..1 fraction the API expects. ────
export const METRIC_CATALOG = {
  days_cash_on_hand: { label: 'Days Cash on Hand', unit: 'days' },
  operating_margin: { label: 'Operating Margin', unit: 'percent' },
  tuition_discount_rate: { label: 'Tuition Discount Rate', unit: 'percent' },
  net_tuition_per_student: { label: 'Net Tuition per Student', unit: 'currency' },
  months_operating_reserve: { label: 'Months of Operating Reserve', unit: 'months' },
  enrollment: { label: 'Enrollment', unit: 'count' },
  enrollment_change_yoy: { label: 'Enrollment Change (YoY)', unit: 'percent' },
  student_teacher_ratio: { label: 'Student–Teacher Ratio', unit: 'ratio' },
  cost_per_pupil: { label: 'Cost per Pupil', unit: 'currency' },
  tuition_dependency: { label: 'Tuition Dependency', unit: 'percent' },
  pct_students_on_aid: { label: '% Students on Aid', unit: 'percent' },
  financial_aid_per_student: { label: 'Financial Aid per Student', unit: 'currency' },
  aid_per_aided_student: { label: 'Aid per Aided Student', unit: 'currency' },
}

/** Ordered [key, label] pairs for the metric-binding <Select>. */
export const METRIC_OPTIONS = Object.entries(METRIC_CATALOG).map(([key, m]) => ({
  key,
  label: m.label,
}))

/** Is the metric entered/displayed in percent (stored as a 0..1 fraction)? */
export function isPercentMetric(metricKey) {
  return METRIC_CATALOG[metricKey]?.unit === 'percent'
}

const EMPTY_SUMMARY = {
  overallProgressPct: 0,
  overallPaceStatus: 'no_data',
  behindPaceGoalCount: 0,
  atRiskGoalCount: 0,
  staleInitiativeCount: 0,
  reviewDueThisMonth: false,
  nextReviewDate: null,
  behindPaceGoals: [],
  staleInitiatives: [],
}

// Flatten computed pillars → a goal list, each stamped with its pillar for the
// Goals tab / needs-attention scroll targeting.
function flattenGoals(pillars) {
  const out = []
  for (const p of pillars ?? []) {
    for (const g of p.goals ?? []) {
      out.push({ ...g, pillarId: p.id, pillarName: p.name })
    }
  }
  return out
}

// Flatten the RAW plan tree → an initiative list. Defensive: the raw tree shape is
// the CRUD shape (not the frozen computed one), so read every field with a
// fallback and never throw.
function flattenInitiatives(rawPlan) {
  const out = []
  for (const p of rawPlan?.pillars ?? []) {
    for (const g of p.goals ?? []) {
      for (const it of g.initiatives ?? []) {
        out.push({
          id: it.id,
          title: it.title ?? 'Untitled initiative',
          status: it.status ?? 'planned',
          ownerUserId: it.ownerUserId ?? null,
          ownerName: it.owner?.name ?? it.ownerName ?? null,
          updatedAt: it.updatedAt ?? null,
          linkedTaskCounts: it.linkedTaskCounts ?? null,
          goalId: g.id,
          goalTitle: g.title,
          pillarName: p.name,
        })
      }
    }
  }
  return out
}

// Merge summary.staleInitiatives (the frozen source of truth for staleness) onto
// the raw initiative list by title, so an InitiativeRow can show the amber badge +
// exact staleDays even though the raw tree doesn't compute staleness.
function decorateStale(initiatives, staleList) {
  if (!staleList?.length) return initiatives
  const byTitle = new Map(staleList.map((s) => [s.title, s]))
  return initiatives.map((it) => {
    const s = byTitle.get(it.title)
    // Take staleDays from the computed summary; fall back to its ownerName only when
    // the raw tree didn't carry one (the raw serializer now emits ownerName directly).
    return s ? { ...it, staleDays: s.staleDays, ownerName: it.ownerName ?? s.ownerName ?? null } : it
  })
}

// ═══════════════════════════ useStrategyPlan (computed) ═════════════════════════
export function useStrategyPlan(schoolId) {
  const [data, setData] = useState(null) // the whole computed payload, or null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    try {
      const res = await strategyApi.getActiveProgress(sid)
      setData(res.data?.hasPlan ? res.data : { hasPlan: false })
    } catch (e) {
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else setError('Could not load your strategic plan.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const refresh = useCallback(
    () => (schoolId ? load(schoolId) : Promise.resolve()),
    [schoolId, load],
  )

  useEffect(() => {
    const onChanged = (e) => {
      if (e?.detail?.key === 'strategy') refresh()
    }
    window.addEventListener('penny:data-changed', onChanged)
    return () => window.removeEventListener('penny:data-changed', onChanged)
  }, [refresh])

  const hasPlan = !!data?.hasPlan
  return {
    data: hasPlan ? data : null,
    plan: hasPlan ? data.plan : null,
    pillars: hasPlan ? data.pillars ?? [] : [],
    summary: hasPlan ? data.summary ?? EMPTY_SUMMARY : EMPTY_SUMMARY,
    hasPlan,
    loading,
    error,
    notLicensed,
    refresh,
  }
}

// ═══════════════════════════ useStrategy (register + CRUD) ══════════════════════
export function useStrategy(schoolId) {
  const [data, setData] = useState(null) // computed payload
  const [initiatives, setInitiatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [members, setMembers] = useState([]) // owner-picker roster (editors only; viewers get [])

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await strategyApi.getActiveProgress(sid)
      const payload = res.data?.hasPlan ? res.data : { hasPlan: false }
      setData(payload)
      // Enrich with the raw editable tree (full initiative list). Its own guard so a
      // shape surprise never blanks the flashy computed surfaces.
      if (payload.hasPlan && payload.plan?.id) {
        try {
          const raw = await strategyApi.getPlan(sid, payload.plan.id)
          setInitiatives(
            decorateStale(flattenInitiatives(raw.data), payload.summary?.staleInitiatives),
          )
        } catch {
          setInitiatives([])
        }
      } else {
        setInitiatives([])
      }
    } catch (e) {
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError('Could not load your strategic plan.')
      setData(null)
      setInitiatives([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setData(null)
        setInitiatives([])
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const refresh = useCallback(
    () => (schoolId ? load(schoolId) : Promise.resolve()),
    [schoolId, load],
  )

  useEffect(() => {
    const onChanged = (e) => {
      if (e?.detail?.key === 'strategy') refresh()
    }
    window.addEventListener('penny:data-changed', onChanged)
    return () => window.removeEventListener('penny:data-changed', onChanged)
  }, [refresh])

  // Owner-picker roster. The endpoint is editor-only; a viewer 403s → keep []
  // (the forms simply omit the Owner picker), so this never blocks the page.
  useEffect(() => {
    let cancelled = false
    // Microtask-defer (matches the load effects above) so no setState runs
    // synchronously inside the effect body.
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!schoolId) {
        setMembers([])
        return
      }
      schoolsApi
        .members(schoolId)
        .then((res) => {
          if (!cancelled) setMembers(Array.isArray(res.data) ? res.data : (res.data?.members ?? []))
        })
        .catch(() => {
          if (!cancelled) setMembers([])
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  // ── Write mutators — each awaits the write THEN reloads so the computed rollups
  // (pace, progress arc, KPIs) update without a manual refresh. ────────────────
  const hasPlan = !!data?.hasPlan
  const activePlanId = hasPlan ? data.plan?.id : null

  const mutate = useCallback(
    (fn) => async (...args) => {
      if (!schoolId) return undefined
      const r = await fn(...args)
      await load(schoolId)
      return r
    },
    [schoolId, load],
  )

  const createPlan = mutate((body) => strategyApi.createPlan(schoolId, body))
  const updatePlan = mutate((planId, body) => strategyApi.updatePlan(schoolId, planId, body))
  const deletePlan = mutate((planId) => strategyApi.deletePlan(schoolId, planId))
  const createPillar = mutate((planId, body) => strategyApi.createPillar(schoolId, planId, body))
  const updatePillar = mutate((pillarId, body) => strategyApi.updatePillar(schoolId, pillarId, body))
  const deletePillar = mutate((pillarId) => strategyApi.deletePillar(schoolId, pillarId))
  const createGoal = mutate((pillarId, body) => strategyApi.createGoal(schoolId, pillarId, body))
  const updateGoal = mutate((goalId, body) => strategyApi.updateGoal(schoolId, goalId, body))
  const deleteGoal = mutate((goalId) => strategyApi.deleteGoal(schoolId, goalId))
  const rebaselineGoal = mutate((goalId) => strategyApi.rebaselineGoal(schoolId, goalId))
  const createInitiative = mutate((goalId, body) =>
    strategyApi.createInitiative(schoolId, goalId, body),
  )
  const updateInitiative = mutate((initiativeId, body) =>
    strategyApi.updateInitiative(schoolId, initiativeId, body),
  )
  const deleteInitiative = mutate((initiativeId) =>
    strategyApi.deleteInitiative(schoolId, initiativeId),
  )

  return {
    data: hasPlan ? data : null,
    plan: hasPlan ? data.plan : null,
    pillars: hasPlan ? data.pillars ?? [] : [],
    goals: hasPlan ? flattenGoals(data.pillars) : [],
    initiatives,
    members,
    summary: hasPlan ? data.summary ?? EMPTY_SUMMARY : EMPTY_SUMMARY,
    hasPlan,
    activePlanId,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    createPlan,
    updatePlan,
    deletePlan,
    createPillar,
    updatePillar,
    deletePillar,
    createGoal,
    updateGoal,
    deleteGoal,
    rebaselineGoal,
    createInitiative,
    updateInitiative,
    deleteInitiative,
  }
}
