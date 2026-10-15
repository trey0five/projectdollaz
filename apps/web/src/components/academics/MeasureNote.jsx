// ─────────────────────────────────────────────────────────────────────────────
// WhatThisMeasures — the sentence every chart on this page was missing.
//
// A column of 63 beside a chip reading "NATIONAL 50" is not a finding, it is a
// riddle: nothing on screen said what unit 63 was in, what the dashed lines
// were, or which slice of the data was being drawn. The reader had to already
// know the answer to read the chart that was supposed to give it to them.
//
// So each chart now carries a strip between its header and its ink that states,
// in one sentence, WHAT IS PLOTTED — and every word of it is derived from the
// live context rather than typed in. That matters more than it sounds: the same
// page serves a TerraNova grade school (national percentiles, 1–99, midpoint 50)
// and an ACT high school (a composite, 1–36, no fixed midpoint at all), so a
// hardcoded "percentile" sentence would be a lie on half the tenancy. The score
// type picks the sentence; the filters supply the scope; the server supplies
// every number.
//
// NO ARITHMETIC LIVES HERE. Values arrive computed and are formatted, nothing
// more — the same discipline the dashboard itself keeps.
// ─────────────────────────────────────────────────────────────────────────────
import { cloneElement } from 'react'
import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { materialGap, subjectLabelOf } from '@finrep/analytics'
import { testTypeLabel } from '../../lib/academicsVocab.js'
import { INK } from './chartKit.jsx'
import { moduleHue } from '../module/moduleAnatomy.js'

const EASE = [0.2, 0.8, 0.2, 1]
const HUE = moduleHue('academics')

const num = (v, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? null
    : Number(v).toFixed(digits).replace(/\.0$/, '')

/**
 * THE UNIT, NAMED ONCE.
 *
 * Every label on the page that has to say what a number is — the column header
 * over the ranked values, the KPI subtitle, the sentences below — reads from
 * this, so the words cannot drift apart between three files.
 *
 * `span` prefers the server's own scoreRange over a constant, because the range
 * is what the axis is actually clamped to.
 */
export function unitOf(ctx) {
  const scoreType = ctx?.scoreType
  const family = ctx?.family
  const r = ctx?.scoreRange
  const span = r && Number.isFinite(r.min) && Number.isFinite(r.max) ? `${r.min}–${r.max}` : null

  if (scoreType === 'percentile')
    return { kind: 'percentile', noun: 'national percentile', points: 'percentile points', span: span ?? '1–99' }
  if (scoreType === 'nce')
    return { kind: 'nce', noun: 'NCE score', points: 'NCE points', span: span ?? '1–99' }
  if (family === 'act')
    return { kind: 'act', noun: 'ACT composite', points: 'ACT composite points', span: span ?? '1–36' }
  if (family === 'sat')
    return { kind: 'sat', noun: 'SAT total', points: 'SAT points', span: span ?? '400–1600' }
  return { kind: 'scale', noun: 'scale score', points: 'points', span }
}

/** The display name of the unit — for a column header or a KPI subtitle. */
export const unitLabelOf = (ctx) => unitOf(ctx).noun

/**
 * What an axis needs in order to explain itself: the unit's name, its full
 * theoretical span, the materiality floor in the family's own units, and how
 * many decimals that family deserves (an ACT gap of 0.4 rounds to nothing).
 */
export function axisUnitOf(ctx) {
  const u = unitOf(ctx)
  const gap = ctx?.family && ctx?.scoreType ? materialGap(ctx.family, ctx.scoreType) : null
  return {
    label: u.noun,
    points: u.points,
    span: u.span,
    gap,
    decimals: ctx?.scoreType === 'scale' ? 1 : 0,
  }
}

/** The unit definition, in plain words, per score type. */
function definitionOf(ctx, example) {
  const u = unitOf(ctx)
  if (u.kind === 'percentile') {
    // The illustration uses THIS school's own average when there is one — a
    // reader recognises the number they just read in the KPI strip.
    const ex = num(example, 0)
    return ex
      ? `a school at ${ex} has a typical student scoring better than ${ex}% of students nationwide`
      : `the share of students nationwide that a school's typical student outscored`
  }
  if (u.kind === 'nce')
    return `a percentile-like ${u.span} scale, built so gaps can be averaged and compared, on which 50 is the national average`
  if (u.kind === 'act') return `the average composite across the students tested, on the ${u.span} scale`
  if (u.kind === 'sat') return `the average total across the students tested, on the ${u.span} scale`
  return u.span ? `the exam's own scale score, which runs ${u.span}` : `the exam's own scale score`
}

const Unit = ({ children }) => <strong className="font-semibold text-navy">{children}</strong>

/**
 * WHAT EACH CHART PLOTS.
 *
 * One entry per chart, written against what that component actually draws —
 * read the component before adding one. A sentence describing a chart that does
 * something else is worse than no sentence, because it is believed.
 */
function measureSentence(chart, ctx, { example } = {}) {
  const u = unitOf(ctx)
  const def = definitionOf(ctx, example)
  const gap = ctx?.family && ctx?.scoreType ? materialGap(ctx.family, ctx.scoreType) : null

  switch (chart) {
    case 'standing':
      return (
        <>
          Each column is one school's average <Unit>{u.noun}</Unit> — {def}.
        </>
      )
    case 'subjects':
      return (
        <>
          Each column is a <Unit>gap</Unit>, not a score: how far this school sits from the network average in that
          subject, in {u.points}. The baseline is that subject's own network average, so above the line is ahead and
          below it is behind.
        </>
      )
    case 'distribution':
      return u.kind === 'percentile' ? (
        <>
          Every student is placed by their <Unit>own national percentile</Unit> — the bottom quarter is 1–25
          nationally, the top quarter 76–99 — and each block is the share of tested students who landed there.
        </>
      ) : (
        <>
          These bands are <Unit>quartiles of the national percentile distribution</Unit>, so they fill in for
          norm-referenced results only; a scale-scored exam carries no quartile to place a student in.
        </>
      )
    case 'subgroups':
      return (
        <>
          Each row pairs the students carrying a support flag on your roster against those without, in {u.points}: the
          span between the two dots <Unit>is the gap</Unit>. A pair stays hidden unless both sides clear five students.
        </>
      )
    case 'trend':
      return (
        <>
          Each point is one school year's average <Unit>{u.noun}</Unit> — {def}. The solid line is this school; the
          dashed line is the network average in that same year.
        </>
      )
    case 'quadrant':
      return (
        <>
          Every bubble is a school: average <Unit>{u.noun}</Unit> across the bottom, its <Unit>one-year change</Unit> up
          the side, and the bubble sized by how many students were tested. Bottom-left is behind and falling.
        </>
      )
    case 'cohort':
      return (
        <>
          The same children, one year on: their average <Unit>{u.noun}</Unit> in the earlier grade on the left and in
          the current grade on the right, so the <Unit>slope is the movement</Unit>
          {gap ? ` — a move smaller than ${gap} ${u.points} counts as neither up nor down` : ''}.
        </>
      )
    // A SIBLING OF 'cohort', NOT AN EDIT OF IT. That one describes a two-point
    // slope between adjacent grades and is still drawn by CohortPanel; this one
    // describes a grid of multi-year trajectories on one shared axis. Rewriting
    // the older sentence to cover both would have made it false about the chart
    // it is actually printed under.
    case 'cohortTrajectory':
      return (
        <>
          Each panel follows ONE group of children across consecutive grades, every point their average{' '}
          <Unit>{u.noun}</Unit> — {def}. Every panel shares <Unit>one axis</Unit>, so a line sitting lower is a
          genuinely lower group and not a panel drawn to its own scale
          {gap ? `; a move smaller than ${gap} ${u.points} counts as neither up nor down` : ''}. A year that was
          suppressed or never filed breaks the line rather than being drawn through.
        </>
      )
    case 'network':
      return (
        <>
          Two bars per school, last year and this year, each an average <Unit>{u.noun}</Unit> — ranked across the
          network so the reference lines cut through every school at once.
        </>
      )
    default:
      return (
        <>
          Values are shown as an average <Unit>{u.noun}</Unit> — {def}.
        </>
      )
  }
}

/**
 * THE SCOPE, READ FROM THE LIVE FILTERS.
 *
 * Never typed, so it cannot drift from the data: the same context object that
 * fed the query names the test, the subjects, the grade and the year.
 */
function scopeOf(ctx, gradeLabel) {
  const subjects = ctx?.subject
    ? subjectLabelOf(ctx.subject)
    : (ctx?.subjects ?? []).length === 0
      ? null
      : ctx.subjects.length <= 3
        ? ctx.subjects.map(subjectLabelOf).join(' + ')
        : `${ctx.subjects.length} subjects`

  const grade = gradeLabel ?? (!ctx?.grade || ctx.grade === 'all' ? 'all grades' : `grade ${ctx.grade}`)

  return [ctx?.testType ? testTypeLabel(ctx.testType) : null, subjects, grade, ctx?.year ?? null]
    .filter(Boolean)
    .join(' · ')
}

/** A reference line, spelled out in the same colour it is drawn in. */
function RefChip({ color, name, value, gloss }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block w-4 border-t-2 border-dashed"
        style={{ borderColor: color }}
      />
      <span className="text-micro font-semibold uppercase" style={{ color }}>
        {name} {value}
      </span>
      {gloss ? <span className="text-[11px] text-muted">— {gloss}</span> : null}
    </span>
  )
}

function refChipsFor(refs, ctx, peerAvg) {
  const u = unitOf(ctx)
  const out = []

  if (refs.includes('national') && ctx?.nationalReference !== null && ctx?.nationalReference !== undefined) {
    out.push(
      <RefChip
        key="national"
        color={INK.national}
        name="National"
        value={num(ctx.nationalReference, 0)}
        // A percentile scale is DEFINED so that 50 is the midpoint; a scale
        // score has no such constant, so the number is an observed average and
        // must not be called a definition.
        gloss={
          u.kind === 'percentile' || u.kind === 'nce'
            ? 'the national midpoint, true by definition'
            : `the national average ${u.noun}`
        }
      />,
    )
  }

  if (refs.includes('network') && peerAvg !== null && peerAvg !== undefined) {
    const n = ctx?.peerCount ?? null
    out.push(
      <RefChip
        key="network"
        color={INK.network}
        name="Network"
        value={num(peerAvg, 1)}
        // The peer average deliberately EXCLUDES this school — including
        // yourself in the line you are measured against damps every gap — and a
        // reader comparing the column to the line is owed that.
        gloss={n ? `the average of the other ${n} school${n === 1 ? '' : 's'}, this one excluded` : 'the network average, this school excluded'}
      />,
    )
  }

  return out
}

/**
 * The strip itself: one sentence, the scope it was computed over, and the
 * reference lines named in their own ink. Two or three lines — a paragraph here
 * would be skipped, and a skipped explanation explains nothing.
 */
export function WhatThisMeasures({
  chart,
  ctx,
  example = null,
  peerAvg = null,
  refs = [],
  gradeLabel = null,
  note = null,
  reduce = false,
  // 'popover' — the same words, unframed, for a card's ⓘ (Aurora: the chart
  // keeps only its series key in view; the sentence is one click away).
  mode = 'strip',
}) {
  if (!ctx) return null
  const chips = refChipsFor(refs, ctx, peerAvg)

  if (mode === 'popover') {
    return (
      <div className="space-y-1.5">
        <p className="text-small leading-snug text-ink">{measureSentence(chart, ctx, { example })}</p>
        <p className="text-micro font-semibold uppercase text-ink2">{scopeOf(ctx, gradeLabel)}</p>
        {chips.length ? <div className="flex flex-col gap-1">{chips}</div> : null}
        {note ? <p className="text-[11px] leading-snug text-ink2">{note}</p> : null}
      </div>
    )
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="mb-4 flex items-start gap-2.5 border-l-2 pl-3"
      style={{ borderColor: HUE }}
    >
      <Info size={13} strokeWidth={2.2} className="mt-[3px] shrink-0 text-ink2" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="max-w-[72ch] text-small leading-snug text-ink">{measureSentence(chart, ctx, { example })}</p>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <span className="text-micro font-semibold uppercase text-ink2">{scopeOf(ctx, gradeLabel)}</span>
          {chips}
        </div>
        {note ? <p className="text-[11px] leading-snug text-ink2">{note}</p> : null}
      </div>
    </motion.div>
  )
}

export default WhatThisMeasures

/**
 * MeasureKey — what stays IN VIEW once the explanation moves behind the ⓘ:
 * the series key only ("NATIONAL 50 · NETWORK 57.2"), in each line's own ink.
 * Data, not prose, so a reader never has to open anything to read the chart.
 */
export function MeasureKey({ ctx, peerAvg = null, refs = [] }) {
  if (!ctx) return null
  const chips = refChipsFor(refs, ctx, peerAvg).map((c) => cloneElement(c, { gloss: null }))
  if (!chips.length) return null
  return <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-1">{chips}</div>
}
