// ─────────────────────────────────────────────────────────────────────────────
// RosterAnalyticsSection — the roster-mode analytics block on the enrollment
// Overview (rendered ONLY when status.rosterMode === 'roster'). Everything reads
// the FERPA-safe GET students/aggregate (counts, never a name) through the SAME
// filter contract as the register (shared StudentFilterBar + buildStudentParams),
// so filtering here and filtering the roster speak one language.
//
// Dataviz (skill-checked): identity mixes (race/gender/ethnicity/age band) are
// BarLists with the validated CATEGORICAL_LIGHT palette assigned in FIXED key
// order (color follows the entity — a filter never repaints survivors); the
// grade distribution is a magnitude read → ONE hue (sky) across the ordered
// grade grid; flags are a stat strip, not a chart; the headcount trend is the
// The '<5' min-cell rule (formatMinCell) masks every CATEGORICAL cell —
// masked cells also drop their % gutter so the pair can't be re-derived at a
// glance. Headline totals stay true counts (frozen spec).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, LifeBuoy, FileCheck2, Languages, Flag } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import BarList from '../analytics/charts/BarList.jsx'
import { CATEGORICAL_LIGHT } from '../analytics/v2/chartPalette.js'
import {
  GRADE_KEYS,
  GENDER_KEYS,
  GENDER_LABELS,
  ETHNICITY_KEYS,
  ETHNICITY_LABELS,
  RACE_KEYS,
  RACE_LABELS,
  AGE_BAND_KEYS,
  AGE_BAND_LABELS,
  STUDENT_FLAG_LABELS,
  formatMinCell,
} from '../../lib/demographicVocab.js'
import { moduleHue } from '../module/moduleAnatomy.js'
import EnrollmentTrend from './EnrollmentTrend.jsx'
import { demographicColor } from '../../lib/demographicColor.js'
import StudentFilterBar, {
  EMPTY_STUDENT_FILTERS,
  GRADE_LABELS,
  buildStudentParams,
} from './studentFilters.jsx'

const ENROLL_HUE = moduleHue('enrollment')

// counts map + FIXED key order → BarList rows. value = true count (bar length);
// formatted = the min-cell-masked count; % gutter only on unmasked cells.
function toRows(counts, keys, labels, colorFor) {
  const src = counts ?? {}
  const total = keys.reduce((s, k) => s + (Number(src[k]) || 0), 0)
  return keys
    .map((k, i) => {
      const n = Number(src[k]) || 0
      const masked = n > 0 && n < 5
      return {
        id: k,
        label: labels[k] ?? k,
        color: colorFor(i),
        value: n,
        formatted: formatMinCell(n),
        share: !masked && total > 0 ? `${Math.round((100 * n) / total)}%` : undefined,
        raw: n,
      }
    })
    .filter((r) => r.raw > 0)
}

function MixCard({ title, rows, sortDesc = true }) {
  return (
    <div className="card-soft min-w-0 p-4 sm:p-5">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h4>
      {rows.length ? (
        <BarList rows={rows} sortDesc={sortDesc} formatter={(v) => formatMinCell(v)} />
      ) : (
        // An ALL-EMPTY dimension collapses to one honest sentence instead of a
        // near-empty chart — the same vocabulary the filter pickers use.
        <p className="rounded-lg border border-dashed border-rule/60 bg-cream/40 px-3 py-4 text-center text-[12.5px] italic text-muted">
          Not in your roster data.
        </p>
      )}
    </div>
  )
}

export default function RosterAnalyticsSection({ schoolId, planTotal = null }) {
  const [filters, setFilters] = useState(EMPTY_STUDENT_FILTERS)
  const [agg, setAgg] = useState(null)
  // UNFILTERED facet counts for the picker vocabulary. The `agg` above is the
  // FILTERED read that drives the charts; feeding that to the bar would delete
  // each option the moment you selected it — narrowing to Grade 12 would leave
  // "Grade 12" as the only grade on offer and no way back.
  const [facets, setFacets] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const params = useMemo(() => buildStudentParams(filters), [filters])

  useEffect(() => {
    if (!schoolId) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      enrollmentApi.students
        .aggregate(schoolId)
        .then((res) => {
          if (!cancelled) setFacets((res.data ?? res)?.counts ?? null)
        })
        .catch(() => {
          if (!cancelled) setFacets(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      enrollmentApi.students
        .aggregate(schoolId, params)
        .then((res) => {
          if (!cancelled) setAgg(res.data ?? res)
        })
        .catch((e) => {
          if (!cancelled) setError(apiErrorMessage(e, 'Could not load roster analytics.'))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, params])

  // Headcount trend — the roster's daily snapshots + any older series, oldest→latest.
  useEffect(() => {
    if (!schoolId) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      enrollmentApi
        .snapshots(schoolId)
        .then((res) => {
          if (cancelled) return
          // RAW rows — EnrollmentTrend owns the per-day dedupe and the date
          // axis; pre-mapping here is how the flat line got its shape.
          setSnapshots(res.data ?? [])
        })
        .catch(() => {
          if (!cancelled) setSnapshots([])
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const counts = agg?.counts ?? {}
  // ONE COLOUR PER VALUE, EVERYWHERE: the same demographicColor the register
  // pills and the hero ring use, keyed by CANONICAL position — never by which
  // values happen to be present, and never by rank. BarList's own contract
  // ("colour follows the entity") makes a filter or re-sort repaint nothing.
  const dimColor = (dimension, keys) => (i) =>
    demographicColor(dimension, keys[i]) ?? CATEGORICAL_LIGHT[i % CATEGORICAL_LIGHT.length]
  const race = toRows(counts.race, RACE_KEYS, RACE_LABELS, dimColor('race', RACE_KEYS))
  const gender = toRows(counts.gender, GENDER_KEYS, GENDER_LABELS, dimColor('gender', GENDER_KEYS))
  const ethnicity = toRows(
    counts.ethnicity,
    ETHNICITY_KEYS,
    ETHNICITY_LABELS,
    dimColor('ethnicity', ETHNICITY_KEYS),
  )
  const ageBand = toRows(
    counts.ageBand,
    AGE_BAND_KEYS,
    AGE_BAND_LABELS,
    dimColor('ageBand', AGE_BAND_KEYS),
  )
  // Grades wear their OWN hues — the ring, the pills and this chart agree.
  const grades = toRows(counts.grade, GRADE_KEYS, GRADE_LABELS, dimColor('grade', GRADE_KEYS))

  const flags = counts.flags ?? {}
  const flagStrip = [
    ['iep', STUDENT_FLAG_LABELS.iep, LifeBuoy],
    ['plan504', STUDENT_FLAG_LABELS.plan504, FileCheck2],
    ['ell', STUDENT_FLAG_LABELS.ell, Languages],
    ['any', 'Any flag', Flag],
  ]

  
  const filtered = agg?.filteredTotal ?? null
  const total = agg?.total ?? null

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-soft p-5 sm:p-6"
      aria-label="Roster analytics"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: ENROLL_HUE }}
          >
            <BarChart3 size={18} />
          </span>
          <div>
            <h3 className="font-serif text-lg font-bold text-navy">Roster analytics</h3>
            <p className="text-[12.5px] text-muted">
              Aggregate counts only — cells under 5 show as &lt;5.
            </p>
          </div>
        </div>
        {filtered != null && total != null && (
          <span
            className="rounded-full border px-3 py-1 text-[12.5px] font-bold"
            style={{ borderColor: `${ENROLL_HUE}55`, backgroundColor: `${ENROLL_HUE}12`, color: '#0369A1' }}
          >
            {filtered.toLocaleString('en-US')} of {total.toLocaleString('en-US')} students
          </span>
        )}
      </div>

      <div className="mb-4">
        <StudentFilterBar filters={filters} onChange={setFilters} hue={ENROLL_HUE} facets={facets} />
      </div>

      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-6 text-center text-[14px] text-danger">
          {error}
        </p>
      ) : loading && !agg ? (
        <div className="h-44 animate-pulse rounded-xl border border-rule/40 bg-section/60" />
      ) : (filtered ?? 0) === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center font-serif text-[15px] italic text-muted">
          No students match these filters.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Grade distribution — full width */}
          <MixCard title="Grade distribution" rows={grades} sortDesc={false} />

          {/* Identity mixes */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MixCard title="Race" rows={race} />
            <MixCard title="Age bands" rows={ageBand} sortDesc={false} />
            <MixCard title="Gender" rows={gender} />
            <MixCard title="Ethnicity" rows={ethnicity} />
          </div>

          {/* Flags strip — icon tiles, hue-lit when >0, quiet at 0. Still stat
              chips rather than a chart: categorical cells stay masked. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {flagStrip.map(([k, label, FlagIcon]) => {
              const n = flags[k] ?? 0
              const lit = n > 0
              return (
                <div
                  key={k}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
                    lit ? 'bg-white' : 'border-rule/50 bg-cream/40'
                  }`}
                  style={lit ? { borderColor: `${ENROLL_HUE}55` } : undefined}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={
                      lit
                        ? { backgroundColor: `${ENROLL_HUE}18`, color: ENROLL_HUE }
                        : { backgroundColor: 'rgba(0,0,0,0.04)', color: '#9aa4b2' }
                    }
                  >
                    <FlagIcon size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
                      {label}
                    </p>
                    <p className={`font-serif text-[20px] font-bold ${lit ? 'text-navy' : 'text-muted'}`}>
                      {formatMinCell(n)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Headcount trend — real dates, one reading per day, honest states.
              EnrollmentTrend owns the dedupe and the axis; see its header. */}
          <EnrollmentTrend snapshots={snapshots} planTotal={planTotal} />
        </div>
      )}
    </motion.section>
  )
}
