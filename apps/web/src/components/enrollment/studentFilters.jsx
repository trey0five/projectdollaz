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
// chips, IEP/504/ELL flag toggles, and the active-chip row with per-chip ✕ and
// "Clear all". Sky-hued via the `hue` prop (enrollment #0EA5E9).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
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

export default function StudentFilterBar({ filters, onChange, hue = '#0EA5E9', showSearch = true }) {
  const f = filters ?? EMPTY_STUDENT_FILTERS

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
        {STUDENT_FILTER_DIMENSIONS.map((d) => (
          <select
            key={d.key}
            value=""
            onChange={(e) => {
              if (e.target.value) toggleValue(d.key, e.target.value)
            }}
            aria-label={`Add a ${d.label.toLowerCase()} filter`}
            className={pickerCls}
          >
            <option value="">{d.label}</option>
            {d.keys.map((k) => (
              <option key={k} value={k}>
                {(f[d.key] ?? []).includes(k) ? '✓ ' : ''}
                {d.labels[k] ?? k}
              </option>
            ))}
          </select>
        ))}
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
