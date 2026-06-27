// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Capital Budget Summary editor. A user-maintained list of capital
// projects grouped into Prior-Year Rollover / Construction and Current-Year
// Capital Expenditures. Each line: label · Actual YTD · Budget · Over(Under)
// (derived live in the editor as a preview only) · Comment. Add / remove /
// reorder rows; per-group sub-tables.
//
// AUTOSAVE INVARIANT (mirrors ForecastWorkspace EXACTLY — do not deviate, this
// is the no-op-PUT bug-fix): we build ONE normalized baseline object on seed and
// feed it to BOTH the `rows` state seed AND setBaseline(JSON.stringify(...)).
// `dirty` is a pure render derivation (draftKey !== baseline). Simply opening the
// tab therefore writes nothing — the serialized draft equals the serialized
// baseline byte-for-byte.
//
// SOURCE OF TRUTH: the server normalizes + computes all over-under/subtotals for
// the board packet on its own (assemble). The Over(Under) shown here is a LOCAL
// PREVIEW only (actual − budget) so the editor reads naturally; zero of it is
// sent or relied upon.
//
// React-Compiler safety: hooks at top level; row/header/add-button components at
// MODULE scope (no in-render component defs); the seed runs in the established
// microtask-deferred sync-on-key effect (no synchronous setState in the body).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Landmark,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { useCapitalSchedule } from '../../../hooks/useSchedules.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { schedulesApi } from '../../../lib/api.js'
import { CAPITAL_GROUPS, CAPITAL_GROUP_LABELS } from './scheduleEnums.js'

// Stable id for a fresh row (client-generated; round-trips for React keys).
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Normalize a stored/echoed item into the editor's canonical shape. The SAME
// normalizer feeds both the state seed and the autosave baseline, so a fresh
// open is never dirty.
function normalizeItems(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((it) => ({
    id: typeof it?.id === 'string' && it.id ? it.id : newId(),
    group: CAPITAL_GROUPS.includes(it?.group) ? it.group : 'current',
    label: typeof it?.label === 'string' ? it.label : '',
    actual: toNum(it?.actual),
    budget: toNum(it?.budget),
    comment: typeof it?.comment === 'string' ? it.comment : '',
  }))
}

// Money preview (whole-dollar accounting; negatives in parentheses).
function money(n) {
  const r = Math.round(toNum(n))
  const s = Math.abs(r).toLocaleString('en-US')
  return r < 0 ? `(${s})` : s
}

// ── Editable project row (module scope) ──────────────────────────────────────
function CapitalRow({ row, index, count, disabled, onChange, onRemove, onMove }) {
  const over = toNum(row.actual) - toNum(row.budget)
  return (
    <tr className="border-t border-rule/50 hover:bg-gold/[0.04]">
      <td className="px-2 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.label}
          placeholder={disabled ? '' : 'Project name…'}
          onChange={(e) => onChange(row.id, 'label', e.target.value.slice(0, 200))}
          className="w-full min-w-[160px] rounded-md border border-rule bg-white px-2 py-1 text-[12.5px] text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          disabled={disabled}
          value={row.actual}
          onChange={(e) => onChange(row.id, 'actual', toNum(e.target.value))}
          className="w-[110px] rounded-md border border-rule bg-white px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          disabled={disabled}
          value={row.budget}
          onChange={(e) => onChange(row.id, 'budget', toNum(e.target.value))}
          className="w-[110px] rounded-md border border-rule bg-white px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
        />
      </td>
      <td
        className={`px-2 py-1.5 text-right text-[12.5px] tabular-nums ${
          over < 0 ? 'text-emerald-600' : over > 0 ? 'text-rose-600' : 'text-muted'
        }`}
      >
        {money(over)}
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.comment}
          placeholder={disabled ? '' : 'Comment…'}
          onChange={(e) => onChange(row.id, 'comment', e.target.value.slice(0, 500))}
          className="w-full min-w-[140px] rounded-md border border-rule bg-white px-2 py-1 text-[12px] text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50"
        />
      </td>
      <td className="px-2 py-1.5">
        {!disabled && (
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => onMove(row.id, -1)}
              disabled={index === 0}
              title="Move up"
              className="rounded p-1 text-muted hover:bg-navy/[0.06] hover:text-navy disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMove(row.id, 1)}
              disabled={index === count - 1}
              title="Move down"
              className="rounded p-1 text-muted hover:bg-navy/[0.06] hover:text-navy disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              title="Remove project"
              className="rounded p-1 text-muted hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Group subtotal row (module scope) ────────────────────────────────────────
function SubtotalRow({ actual, budget }) {
  const over = toNum(actual) - toNum(budget)
  return (
    <tr className="border-t border-rule bg-cream/60">
      <td className="px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-navy">
        Subtotal
      </td>
      <td className="px-2 py-2 text-right text-[13px] font-semibold tabular-nums text-navy">
        {money(actual)}
      </td>
      <td className="px-2 py-2 text-right text-[13px] tabular-nums text-muted">{money(budget)}</td>
      <td
        className={`px-2 py-2 text-right text-[13px] font-semibold tabular-nums ${
          over < 0 ? 'text-emerald-600' : over > 0 ? 'text-rose-600' : 'text-navy'
        }`}
      >
        {money(over)}
      </td>
      <td />
      <td />
    </tr>
  )
}

// ── Add-row button (module scope) ────────────────────────────────────────────
function AddRowButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold/50 bg-gold/[0.04] px-3 py-1.5 text-[12.5px] font-semibold text-gold transition-colors hover:bg-gold/10"
    >
      <Plus size={14} /> {label}
    </button>
  )
}

export default function CapitalScheduleWorkspace({ schoolId, periodId, canEdit }) {
  const { items: savedItems, updatedAt, loading, refetch } = useCapitalSchedule(schoolId, periodId)

  const [rows, setRows] = useState([])
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)
  const touchedRef = useRef(false)
  const [baseline, setBaseline] = useState('')

  const draftKey = useMemo(() => JSON.stringify(rows), [rows])

  // Seed / re-seed on key change OR when saved data first arrives, while pristine.
  // Microtask-deferred. ONE normalized object feeds the rows seed AND the
  // baseline so a fresh open is never dirty.
  useEffect(() => {
    let cancelled = false
    const key = `${schoolId}:${periodId}`
    Promise.resolve().then(() => {
      if (cancelled) return
      const seed = () => {
        const norm = normalizeItems(savedItems)
        setRows(norm)
        setBaseline(JSON.stringify(norm))
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
  }, [schoolId, periodId, savedItems, loading])

  const onChange = useCallback((id, field, value) => {
    touchedRef.current = true
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }, [])

  const onAdd = useCallback((group) => {
    touchedRef.current = true
    setRows((cur) => [
      ...cur,
      { id: newId(), group, label: '', actual: 0, budget: 0, comment: '' },
    ])
  }, [])

  const onRemove = useCallback((id) => {
    touchedRef.current = true
    setRows((cur) => cur.filter((r) => r.id !== id))
  }, [])

  // Reorder WITHIN a group (preserve global order otherwise) by swapping the
  // moved row with its in-group neighbor in the flat array.
  const onMove = useCallback((id, dir) => {
    touchedRef.current = true
    setRows((cur) => {
      const idx = cur.findIndex((r) => r.id === id)
      if (idx < 0) return cur
      const group = cur[idx].group
      // Find the neighbor index in the same group in the requested direction.
      let j = idx + dir
      while (j >= 0 && j < cur.length && cur[j].group !== group) j += dir
      if (j < 0 || j >= cur.length) return cur
      const next = cur.slice()
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }, [])

  const dirty = canEdit && baseline !== '' && draftKey !== baseline

  const doSave = useCallback(async () => {
    if (!schoolId || !periodId) return
    const body = {
      items: rows.map((r) => ({
        id: r.id,
        group: r.group,
        label: r.label,
        actual: toNum(r.actual),
        budget: toNum(r.budget),
        comment: r.comment ?? '',
      })),
    }
    await schedulesApi.saveCapital(schoolId, periodId, body)
    await refetch()
    setBaseline(JSON.stringify(rows))
  }, [schoolId, periodId, rows, refetch])

  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: draftKey,
    save: doSave,
  })

  // Group rows for the per-group sub-tables (canonical enum order).
  const byGroup = useMemo(() => {
    const map = { rollover: [], current: [] }
    for (const r of rows) (map[r.group] || (map[r.group] = [])).push(r)
    return map
  }, [rows])

  const grand = useMemo(() => {
    let actual = 0
    let budget = 0
    for (const r of rows) {
      actual += toNum(r.actual)
      budget += toNum(r.budget)
    }
    return { actual, budget }
  }, [rows])

  if (loading) {
    return (
      <div className="card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">Loading the capital budget…</p>
      </div>
    )
  }

  const renderGroup = (group) => {
    const groupRows = byGroup[group] || []
    let subA = 0
    let subB = 0
    for (const r of groupRows) {
      subA += toNum(r.actual)
      subB += toNum(r.budget)
    }
    return (
      <div key={group} className="card-soft overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-navy-gradient px-4 py-2.5">
          <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-gold-light">
            {CAPITAL_GROUP_LABELS[group]}
          </h4>
          {canEdit && <AddRowButton onClick={() => onAdd(group)} label="Add project" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Project
                </th>
                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Actual YTD
                </th>
                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Budget
                </th>
                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Over (Under)
                </th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">
                  Comment
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {groupRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[12.5px] italic text-muted">
                    No capital projects yet — add one.
                  </td>
                </tr>
              ) : (
                groupRows.map((r, i) => (
                  <CapitalRow
                    key={r.id}
                    row={r}
                    index={i}
                    count={groupRows.length}
                    disabled={!canEdit}
                    onChange={onChange}
                    onRemove={onRemove}
                    onMove={onMove}
                  />
                ))
              )}
              {groupRows.length > 0 && <SubtotalRow actual={subA} budget={subB} />}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      key="capital"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <Landmark size={20} />
        </span>
        <div className="flex-1">
          <h3 className="font-serif text-lg font-semibold text-navy">Capital Budget Summary</h3>
          <p className="text-[13px] text-muted">
            Track capital projects against budget. These flow into the Capital Budget section of your
            board packet — over/(under) and totals are computed there.
          </p>
        </div>
        {updatedAt && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/[0.06] px-2.5 py-1 text-[11px] font-medium text-muted">
            <Clock size={12} /> Saved{' '}
            {new Date(updatedAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {CAPITAL_GROUPS.map((g) => renderGroup(g))}

      <div className="card-soft flex flex-wrap items-center justify-between gap-3 border-gold/40 bg-gold/[0.06] px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
          Total Capital
        </span>
        <div className="flex items-center gap-6 text-[14px] tabular-nums">
          <span className="text-navy">
            <span className="mr-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">Actual</span>
            <span className="font-semibold">{money(grand.actual)}</span>
          </span>
          <span className="text-muted">
            <span className="mr-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">Budget</span>
            {money(grand.budget)}
          </span>
          <span
            className={`font-semibold ${
              grand.actual - grand.budget < 0
                ? 'text-emerald-600'
                : grand.actual - grand.budget > 0
                  ? 'text-rose-600'
                  : 'text-navy'
            }`}
          >
            <span className="mr-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">
              Over (Under)
            </span>
            {money(grand.actual - grand.budget)}
          </span>
        </div>
      </div>

      <ScheduleSaveBar
        canEdit={canEdit}
        saving={saving}
        saveError={saveError}
        dirty={dirty}
        savedAt={updatedAt}
        onSave={saveNow}
        label="capital budget"
      />
    </motion.div>
  )
}

// Shared save bar (module scope) — reused by both schedule workspaces.
export function ScheduleSaveBar({ canEdit, saving, saveError, dirty, savedAt, onSave, label }) {
  return (
    <div
      key="schedule-save-bar"
      className="card-soft sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 border-gold/40 bg-white/95 p-4 shadow-glow backdrop-blur"
    >
      <div>
        <p className="font-serif text-[15px] font-semibold text-navy">Save {label}</p>
        <p className="text-[12px] text-muted">
          Autosaves as you edit. The next board report will include the updated section.
        </p>
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
          onClick={onSave}
          disabled={!canEdit || !dirty || saving}
          className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={16} /> Save
            </>
          )}
        </button>
      </div>
    </div>
  )
}
