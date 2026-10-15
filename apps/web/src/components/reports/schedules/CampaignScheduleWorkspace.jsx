// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Capital Campaign tracker editor. A user-maintained list of campaign
// line items grouped into FREE-TEXT divisions (e.g. "Upper Division", "Middle
// Division", "Fundraising"). Each line: label · Budget · Estimate · Difference
// to Budget (derived live as a preview only) · Comment. A top-level campaign name
// sits above the groups. Add / remove / reorder rows; per-group sub-tables; the
// "Add division" button appends a new empty-named group.
//
// CLEAN MIRROR of CapitalScheduleWorkspace with three deliberate deltas:
//   (1) group is FREE TEXT — groups are discovered from data in FIRST-SEEN order,
//       not iterated over a constant; each group header is an editable input that
//       renames every row in that group.
//   (2) a top-level campaignName that participates in the autosave baseline.
//   (3) difference = budget − estimate (NBOA "Difference to Budget"); positive =
//       UNDER budget = FAVORABLE, so the sign coloring is INVERTED vs capital's
//       overUnder = actual − budget (diff>0 → good mark, diff<0 → risk mark).
//
// AUTOSAVE INVARIANT (mirrors CapitalScheduleWorkspace EXACTLY — this is the
// no-op-PUT bug-fix): ONE normalized object spanning BOTH campaignName AND rows
// feeds the state seed AND setBaseline(JSON.stringify(...)). `dirty` is a pure
// render derivation (draftKey !== baseline). Simply opening the tab therefore
// writes nothing — the serialized draft equals the serialized baseline
// byte-for-byte. group is trimmed consistently on BOTH seed and save so the
// round-trip is byte-identical.
//
// SOURCE OF TRUTH: the server normalizes + computes all differences/subtotals for
// the board packet on its own (assemble). The Difference shown here is a LOCAL
// PREVIEW only (budget − estimate) so the editor reads naturally; zero of it is
// sent or relied upon.
//
// React-Compiler safety: hooks at top level; row/header/add-button components at
// MODULE scope (no in-render component defs); the seed runs in the established
// microtask-deferred sync-on-key effect (no synchronous setState in the body).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Target, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { useCampaignSchedule } from '../../../hooks/useSchedules.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { schedulesApi } from '../../../lib/api.js'
import { CAMPAIGN_GROUP_SUGGESTIONS } from './scheduleEnums.js'
import { ScheduleSaveBar, ScheduleHeading, AddRowButton } from './CapitalScheduleWorkspace.jsx'
import { Section, StatStrip, Stat } from '../../ui/surface/index.js'
import { statMoney, signedMoney } from '../../budget/StatFigure.jsx'

// Stable datalist id for the free-text group suggestions.
const GROUP_DATALIST_ID = 'campaign-group-suggestions'

// Stable id for a fresh row (client-generated; round-trips for React keys).
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Clamp a money input at 0 — the server validates budget/estimate @Min(0), so a
// negative would 400 the PUT.
const toMoney = (v) => Math.max(0, toNum(v))

// Normalize a stored/echoed item into the editor's canonical shape. The SAME
// normalizer feeds both the state seed and the autosave baseline, so a fresh
// open is never dirty. group is FREE TEXT (no enum clamp) but TRIMMED so the
// baseline and a re-save agree byte-for-byte.
function normalizeItems(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((it) => ({
    id: typeof it?.id === 'string' && it.id ? it.id : newId(),
    group: typeof it?.group === 'string' ? it.group.trim() : '',
    label: typeof it?.label === 'string' ? it.label : '',
    budget: toMoney(it?.budget),
    estimate: toMoney(it?.estimate),
    comment: typeof it?.comment === 'string' ? it.comment : '',
  }))
}

// Money preview (whole-dollar accounting; negatives in parentheses).
function money(n) {
  const r = Math.round(toNum(n))
  const s = Math.abs(r).toLocaleString('en-US')
  return r < 0 ? `(${s})` : s
}

// Difference tone: INVERTED vs capital. diff>0 (under budget / favorable) is
// good; diff<0 (over budget) is risk; 0 carries no mark. A 2px mark beside the
// ink figure — never coloured text.
function diffTone(diff) {
  if (diff > 0) return 'good'
  if (diff < 0) return 'risk'
  return null
}
function DiffCell({ diff, bold }) {
  const tone = diffTone(diff)
  return (
    <td className={`dt-num whitespace-nowrap ${bold ? 'font-semibold' : ''}`}>
      {tone ? <i className={`mark tone-${tone} mr-1.5`} aria-label={tone === 'good' ? 'under budget' : 'over budget'} /> : null}
      {money(diff)}
    </td>
  )
}

// ── Editable campaign row (module scope) ─────────────────────────────────────
function CampaignRow({ row, index, count, disabled, onChange, onRemove, onMove }) {
  const diff = toNum(row.budget) - toNum(row.estimate)
  return (
    <tr>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.label}
          placeholder={disabled ? '' : 'Line item…'}
          onChange={(e) => onChange(row.id, 'label', e.target.value.slice(0, 200))}
          className="w-full min-w-[160px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-[12.5px] text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <td className="py-1">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.budget}
          onChange={(e) => onChange(row.id, 'budget', toMoney(e.target.value))}
          className="w-[110px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <td className="py-1">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.estimate}
          onChange={(e) => onChange(row.id, 'estimate', toMoney(e.target.value))}
          className="w-[110px] rounded-[4px] border border-hair/[0.18] bg-white px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50"
        />
      </td>
      <DiffCell diff={diff} />
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
              title="Remove line"
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

// ── Group subtotal row (module scope) ────────────────────────────────────────
function SubtotalRow({ budget, estimate }) {
  const diff = toNum(budget) - toNum(estimate)
  return (
    <tr className="dt-subtotal">
      <td className="text-[11px] font-semibold uppercase tracking-[0.06em]">Subtotal</td>
      <td className="dt-num font-semibold">{money(budget)}</td>
      <td className="dt-num text-ink2">{money(estimate)}</td>
      <DiffCell diff={diff} bold />
      <td />
      <td />
    </tr>
  )
}

export default function CampaignScheduleWorkspace({ schoolId, periodId, canEdit }) {
  const reduce = useReducedMotion()
  const {
    campaignName: savedName,
    items: savedItems,
    updatedAt,
    loading,
    refetch,
  } = useCampaignSchedule(schoolId, periodId)

  const [rows, setRows] = useState([])
  const [campaignName, setCampaignName] = useState('')
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)
  const touchedRef = useRef(false)
  const [baseline, setBaseline] = useState('')

  // ONE draft key spanning BOTH the campaign name AND the rows — the campaign
  // name participates in the autosave baseline, so renaming the campaign is a
  // dirtying change and opening writes nothing.
  const draftKey = useMemo(
    () => JSON.stringify({ campaignName: campaignName ?? '', rows }),
    [campaignName, rows],
  )

  // Seed / re-seed on key change OR when saved data first arrives, while pristine.
  // Microtask-deferred. ONE normalized object feeds the rows + name seed AND the
  // baseline so a fresh open is never dirty.
  useEffect(() => {
    let cancelled = false
    const key = `${schoolId}:${periodId}`
    Promise.resolve().then(() => {
      if (cancelled) return
      const seed = () => {
        const norm = normalizeItems(savedItems)
        const name = savedName ?? ''
        setRows(norm)
        setCampaignName(name)
        setBaseline(JSON.stringify({ campaignName: name, rows: norm }))
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
  }, [schoolId, periodId, savedItems, savedName, loading])

  const onNameChange = useCallback((value) => {
    touchedRef.current = true
    setCampaignName(value.slice(0, 200))
  }, [])

  const onChange = useCallback((id, field, value) => {
    touchedRef.current = true
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }, [])

  // Rename every row in a group (the group header is the editable identity).
  const onRenameGroup = useCallback((oldGroup, value) => {
    touchedRef.current = true
    const next = value.slice(0, 120)
    setRows((cur) => cur.map((r) => (r.group === oldGroup ? { ...r, group: next } : r)))
  }, [])

  const onAdd = useCallback((group) => {
    touchedRef.current = true
    setRows((cur) => [
      ...cur,
      { id: newId(), group, label: '', budget: 0, estimate: 0, comment: '' },
    ])
  }, [])

  // Append a brand-new empty-named division (first-seen order keeps it last).
  const onAddDivision = useCallback(() => {
    touchedRef.current = true
    setRows((cur) => [
      ...cur,
      { id: newId(), group: '', label: '', budget: 0, estimate: 0, comment: '' },
    ])
  }, [])

  const onRemove = useCallback((id) => {
    touchedRef.current = true
    setRows((cur) => cur.filter((r) => r.id !== id))
  }, [])

  // Reorder WITHIN a group (preserve global order otherwise) by swapping the
  // moved row with its in-group neighbor in the flat array. Keeping item order
  // stable across reorder is what makes the printed first-seen grouping match.
  const onMove = useCallback((id, dir) => {
    touchedRef.current = true
    setRows((cur) => {
      const idx = cur.findIndex((r) => r.id === id)
      if (idx < 0) return cur
      const group = cur[idx].group
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
    const name = campaignName?.trim() || null
    const body = {
      campaignName: name,
      items: rows.map((r) => ({
        id: r.id,
        group: typeof r.group === 'string' ? r.group.trim() : '',
        label: r.label,
        budget: toMoney(r.budget),
        estimate: toMoney(r.estimate),
        comment: r.comment ?? '',
      })),
    }
    await schedulesApi.saveCampaign(schoolId, periodId, body)
    await refetch()
    // Re-baseline from the SAME serialized shape we just sent so the next render
    // is clean (group trimmed identically to the seed normalizer).
    const rebaselineRows = body.items.map((it) => ({
      id: it.id,
      group: it.group,
      label: it.label,
      budget: it.budget,
      estimate: it.estimate,
      comment: it.comment,
    }))
    setRows(rebaselineRows)
    setCampaignName(name ?? '')
    setBaseline(JSON.stringify({ campaignName: name ?? '', rows: rebaselineRows }))
  }, [schoolId, periodId, rows, campaignName, refetch])

  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: draftKey,
    save: doSave,
  })

  // Group rows into per-group sub-tables in FIRST-SEEN order (NOT a constant).
  const groups = useMemo(() => {
    const map = new Map()
    const order = []
    for (const r of rows) {
      if (!map.has(r.group)) {
        map.set(r.group, [])
        order.push(r.group)
      }
      map.get(r.group).push(r)
    }
    return order.map((g) => ({ group: g, rows: map.get(g) }))
  }, [rows])

  const grand = useMemo(() => {
    let budget = 0
    let estimate = 0
    for (const r of rows) {
      budget += toNum(r.budget)
      estimate += toNum(r.estimate)
    }
    return { budget, estimate, difference: budget - estimate }
  }, [rows])

  if (loading) {
    return (
      <div className="b2-note" aria-busy="true">
        <p>Loading the capital campaign…</p>
      </div>
    )
  }

  const renderGroup = ({ group, rows: groupRows }) => {
    let subB = 0
    let subE = 0
    for (const r of groupRows) {
      subB += toNum(r.budget)
      subE += toNum(r.estimate)
    }
    return (
      <Section
        key={group}
        label={
          canEdit ? (
            <input
              type="text"
              value={group}
              list={GROUP_DATALIST_ID}
              placeholder="Division name…"
              aria-label="Division name"
              onChange={(e) => onRenameGroup(group, e.target.value)}
              className="h-7 min-w-[180px] rounded-[4px] border border-hair/[0.18] bg-white px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink outline-none placeholder:text-ink2/60 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25"
            />
          ) : (
            group || '—'
          )
        }
        aside={canEdit ? <AddRowButton onClick={() => onAdd(group)} label="Add line" /> : null}
      >
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" className="dt-num">Budget</th>
                <th scope="col" className="dt-num">Estimate</th>
                <th scope="col" className="dt-num">Difference to budget</th>
                <th scope="col">Comment</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {groupRows.length === 0 ? (
                <tr className="dt-empty">
                  <td colSpan={6}>No campaign lines yet — add one.</td>
                </tr>
              ) : (
                groupRows.map((r, i) => (
                  <CampaignRow
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
              {groupRows.length > 0 && <SubtotalRow budget={subB} estimate={subE} />}
            </tbody>
          </table>
        </div>
      </Section>
    )
  }

  return (
    <motion.div
      key="campaign"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <datalist id={GROUP_DATALIST_ID}>
        {CAMPAIGN_GROUP_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <ScheduleHeading
        icon={Target}
        title="Capital Campaign"
        savedAt={updatedAt}
        body="Track campaign line items against budget. These flow into the Capital Campaign section of your board packet — Difference to Budget and totals are computed there."
      />

      <div className="mt-6 max-w-xl">
        <label htmlFor="campaign-name" className="b2-label">
          Campaign name
        </label>
        <input
          id="campaign-name"
          type="text"
          disabled={!canEdit}
          value={campaignName}
          placeholder="e.g. 2026 Building Our Future Campaign"
          onChange={(e) => onNameChange(e.target.value)}
          className="b2-input disabled:opacity-50"
        />
      </div>

      {rows.length === 0 ? (
        <div className="b2-note mt-8">
          <p className="b2-note-title">No campaign lines yet</p>
          {canEdit && (
            <div className="flex items-center justify-center pt-2">
              <AddRowButton onClick={onAddDivision} label="Add division" data-add-default="true" />
            </div>
          )}
        </div>
      ) : (
        <>
          {groups.map((g) => renderGroup(g))}

          {canEdit && (
            <div className="mt-4 flex justify-start">
              <AddRowButton onClick={onAddDivision} label="Add division" data-add-default="true" />
            </div>
          )}

          <Section label="Campaign total" className="sched-total">
            <StatStrip cols={3} className="stats-compact">
              <Stat label="Budget" value={statMoney(grand.budget)} />
              <Stat label="Estimate" value={statMoney(grand.estimate)} />
              <Stat
                label="Difference to budget"
                value={signedMoney(grand.difference)}
                status={diffTone(grand.difference) ?? undefined}
              />
            </StatStrip>
          </Section>
        </>
      )}

      <ScheduleSaveBar
        canEdit={canEdit}
        saving={saving}
        saveError={saveError}
        dirty={dirty}
        savedAt={updatedAt}
        onSave={saveNow}
        label="capital campaign"
      />
    </motion.div>
  )
}
