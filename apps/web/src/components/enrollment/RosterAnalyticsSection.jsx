// ─────────────────────────────────────────────────────────────────────────────
// RosterAnalyticsSection — the roster-mode analytics block on the enrollment
// Overview (rendered ONLY when status.rosterMode === 'roster'). Everything reads
// the FERPA-safe GET students/aggregate (counts, never a name) through the SAME
// filter contract as the register (shared StudentFilterBar + buildStudentParams),
// so filtering here and filtering the roster speak one language.
//
// Dataviz (skill-checked): identity mixes (race/gender/ethnicity/age band) are
// column charts with the validated CATEGORICAL_LIGHT palette assigned in FIXED
// key order (color follows the entity — a filter never repaints survivors); the
// grade distribution is a magnitude read → ONE hue (sky) across the ordered
// grade grid; flags are a stat strip, not a chart; the headcount trend is the
// The '<5' min-cell rule (formatMinCell) masks every CATEGORICAL cell —
// masked cells also drop their % gutter so the pair can't be re-derived at a
// glance. The whole-roster headline total stays a true count (frozen spec).
// On the UNFILTERED view a small cell reads '<5' and a companion 'withheld'; on
// every FILTERED view the server labels each hidden figure 'withheld',
// whatever its size (privacy review round 6: per-grade '<5' labels could be
// counted against the school-wide total). The filtered total is often
// withheld too (it counts every status), so the headline pill falls back to
// the published ENROLLED count of the filtered group.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, LifeBuoy, FileCheck2, Languages, Flag } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import ColumnChart from '../analytics/charts/ColumnChart.jsx'
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
  isComplementaryCell,
  isSuppressedCell,
} from '../../lib/demographicVocab.js'
import { moduleHue } from '../module/moduleAnatomy.js'
import { demographicColor } from '../../lib/demographicColor.js'
import StudentFilterBar, {
  EMPTY_STUDENT_FILTERS,
  GRADE_LABELS,
  buildStudentParams,
  facetsFromAggregate,
} from './studentFilters.jsx'

const ENROLL_HUE = moduleHue('enrollment')

// The status group a breakdown counts, in the sentence above the charts.
const STUDENT_STATUS_PLURAL = {
  enrolled: 'enrolled students',
  waitlist: 'waitlisted students',
  withdrawn: 'withdrawn students',
  graduated: 'graduated students',
}

// counts map + FIXED key order → BarList rows. value = true count (bar length);
// formatted = the min-cell-masked count; % gutter only on unmasked cells.
// A SERVER-suppressed cell (`{ suppressed: true }`, no value — the API now
// floors small attribute cells before they leave) keeps its row, labelled '<5'
// with a zero-length bar: the value never reached the browser to draw.
function toRows(counts, keys, labels, colorFor) {
  const src = counts ?? {}
  const total = keys.reduce((s, k) => s + (Number(src[k]) || 0), 0)
  return keys
    .map((k, i) => {
      // `n` may be a number OR a server-suppressed marker; formatMinCell renders
      // both ('<5' for the marker). `count` is the numeric view for bar length
      // and shares — 0 for a suppressed cell, whose value never reached us.
      const n = src[k] ?? 0
      const suppressed = isSuppressedCell(n)
      const count = suppressed ? 0 : Number(n) || 0
      const masked = suppressed || (count > 0 && count < 5)
      return {
        id: k,
        label: labels[k] ?? k,
        color: colorFor(i),
        value: count,
        formatted: formatMinCell(n),
        share: !masked && total > 0 ? `${Math.round((100 * count) / total)}%` : undefined,
        raw: count,
        suppressed,
        complementary: isComplementaryCell(n),
        // A masked cell (<5, or server-suppressed) draws as a hatched stub,
        // never as a column whose height would print the withheld count.
        masked,
      }
    })
    .filter((r) => r.raw > 0 || r.suppressed)
}

function MixCard({ title, rows, sortDesc = true }) {
  // Sorting re-orders the columns only — every row keeps the colour it was
  // assigned by key order, so a re-sort never repaints a survivor.
  // Masked cells sort as ZERO: ordering two '<5' cells by their true counts
  // would leak which of them is larger.
  const rank = (x) => (x.masked ? 0 : x.value)
  const list = sortDesc ? [...rows].sort((a, b) => rank(b) - rank(a)) : rows
  return (
    <div className="sec min-w-0 !mt-6">
      <div className="sec-head">
        <h4 className="sec-label">{title}</h4>
        <span className="sec-rule" aria-hidden="true" />
      </div>
      {rows.length ? (
        <ColumnChart
          rows={list.map((r) => ({
            id: r.id,
            label: r.label,
            value: r.masked ? null : r.value,
            color: r.color,
            suppressed: r.masked,
            formatted: r.formatted,
            // A complementary cell is not small — its stub says "withheld", not <5.
            ...(r.complementary ? { stubLabel: 'withheld' } : {}),
            meta: r.share ? [{ label: 'Share', value: r.share }] : [],
          }))}
          formatter={(v) => formatMinCell(v)}
          showValues="all"
          height={150}
          ariaLabel={title}
        />
      ) : (
        // An ALL-EMPTY dimension collapses to one honest sentence instead of a
        // near-empty chart — the same vocabulary the filter pickers use.
        <p className="border-y border-hair px-3 py-4 text-center text-small italic text-ink2">
          Not in your roster data.
        </p>
      )}
    </div>
  )
}

// NOTE (Analytics tab): this block MOVED off the Overview into the module's
// Analytics tab, and its own headcount trend went with it — the tab draws that
// series as E1 from the server-deduped `trend.points`, and the same line twice
// on one page is noise. Everything else here is unchanged: this answers "who is
// on my register", filterable, which is a different question from "how is
// enrollment doing".
export default function RosterAnalyticsSection({ schoolId }) {
  const [filters, setFilters] = useState(EMPTY_STUDENT_FILTERS)
  const [agg, setAgg] = useState(null)
  // UNFILTERED facet counts for the picker vocabulary. The `agg` above is the
  // FILTERED read that drives the charts; feeding that to the bar would delete
  // each option the moment you selected it — narrowing to Grade 12 would leave
  // "Grade 12" as the only grade on offer and no way back.
  const [facets, setFacets] = useState(null)
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
          if (!cancelled) setFacets(facetsFromAggregate(res.data ?? res))
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

  const counts = agg?.counts ?? {}
  // ONE COLOUR PER VALUE, EVERYWHERE: the same demographicColor the register
  // pills and the hero ring use, keyed by CANONICAL position — never by which
  // values happen to be present, and never by rank. The column chart's contract
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

  // `filteredTotal` is now SERVER-suppressed under attribute filters (an exact
  // "how many IEP students" is a cell like any other): it may arrive as
  // `{ suppressed: true }` with no value. Render it '<5' like every other cell —
  // never NaN, 0, or "[object Object]" — and never mistake it for "no matches".
  const filteredSuppressed = isSuppressedCell(agg?.filteredTotal)
  const filtered = filteredSuppressed ? null : agg?.filteredTotal ?? null
  const total = agg?.total ?? null
  // When the all-status total is withheld but the group's ENROLLED count is
  // published (the breakdowns count exactly those students), the pill says
  // that instead of "withheld of 233" on every grade filter.
  // The unfiltered view (its "filtered" total IS the whole roster): the only
  // view whose labels tell a small cell ('<5') from a companion ('withheld').
  const wholeRoster = typeof agg?.filteredTotal === 'number' && agg.filteredTotal === agg?.total
  const enrolledHere = agg?.counts?.status?.enrolled
  const enrolledFallback =
    filteredSuppressed && agg?.withheld !== 'all' && typeof enrolledHere === 'number' ? enrolledHere : null
  // The server can withhold a filtered read WHOLE (`withheld: 'all'` — the
  // filters would narrow to a group a wider view hides) or just its breakdowns
  // (`'breakdown'` — several statuses chosen; each breakdown counts one status
  // group). Say so in words rather than drawing empty charts that read as
  // "nobody".
  const withheldAll = agg?.withheld === 'all'
  const withheldBreakdown = agg?.withheld === 'breakdown'
  const breakdownGroup = agg?.breakdown?.status ?? null
  const groupLabel = breakdownGroup ? STUDENT_STATUS_PLURAL[breakdownGroup] ?? `${breakdownGroup} students` : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0"
      aria-label="Roster analytics"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-small text-ink2">
          <BarChart3 size={14} className="mr-1.5 inline-block align-[-2px]" aria-hidden="true" />
          Aggregate counts only — on the whole roster, cells under 5 show as &lt;5 and a figure that would give
          one away by subtraction shows as withheld. With a filter on, every hidden figure shows as withheld,
          whatever its size.{groupLabel ? ` The breakdowns below count ${groupLabel}.` : ''}
        </p>
        {enrolledFallback != null ? (
          <span className="pill pill-count" title="The total across every status is withheld for this view">
            {enrolledFallback.toLocaleString('en-US')} enrolled
          </span>
        ) : (filtered != null || filteredSuppressed) && total != null ? (
          <span className="pill pill-count">
            {filteredSuppressed ? formatMinCell(agg.filteredTotal) : filtered.toLocaleString('en-US')} of{' '}
            {total.toLocaleString('en-US')} students
          </span>
        ) : null}
      </div>

      <div className="toolbar mb-2">
        <div className="min-w-0 flex-1 py-1">
          <StudentFilterBar filters={filters} onChange={setFilters} hue={ENROLL_HUE} facets={facets} />
        </div>
      </div>

      {error ? (
        <p className="py-6 text-center text-body text-risk">{error}</p>
      ) : loading && !agg ? (
        <div className="h-44 animate-pulse rounded-lg bg-ink/[.04]" />
      ) : withheldAll ? (
        <p className="border-y border-hair px-6 py-10 text-center text-small italic text-ink2">
          {/* The server says WHY (`withheldReason`): counts are only ever broken
              down for one filter at a time, never for a name search. */}
          {agg?.withheldReason === 'nameSearch'
            ? 'Counts never follow a name search: figures about the students whose names match would describe those students. Clear the search to see the breakdown.'
            : agg?.withheldReason === 'combination'
              ? 'Counts are broken down for one filter at a time (one grade, one demographic or one support flag, with a status if you like). A combination is withheld so that no two views can be put together to single out a student. Remove a filter to see the breakdown.'
              : 'These filters narrow to a group too small to show without identifying students, so this view is withheld. Widen the filters to see the breakdown.'}
        </p>
      ) : !filteredSuppressed && (filtered ?? 0) === 0 ? (
        <p className="border-y border-hair px-6 py-10 text-center text-small italic text-ink2">
          No students match these filters.
        </p>
      ) : withheldBreakdown ? (
        <p className="border-y border-hair px-6 py-10 text-center text-small italic text-ink2">
          Breakdowns count one status group at a time. Choose a single status to see that group’s breakdown.
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

          {/* Flags strip — a Stat strip, hue-marked when >0, quiet at 0. Still
              stat figures rather than a chart: categorical cells stay masked. */}
          <div className="stats stats-wrap mt-6 grid-cols-2 sm:grid-cols-4" role="list">
            {flagStrip.map(([k, label]) => {
              const n = flags[k] ?? 0
              // A bare server-suppressed flag (`{ suppressed: true }`, the
              // unfiltered view only) is a present-but-small group: lit, shown
              // as '<5'. A COMPLEMENTARY one prints "withheld": on the whole
              // roster that is a companion (not small, so present and lit); on
              // a filtered view it says nothing about its size — it may be
              // zero — so it is not lit.
              const lit =
                Number(n) > 0 || (isSuppressedCell(n) && (!isComplementaryCell(n) || wholeRoster))
              return (
                <div key={k} className="stat">
                  <p className="stat-label">{label}</p>
                  <span className={`stat-value num ${lit ? '' : 'text-ink2'}`}>{formatMinCell(n)}</span>
                  {lit ? <span className="stat-mark tone-hue" aria-hidden="true" /> : null}
                </div>
              )
            })}
          </div>

        </div>
      )}
    </motion.section>
  )
}
