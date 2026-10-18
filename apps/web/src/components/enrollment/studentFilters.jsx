// ─────────────────────────────────────────────────────────────────────────────
// studentFilters — the ONE filter state + param builder shared by the student
// register (StudentRegister) and the roster analytics section
// (RosterAnalyticsSection), so both surfaces speak the exact same frozen query
// contract: { q, grade, status, race, gender, ethnicity, flags, ageBand } with
// multi-value dimensions as comma-joined strings and empties OMITTED (the API's
// global forbidNonWhitelisted ValidationPipe + @IsIn on every value).
//
// StudentFilterBar is presentational + controlled: the caller owns the `filters`
// object; the bar renders a debounced search, per-dimension pickers that ADD
// chips, ISP/504/ELL flag toggles, and the active-chip row with per-chip ✕ and
// "Clear all". Sky-hued via the `hue` prop (enrollment #0EA5E9).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import {
  GRADE_KEYS,
  STUDENT_STATUS_KEYS,
  STUDENT_STATUS_LABELS,
  STUDENT_FLAG_KEYS,
  STUDENT_FLAG_LABELS,
  AGE_BAND_KEYS,
  AGE_BAND_LABELS,
  GENDER_KEYS,
  GENDER_LABELS,
  ETHNICITY_KEYS,
  ETHNICITY_LABELS,
  RACE_KEYS,
  RACE_LABELS,
} from '../../lib/demographicVocab.js'

export const GRADE_LABELS = Object.fromEntries(
  GRADE_KEYS.map((g) => [g, /^\d+$/.test(g) ? `Grade ${g}` : g]),
)

/** The empty filter state (multi-value dimensions are arrays; q is a string). */
export const EMPTY_STUDENT_FILTERS = {
  q: '',
  grade: [],
  status: [],
  race: [],
  gender: [],
  ethnicity: [],
  flags: [],
  ageBand: [],
}

// dimension key → { label, keys, labels } (chip + picker vocabulary).
export const STUDENT_FILTER_DIMENSIONS = [
  { key: 'grade', label: 'Grade', keys: GRADE_KEYS, labels: GRADE_LABELS },
  { key: 'status', label: 'Status', keys: STUDENT_STATUS_KEYS, labels: STUDENT_STATUS_LABELS },
  { key: 'race', label: 'Race', keys: RACE_KEYS, labels: RACE_LABELS },
  { key: 'gender', label: 'Gender', keys: GENDER_KEYS, labels: GENDER_LABELS },
  { key: 'ethnicity', label: 'Ethnicity', keys: ETHNICITY_KEYS, labels: ETHNICITY_LABELS },
  { key: 'ageBand', label: 'Age band', keys: AGE_BAND_KEYS, labels: AGE_BAND_LABELS },
]

const DIM_LABELS = Object.fromEntries(
  STUDENT_FILTER_DIMENSIONS.map((d) => [d.key, d.labels]),
)

/**
 * filters → the frozen query params object. Comma-joined multi-values; empty
 * dimensions omitted entirely (never an empty string param).
 */
export function buildStudentParams(filters) {
  const f = filters ?? EMPTY_STUDENT_FILTERS
  const params = {}
  const q = String(f.q ?? '').trim()
  if (q) params.q = q.slice(0, 120)
  for (const d of STUDENT_FILTER_DIMENSIONS) {
    const vals = f[d.key] ?? []
    if (vals.length) params[d.key] = vals.join(',')
  }
  if ((f.flags ?? []).length) params.flags = f.flags.join(',')
  return params
}

/** Any filter (search included) active? */
export function hasActiveStudentFilters(filters) {
  return Object.keys(buildStudentParams(filters)).length > 0
}

function Chip({ label, hue, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold text-navy"
      style={{ borderColor: `${hue}55`, backgroundColor: `${hue}12` }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full p-0.5 text-muted transition hover:text-danger"
      >
        <X size={12} />
      </button>
    </span>
  )
}

/**
 * WHAT THE REGISTER ACTUALLY HOLDS, per dimension.
 *
 * `facets` is the UNFILTERED aggregate's `counts` — { grade: {'9':120,…},
 * gender: {}, … }. A value is OFFERED only when its count is above zero.
 *
 * This exists because of a report that the filters "aren't working". They were
 * working perfectly; they were offering the wrong things. Every picker listed the
 * entire vocabulary regardless of the data, so a 9–12 high school was invited to
 * filter by PK3 and Grade 3, and a roster imported from a users.csv — which
 * carries no demographics at all — offered fully populated Race, Gender,
 * Ethnicity and Age-band menus. Every one of those picks returns an empty list,
 * and a control that answers "nothing" to a reasonable question is
 * indistinguishable from a broken one.
 *
 * NULL facets ⇒ we do not know yet (still loading, or a caller that does not
 * supply them), and the honest fallback is the full vocabulary — exactly today's
 * behaviour. Absence of knowledge must not masquerade as absence of data.
 */
function availableKeys(dim, facets) {
  if (!facets) return dim.keys
  const raw = facets[dim.key]
  if (!raw || typeof raw !== 'object') return []
  // A '<5' facet (a server-suppressed small cell, normalized by the bar) still
  // means the value EXISTS in the register — positive for availability.
  // `true` is a presence-only facet (the server's `facets` list): it EXISTS.
  const counts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === '<5' || v === true ? 1 : v]))
  return dim.keys.filter((k) => Number(counts[k] ?? 0) > 0)
}

/**
 * The picker vocabulary from a GET …/students/aggregate payload. The server now
 * sends `facets` — which values exist anywhere on the register, any status,
 * presence only — because its `counts` breakdowns count ONE status group
 * (enrolled by default), and a value held only by waitlisted or graduated
 * students must still be offered. Older payloads (no `facets`) fall back to
 * `counts`, exactly as before.
 */
export function facetsFromAggregate(agg) {
  if (!agg || typeof agg !== 'object') return null
  if (agg.facets && typeof agg.facets === 'object') {
    const out = {}
    for (const [dim, keys] of Object.entries(agg.facets)) {
      // `true` = present, no count: the breakdowns count enrolled students
      // while a filter returns every status, so no published count is the
      // number this option would return — none is printed beside it.
      out[dim] = Array.isArray(keys) ? Object.fromEntries(keys.map((k) => [k, true])) : {}
    }
    return out
  }
  return agg.counts ?? null
}

/**
 * The students/aggregate API now suppresses small attribute cells SERVER-side:
 * they arrive as `{ suppressed: true }` with NO value key. For the picker
 * vocabulary that means exists-but-small, shown with the same '<5' string the
 * roster charts use — never a number that isn't real.
 */
function normalizeFacets(facets) {
  if (!facets) return facets
  const out = {}
  for (const [dim, counts] of Object.entries(facets)) {
    out[dim] =
      counts && typeof counts === 'object'
        ? Object.fromEntries(
            Object.entries(counts).map(([k, v]) => [
              k,
              v && typeof v === 'object' && v.suppressed === true ? '<5' : v,
            ]),
          )
        : counts
  }
  return out
}

export default function StudentFilterBar({
  filters,
  onChange,
  hue = '#0EA5E9',
  showSearch = true,
  // Unfiltered facet counts from GET …/students/aggregate. Optional: callers that
  // do not pass it keep the previous full-vocabulary behaviour.
  facets: rawFacets = null,
}) {
  const f = filters ?? EMPTY_STUDENT_FILTERS
  // Server-suppressed cells → '<5' once, here, so every read below (labels,
  // availability) speaks one vocabulary.
  const facets = useMemo(() => normalizeFacets(rawFacets), [rawFacets])

  // Debounced search — local echo state, 300ms push to the caller. The
  // lastQ/setState-during-render pair re-syncs the draft when the caller's q
  // changes EXTERNALLY (e.g. "Clear all") — the AddDataTab derived-state idiom.
  const [qDraft, setQDraft] = useState(f.q ?? '')
  const [lastQ, setLastQ] = useState(f.q ?? '')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  if ((f.q ?? '') !== lastQ) {
    setLastQ(f.q ?? '')
    if ((f.q ?? '') !== qDraft) setQDraft(f.q ?? '')
  }
  const onQ = (v) => {
    setQDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      onChange({ ...f, q: v })
    }, 300)
  }

  const toggleValue = (dim, value) => {
    const cur = f[dim] ?? []
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    onChange({ ...f, [dim]: next })
  }

  const clearAll = () => {
    clearTimeout(timer.current)
    setQDraft('')
    onChange({ ...EMPTY_STUDENT_FILTERS })
  }

  const chips = []
  for (const d of STUDENT_FILTER_DIMENSIONS) {
    for (const v of f[d.key] ?? []) {
      chips.push({ dim: d.key, value: v, label: DIM_LABELS[d.key]?.[v] ?? v })
    }
  }
  for (const v of f.flags ?? []) {
    chips.push({ dim: 'flags', value: v, label: STUDENT_FLAG_LABELS[v] ?? v })
  }
  const anyActive = chips.length > 0 || String(f.q ?? '').trim() !== ''

  const pickerCls =
    'rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-navy focus:outline-none'

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={qDraft}
              onChange={(e) => onQ(e.target.value)}
              maxLength={120}
              placeholder="Search students…"
              aria-label="Search students by name"
              className="w-full rounded-lg border border-rule/70 bg-white py-1.5 pl-9 pr-3 text-[13.5px] text-navy outline-none transition-colors placeholder:text-muted/70 focus:border-transparent focus:ring-2"
              style={{ '--tw-ring-color': hue }}
            />
          </label>
        )}
        <span className="hidden items-center gap-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted sm:inline-flex">
          <SlidersHorizontal size={13} /> Filter
        </span>
        {STUDENT_FILTER_DIMENSIONS.map((d) => {
          const keys = availableKeys(d, facets)
          // A dimension the roster carries NO data for is disabled and says so.
          // Rendering it live would offer a menu whose every option returns zero.
          const empty = facets != null && keys.length === 0
          return (
          <select
            key={d.key}
            value=""
            disabled={empty}
            onChange={(e) => {
              if (e.target.value) toggleValue(d.key, e.target.value)
            }}
            aria-label={
              empty
                ? `${d.label} — not in your roster data`
                : `Add a ${d.label.toLowerCase()} filter`
            }
            title={empty ? `Your roster carries no ${d.label.toLowerCase()} data.` : undefined}
            className={`${pickerCls}${empty ? ' cursor-not-allowed opacity-45' : ''}`}
          >
            <option value="">{empty ? `${d.label} — none` : d.label}</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {(f[d.key] ?? []).includes(k) ? '✓ ' : ''}
                {d.labels[k] ?? k}
                {/* The count is the point: it tells you the answer before you
                    ask, so an empty result is never a surprise. */}
                {facets?.[d.key]?.[k] != null && facets[d.key][k] !== true ? ` (${facets[d.key][k]})` : ''}
              </option>
            ))}
          </select>
          )
        })}
        {STUDENT_FLAG_KEYS.map((k) => {
          const on = (f.flags ?? []).includes(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleValue('flags', k)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-bold transition-colors ${
                on ? 'text-white' : 'text-muted hover:text-navy'
              }`}
              style={
                on
                  ? { backgroundColor: hue, borderColor: hue }
                  : { borderColor: 'rgba(31,61,114,0.18)' }
              }
            >
              {STUDENT_FLAG_LABELS[k]}
            </button>
          )
        })}
      </div>

      {anyActive && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Chip
              key={`${c.dim}:${c.value}`}
              label={c.label}
              hue={hue}
              onRemove={() => toggleValue(c.dim, c.value)}
            />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 text-[12.5px] font-semibold text-muted underline-offset-2 transition hover:text-danger hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
