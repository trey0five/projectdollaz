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
import { motion, useReducedMotion } from 'framer-motion'
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
import { Section, StatStrip, Stat, Pill, Button } from '../../ui/surface/index.js'
import '../../../styles/pending/b2-finance.css'
import { statMoney, signedMoney } from '../../budget/StatFigure.jsx'

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
    <tr>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.label}
          placeholder={disabled ? '' : 'Project name…'}
          onChange={(e) => onChange(row.id, 'label', e.target.value.slice(0, 200))}
          className="w-full min-w-[160px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-[12.5px] text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <td className="py-1">
        <input
          type="number"
          disabled={disabled}
          value={row.actual}
          onChange={(e) => onChange(row.id, 'actual', toNum(e.target.value))}
          className="w-[110px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <td className="py-1">
        <input
          type="number"
          disabled={disabled}
          value={row.budget}
          onChange={(e) => onChange(row.id, 'budget', toNum(e.target.value))}
          className="w-[110px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <OverCell over={over} />
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.comment}
          placeholder={disabled ? '' : 'Comment…'}
          onChange={(e) => onChange(row.id, 'comment', e.target.value.slice(0, 500))}
          className="w-full min-w-[140px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-[12px] text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <td className="py-1">
        {!disabled && (
          <div className="dt-actions flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => onMove(row.id, -1)}
              disabled={index === 0}
              title="Move up"
              className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMove(row.id, 1)}
              disabled={index === count - 1}
              title="Move down"
              className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              title="Remove project"
              className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// Over (Under) preview: ink figure + a 2px mark (under budget = good, over = risk).
function OverCell({ over, bold }) {
  const tone = over < 0 ? 'good' : over > 0 ? 'risk' : null
  return (
    <td className={`dt-num whitespace-nowrap ${bold ? 'font-semibold' : ''}`}>
      {tone ? <i className={`mark tone-${tone} mr-1.5`} aria-label={tone === 'good' ? 'under budget' : 'over budget'} /> : null}
      {money(over)}
    </td>
  )
}

// ── Group subtotal row (module scope) ────────────────────────────────────────
function SubtotalRow({ actual, budget }) {
  const over = toNum(actual) - toNum(budget)
  return (
    <tr className="dt-subtotal">
      <td className="text-[11px] font-semibold uppercase tracking-[0.06em]">Subtotal</td>
      <td className="dt-num font-semibold">{money(actual)}</td>
      <td className="dt-num text-ink2">{money(budget)}</td>
      <OverCell over={over} bold />
      <td />
      <td />
    </tr>
  )
}

// ── Add-row button (module scope) ────────────────────────────────────────────
export function AddRowButton({ onClick, label }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} icon={<Plus size={13} />}>
      {label}
    </Button>
  )
}

export default function CapitalScheduleWorkspace({ schoolId, periodId, canEdit }) {
  const reduce = useReducedMotion()
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
      <div className="b2-note" aria-busy="true">
        <p>Loading the capital budget…</p>
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
      <Section
        key={group}
        label={CAPITAL_GROUP_LABELS[group]}
        aside={canEdit ? <AddRowButton onClick={() => onAdd(group)} label="Add project" /> : null}
      >
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col" className="dt-num">Actual YTD</th>
                <th scope="col" className="dt-num">Budget</th>
                <th scope="col" className="dt-num">Over (Under)</th>
                <th scope="col">Comment</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {groupRows.length === 0 ? (
                <tr className="dt-empty">
                  <td colSpan={6}>No capital projects yet — add one.</td>
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
      </Section>
    )
  }

  const grandOver = grand.actual - grand.budget
  return (
    <motion.div
      key="capital"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <ScheduleHeading
        icon={Landmark}
        title="Capital Budget Summary"
        savedAt={updatedAt}
        body="Track capital projects against budget. These flow into the Capital Budget section of your board packet — over/(under) and totals are computed there."
      />

      {CAPITAL_GROUPS.map((g) => renderGroup(g))}

      <Section label="Total capital">
        <StatStrip cols={3} className="stats-compact">
          <Stat label="Actual" value={statMoney(grand.actual)} />
          <Stat label="Budget" value={statMoney(grand.budget)} />
          <Stat
            label="Over (Under)"
            value={signedMoney(grandOver)}
            status={grandOver < 0 ? 'good' : grandOver > 0 ? 'risk' : undefined}
          />
        </StatStrip>
      </Section>

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

// The schedule's own heading (module scope, shared by the three workspaces):
// an icon stroke, the title in Garamond, the explainer, the "Saved …" Pill.
export function ScheduleHeading({ icon: Icon, title, body, savedAt }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      {Icon ? <Icon size={18} aria-hidden="true" className="mt-1.5 shrink-0 text-ink2" /> : null}
      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-title font-medium text-ink">{title}</h3>
        <p className="mt-0.5 max-w-3xl text-small text-ink2">{body}</p>
      </div>
      {savedAt && (
        <Pill>
          <Clock size={11} aria-hidden="true" /> Saved{' '}
          {new Date(savedAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Pill>
      )}
    </div>
  )
}

// Shared save bar (module scope) — reused by the schedule workspaces. The one
// raised surface here (an action): a Panel pinned to the viewport bottom while
// the sheet scrolls — solid white, no glass.
export function ScheduleSaveBar({ canEdit, saving, saveError, dirty, savedAt, onSave, label }) {
  return (
    <div key="schedule-save-bar" className="panel sticky bottom-4 z-10 mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">Save {label}</p>
          <p className="hidden text-small text-ink2 sm:block">
            Autosaves as you edit. The next board report will include the updated section.
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
            onClick={onSave}
            disabled={!canEdit || !dirty || saving}
            icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
