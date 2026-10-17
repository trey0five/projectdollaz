// ─────────────────────────────────────────────────────────────────────────────
// CohortLongitudinal — the same children, followed for as many grades as the
// school has on file.
//
// WHAT THIS REPLACES, and why the shape changed. The old Cohorts view drew ONE
// cohort as a two-point slopegraph across every school in the diocese. It
// answered "who moved most last year" — a question about SCHOOLS — while
// wearing the title of a question about CHILDREN, and a principal opening it
// found fourteen lines and had to hunt for their own. So the axis of the screen
// is inverted: one panel per cohort at THIS school, four grades wide, and the
// other schools are an opt-in grey wash behind them.
//
// ── THE LOAD-BEARING RULE ────────────────────────────────────────────────────
// ONE SHARED Y-SCALE, COMPUTED HERE, ONCE, OVER EVERY COHORT (and every peer,
// when peers are on), CLAMPED TO THE FAMILY'S OWN RANGE. No panel calls
// fitScale. This is the whole reason the format works: four panels fitted to
// their own values look identical while describing entirely different levels,
// so the reader concludes the cohorts are alike when the only thing they share
// is the shape of the ink. A lower line here is a genuinely lower group.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Footprints, Grid3x3, Printer, Users2 } from 'lucide-react'
import { fitScale, INK } from './chartKit.jsx'
import { Section } from './AcademicsCard.jsx'
import { WhatThisMeasures, MeasureKey, axisUnitOf, unitLabelOf } from './MeasureNote.jsx'
import { testTypeLabel } from '../../lib/academicsVocab.js'
import { FilterChip, Segmented } from './AssessmentFilters.jsx'
import CohortTrajectoryPanel from './CohortTrajectoryPanel.jsx'
import CohortMatrix from './CohortMatrix.jsx'
import { COH_EASE, COH_HUE, niceTicks } from './cohortKit.js'

const PANEL_MIN = 184
const GRID_GAP = 10

/** The axis caption — never a constant. On an ACT school this reads "ACT
 *  composite (1–36)", and the string "TerraNova Scale Score" is unreachable. */
function railCaption(ctx) {
  const u = axisUnitOf(ctx)
  const test = ctx?.testType ? testTypeLabel(ctx.testType) : ''
  return `${test} ${unitLabelOf(ctx)}${u.span ? ` (${u.span})` : ''}`.trim()
}

// ── The view-local control bar ───────────────────────────────────────────────

/**
 * THREE DIFFERENT MECHANISMS, DELIBERATELY NOT CLONED INTO ONE BAR.
 *
 * The school is the app's own school switcher plus the peers toggle here; the
 * subject is the scope bar's Subject chip above (which is why this bar shows
 * the measure as a READOUT and not a second control); only the span, the window
 * and the peers actually belong to this view. Duplicating the scope bar's
 * controls here would give the reader two places to set one thing, and the
 * losing copy is always the one they used.
 */
function CohortControlBar({ ctx, spanOptions, span, onSpan, onWindow, peersOn, onPeers, onPrint, loading }) {
  const windows = ctx?.availableWindows ?? []
  const maxWindow = ctx?.gradeSpan?.maxWindow ?? 0
  // The composite's NAME is the server's, per test family — this file must
  // never type 'Total Battery', which is false on an ACT or SAT school.
  const seriesLabel = (ctx?.availableSeries ?? []).find((s) => s.key === ctx?.series)?.label ?? 'Composite'

  return (
    <div className="coh-controls toolbar gap-2.5">
      {spanOptions.length > 1 ? (
        <FilterChip
          label="Cohort"
          value={span}
          allLabel="All cohorts"
          options={[{ value: 'all', label: 'All cohorts' }, ...spanOptions]}
          onChange={onSpan}
        />
      ) : null}

      {windows.length > 0 ? (
        <Segmented
          uid="cohort-window"
          ariaLabel="Cohort length"
          value={ctx?.window}
          options={[4, 3, 2].map((w) => ({
            value: w,
            label: `${w} years`,
            disabled: !windows.includes(w),
            title: windows.includes(w)
              ? undefined
              : `Only ${maxWindow} consecutive grades are on file at this school`,
          }))}
          onChange={(w) => onWindow(Number(w))}
        />
      ) : null}

      {/* A READOUT, not a control — the Subject chip in the scope bar above sets
          it, and two doors to one setting is how a filter becomes a lie. */}
      <span
        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-navy/70"
        style={{ background: 'rgba(16,28,61,0.04)' }}
        title="Change this with the Subject chip in the scope bar above"
      >
        <span className="text-[8.5px] font-bold uppercase tracking-[0.14em] opacity-60">Measure</span>
        {seriesLabel}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {loading ? <span className="text-[11.5px] text-muted">Updating…</span> : null}

        {/* HIDDEN when there is nobody to compare with — a toggle that can only
            ever do nothing is worse than no toggle.
            GATED ON `peersAvailable`, NOT `peerCount`. peerCount counts the peer
            lines actually DRAWN, which is zero whenever peers are off — i.e. by
            default — so gating on it hid the control from every reader who had
            somebody to compare with, and left the feature reachable only by
            typing ?peers=1. peersAvailable is the org's other schools, drawn or
            not. peerCount still writes the copy, because the copy is about ink. */}
        {(ctx?.peersAvailable ?? 0) > 0 || peersOn ? (
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
            style={peersOn ? { background: `${COH_HUE}14`, color: '#0f766e' } : { color: '#64748b' }}
            title="Draw the other schools in this organisation behind these lines"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={peersOn}
              onChange={(e) => onPeers(e.target.checked)}
            />
            <span
              aria-hidden="true"
              className="relative h-[18px] w-[32px] rounded-full transition-colors"
              style={{ background: peersOn ? COH_HUE : 'rgba(16,28,61,0.18)' }}
            >
              <motion.span
                className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm"
                animate={{ left: peersOn ? 16 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              />
            </span>
            <Users2 size={13} /> Compare with the other schools
          </label>
        ) : null}

        <button
          type="button"
          onClick={onPrint}
          className="coh-noprint inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-navy/[0.05] hover:text-navy"
        >
          <Printer size={13} /> Print
        </button>
      </div>
    </div>
  )
}

// ── The shared axis rail ─────────────────────────────────────────────────────

/**
 * WHERE THE PANELS ACTUALLY LANDED — read from the layout, never predicted.
 *
 * The first cut of this computed the column count from the measured width and
 * `minmax(184px, 1fr)`, i.e. it reimplemented the CSS grid's own wrapping rule
 * in JavaScript. The two disagreed the moment the container was a size the
 * formula rounded differently, and the rail then repeated itself once per
 * imagined row — six blocks of tick numbers down an empty column. Reading each
 * child's real offsetTop cannot disagree with the browser, because it IS the
 * browser's answer.
 *
 * AND IT MEASURES THE <svg>, NOT THE <figure>. The tick positions are a
 * percentage of the box they sit in, and the only box whose height means
 * anything is the plot's: a panel whose netChange is null grows an "Observed …"
 * paragraph under its chart, and `align-items: stretch` then makes every
 * figure in that row taller than its own svg. Measuring the figure put the
 * ticks a paragraph's worth of pixels below the gridlines they label —
 * precisely on the rows with the most fragile data.
 */
function useGridRows(ref, signature) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => {
      const seen = new Map()
      for (const kid of el.children) {
        if (seen.has(kid.offsetTop)) continue
        // `svg[role="img"]` and not `svg`: the net-change chip renders a lucide
        // arrow, which is an <svg> ten pixels tall sitting EARLIER in the DOM
        // than the plot. A bare querySelector('svg') measures the arrow and
        // maps the whole axis onto it — the ticks land in a 10px band at the
        // top of the panel. The plot is the one that carries role="img".
        const plot = kid.querySelector('svg[role="img"]')
        // offsetTop/offsetHeight are HTMLElement properties and an <svg> has
        // NEITHER — reading them off the plot yields undefined, and `top: NaN`
        // is a style the browser drops on the floor. So the panel's own
        // offsetTop still fixes the row (it ignores the entry transform), and
        // the svg's position INSIDE it comes from the difference of two rects,
        // which the shared transform cancels out of.
        const kidBox = kid.getBoundingClientRect()
        const plotBox = plot ? plot.getBoundingClientRect() : null
        seen.set(kid.offsetTop, {
          top: kid.offsetTop + (plotBox ? plotBox.top - kidBox.top : 0),
          height: plotBox ? plotBox.height : kid.offsetHeight,
        })
      }
      setRows((prev) => {
        const next = [...seen.values()]
        // Same rows, same array — otherwise every resize tick re-renders the grid.
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
    }
    // ResizeObserver fires once on observe, so the first measurement arrives
    // from the callback rather than from a setState in the effect body.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const kid of el.children) {
      ro.observe(kid)
      const plot = kid.querySelector('svg')
      if (plot) ro.observe(plot)
    }
    return () => ro.disconnect()
    // `signature` changes whenever the panel set does — including the first
    // render that actually HAS a grid, since the view returns early while the
    // payload is still in flight and there is no node to observe yet.
  }, [ref, signature])
  return rows
}

/**
 * ONE axis for the whole grid, in a 52px rail. The panels repeat the gridlines
 * at the SAME y values and carry no numbers of their own, so there is exactly
 * one place on the page where the scale is stated.
 *
 * The tick block is repeated once per REAL grid row, because a wrapped second
 * row sitting beside blank rail would be an axis that stops applying halfway
 * down a chart it still governs.
 */
function YAxisRail({ ticks, scale, unit, caption, rows }) {
  const y = (v) => 30 + (1 - (v - scale.lo) / (scale.hi - scale.lo || 1)) * (148 - 26 - 30)
  return (
    <div className="relative hidden w-[52px] shrink-0 self-stretch sm:block" aria-hidden="true">
      {rows.map((row) => (
        <div key={row.top} className="absolute inset-x-0" style={{ top: row.top, height: row.height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-1.5 -translate-y-1/2 text-[9px] font-bold tabular-nums text-muted"
              style={{ top: `${(y(t) / 148) * 100}%` }}
            >
              {Number(t.toFixed(unit.decimals))}
            </span>
          ))}
        </div>
      ))}
      {rows.length > 0 ? (
        <span
          className="absolute left-0 origin-bottom-left whitespace-nowrap text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted"
          style={{ top: rows[0].top + rows[0].height, transform: 'rotate(-90deg) translateX(2px)' }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  )
}

// ── The view ─────────────────────────────────────────────────────────────────

export default function CohortLongitudinal({ payload, loading = false, error = '', onQuery, reduce = false }) {
  const [params, setParams] = useSearchParams()
  const peersOn = params.get('peers') === '1'
  const [span, setSpan] = useState('all')
  const gridRef = useRef(null)

  const ctx = payload?.context
  const rawPanels = payload?.panels
  // Memoised so the shared-scale useMemo below is keyed on something stable —
  // a fresh `[]` on every render would recompute the axis on every render.
  const allPanels = useMemo(() => rawPanels ?? [], [rawPanels])
  const schoolName = payload?.school?.name ?? null
  const unit = axisUnitOf(ctx)
  // The server decided direction against THIS gap; the legend must quote the
  // same number rather than recompute one from the family.
  const gap = ctx?.materialGap ?? unit.gap

  // THE SPAN CHIP FILTERS WHAT IS ALREADY HERE. The route takes an `endGrade`
  // and would happily serve one panel, but asking for it costs a round trip AND
  // throws away the list the chip itself is built from — the reader would pick
  // "Grades 2 → 5" and lose every other option. Narrowing the payload's own
  // panels keeps the chip honest and the interaction instant. It is a filter on
  // an array, not a recomputation of anything.
  const spanOptions = useMemo(() => allPanels.map((p) => ({ value: p.endGrade, label: p.label })), [allPanels])
  const chosen = span !== 'all' && allPanels.some((p) => p.endGrade === span) ? span : 'all'
  const panels = chosen === 'all' ? allPanels : allPanels.filter((p) => p.endGrade === chosen)

  // ── THE SHARED SCALE. Computed once, here, over every value on the page —
  // over ALL cohorts, not just the visible one, so narrowing to a single span
  // cannot silently rescale the axis under the reader. ──
  const { scale, ticks } = useMemo(() => {
    const values = []
    for (const p of allPanels) {
      for (const leg of p.focus?.legs ?? []) if (leg.value !== null && leg.value !== undefined) values.push(leg.value)
      if (peersOn) {
        for (const peer of p.peers ?? []) {
          for (const leg of peer.legs ?? []) if (leg.value !== null && leg.value !== undefined) values.push(leg.value)
        }
      }
    }
    // Clamped to the family's theoretical range at the edges only — a percentile
    // axis must not run past 99, and it must not sit on 1–99 either.
    const fitted = fitScale(values, ctx?.scoreRange, { pad: 0.18 })
    return { scale: fitted, ticks: niceTicks(fitted.lo, fitted.hi, 4) }
  }, [allPanels, peersOn, ctx?.scoreRange])

  // Keyed on the panel set so the rail re-measures whenever the grid reflows —
  // including the first render that actually has a grid to measure.
  const gridRows = useGridRows(gridRef, `${allPanels.length}|${chosen}|${peersOn}`)

  const single = panels.length === 1

  // BAND-OR-LINES IS ONE DECISION FOR THE WHOLE PAGE, NOT ONE PER PANEL.
  // Deciding it inside each panel from that panel's own peer count meant a peer
  // missing one cohort's grades drew lines in one panel and a band in the panel
  // beside it, under a single caption describing whichever of the two came
  // first. The organisation's size is the same on every panel, so the form is
  // too — and the note below quotes this same flag.
  const asBand = (ctx?.peerCount ?? 0) > 6

  const setPeers = (on) => {
    const next = new URLSearchParams(params)
    if (on) next.set('peers', '1')
    else next.delete('peers')
    setParams(next, { replace: true })
  }

  // A different window is a different panel set, so a span picked against the
  // old one cannot survive it.
  const setWindow = (w) => {
    setSpan('all')
    onQuery?.({ window: w })
  }

  const startYear = panels[0]?.startYear ?? null
  const endYear = panels[0]?.endYear ?? ctx?.endYear ?? null

  if (error) {
    return (
      <Section eyebrow="Longitudinal cohort" icon={Footprints} title="Follow the same children forward" reduce={reduce}>
        <p className="text-[13px] font-semibold text-danger">{error}</p>
      </Section>
    )
  }

  if (!payload) {
    return (
      <Section eyebrow="Longitudinal cohort" icon={Footprints} title="Follow the same children forward" reduce={reduce}>
        <p className="text-[12.5px] text-muted">Loading the cohorts…</p>
      </Section>
    )
  }

  return (
    // id: Penny walkthrough anchor 'academics.cohortPanels'. On the ROOT rather
    // than the grid itself — the grid carries a measurement ref and is absent in
    // the loading and empty branches, so anchoring there would park the owl
    // exactly when a reader most needs to be shown where the panels will appear.
    <div id="academics-cohort-panels" className="coh-root space-y-4">
      <PrintRules />

      <CohortControlBar
        ctx={ctx}
        spanOptions={spanOptions}
        span={chosen}
        onSpan={setSpan}
        onWindow={setWindow}
        peersOn={peersOn}
        onPeers={setPeers}
        onPrint={() => window.print()}
        loading={loading}
      />

      <Section
        eyebrow="Longitudinal cohort"
        icon={Footprints}
        title={
          startYear && endYear
            ? `The same students, ${startYear} through ${endYear}`
            : 'Follow the same children forward'
        }
        reduce={reduce}
        info={
          <WhatThisMeasures
            mode="popover"
            chart="cohortTrajectory"
            ctx={ctx}
            refs={['national']}
            gradeLabel={
              ctx?.gradeSpan?.lowGrade
                ? `grades ${ctx.gradeSpan.lowGrade}–${ctx.gradeSpan.highGrade}`
                : 'every grade on file'
            }
          />
        }
        aside={
          ctx?.window ? (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: `${COH_HUE}18`, color: COH_HUE }}
            >
              {startYear && endYear ? `${startYear}–${endYear} · ` : ''}
              {ctx.window}-year window
            </span>
          ) : null
        }
      >
        {/* The ⓘ's scope line names the GRADE SPAN, not one grade: "grade 4" is
            a category error on a chart whose subject is a group crossing grades.
            The series key stays in view. */}
        <MeasureKey ctx={ctx} refs={['national']} />

        {panels.length === 0 ? (
          <EmptyCohorts ctx={ctx} />
        ) : (
          <>
            {/* Only when the SERVER narrowed it. A reader who deliberately
                picked two years is not being told their own choice was a
                compromise — `requestedWindow` is what was asked for, `window`
                is what the grades on file allowed. */}
            {ctx?.requestedWindow > ctx?.window ? (
              <p className="mb-3 text-[11.5px] text-muted">
                Narrowed to {ctx.window} years — grades {ctx.gradeSpan?.lowGrade}–{ctx.gradeSpan?.highGrade} are all
                that is on file, so a longer cohort is not possible here.
              </p>
            ) : null}

            {single && ctx?.gradeSpan?.gradeDepth === ctx?.window ? (
              <p className="mb-3 text-[12px] text-muted">
                A {ctx.window}-year window covers this school&rsquo;s whole span — narrow to two years to see each
                transition.
              </p>
            ) : null}

            {/* THE PHONE'S ONLY SCALE STATEMENT. The rail is `hidden sm:block`
                and the panels carry no axis numbers of their own, so below the
                breakpoint the grid would be unlabelled lines. Same ticks, same
                unit — one line instead of a rail. */}
            {ticks.length > 1 ? (
              <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted sm:hidden">
                {Number(ticks[0].toFixed(unit.decimals))}–{Number(ticks[ticks.length - 1].toFixed(unit.decimals))}{' '}
                {unit.label}
              </p>
            ) : null}

            <div
              className={`flex gap-2.5 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}
              style={single ? { maxWidth: 440, marginInline: 'auto' } : undefined}
            >
              <YAxisRail
                ticks={ticks}
                scale={scale}
                unit={unit}
                caption={railCaption(ctx)}
                rows={gridRows}
              />
              <div
                ref={gridRef}
                // `relative` is load-bearing, not cosmetic: the rail positions
                // its tick blocks at each panel's offsetTop, and offsetTop is
                // measured from the nearest POSITIONED ancestor. Without this
                // the offsets are taken from somewhere up the page and the
                // whole axis slides down it.
                className="coh-grid relative grid min-w-0 flex-1"
                style={{
                  gap: GRID_GAP,
                  gridTemplateColumns: single ? '1fr' : `repeat(auto-fit, minmax(${PANEL_MIN}px, 1fr))`,
                }}
              >
                {panels.map((panel, i) => (
                  <CohortTrajectoryPanel
                    key={panel.key}
                    panel={panel}
                    scale={scale}
                    ticks={ticks}
                    unit={unit}
                    gap={gap}
                    national={ctx?.nationalReference}
                    peersOn={peersOn}
                    asBand={asBand}
                    peerCount={ctx?.peerCount ?? 0}
                    schoolName={schoolName}
                    index={i}
                    wide={single}
                    reduce={reduce}
                  />
                ))}
              </div>
            </div>

            {peersOn ? (
              <p className="mt-2.5 text-[11px] text-muted">
                {asBand ? (
                  <>
                    {/* NO INVENTED DENOMINATOR. This said "all {'{'}peerCount + 1{'}'} schools",
                        a number the browser did the arithmetic for — and one that is
                        wrong twice over: a peer missing a cohort's grades is in
                        peerCount but not in that panel's average, so the panels here
                        run 9 and 12 schools deep under a single caption. The count
                        that IS page-level is the peer schools drawn somewhere; the
                        line's own denominator is per-panel, so the sentence says
                        which schools rather than how many. */}
                    The grey band is the range across the other {ctx?.peerCount} schools at each grade, and the{' '}
                    <span style={{ color: INK.network }}>blue dashed line</span> is the average of the schools drawn in
                    that panel, this one included.
                  </>
                ) : (
                  <>
                    Grey lines are the other {ctx?.peerCount} school{ctx?.peerCount === 1 ? '' : 's'} in this
                    organisation, on the same axis.
                  </>
                )}
              </p>
            ) : null}

            <CohortsFootnote ctx={ctx} unit={unit} gap={gap} />
          </>
        )}
      </Section>

      {payload?.matrix && panels.length > 0 ? (
        <Section
          eyebrow="Cohort summary"
          icon={Grid3x3}
          title="Net change by cohort and subject"
          reduce={reduce}
          delay={0.06}
        >
          {/* No second WhatThisMeasures: the legend below already states the
              threshold and the unit, and two explanations of one table is how a
              reader learns to skip both. */}
          <CohortMatrix
            matrix={payload.matrix}
            // The panel key and the matrix row key are the SAME string on both
            // sides (the server builds them from one function), so narrowing to
            // a span narrows the table to exactly that row.
            onlyKeys={chosen === 'all' ? null : panels.map((p) => p.key)}
            unit={unit}
            gap={gap}
            schoolName={schoolName}
            reduce={reduce}
          />
          {peersOn ? (
            // Deliberate: the matrix stays focus-school-only whatever the peer
            // toggle says. A grid of every school × every cohort × every subject
            // is a spreadsheet, not a finding.
            <p className="mt-2 text-[11px] text-muted">
              This table is {schoolName ?? 'this school'} only — the peer lines above do not change it.
            </p>
          ) : null}
        </Section>
      ) : null}

      {panels.length > 0 ? <HowToRead unit={unit} gap={gap} ctx={ctx} reduce={reduce} /> : null}
    </div>
  )
}

// ── Supporting copy ──────────────────────────────────────────────────────────

/** The server says WHY in words; the view never guesses. */
function EmptyCohorts({ ctx }) {
  return (
    <div className="border-y border-hair px-5 py-8 text-center">
      <Footprints size={20} className="mx-auto mb-2" style={{ color: COH_HUE }} />
      <p className="mx-auto max-w-lg text-[13px] leading-relaxed text-muted">
        {ctx?.reason ??
          'A cohort needs the same children measured twice — load a second year of results and this fills in.'}
      </p>
      {ctx?.gradeSpan?.gradesOnFile?.length > 0 ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-muted">
          On file: grades {ctx.gradeSpan.gradesOnFile.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function CohortsFootnote({ ctx, unit, gap }) {
  const profile = ctx?.gradeSpan?.fromProfile
  const spanMismatch =
    profile?.gradeLow &&
    ctx?.gradeSpan?.lowGrade &&
    (String(profile.gradeLow) !== String(ctx.gradeSpan.lowGrade) ||
      String(profile.gradeHigh) !== String(ctx.gradeSpan.highGrade))

  return (
    <p className="mt-3 text-[11px] leading-relaxed text-muted">
      Scores are shown as a <span className="font-semibold text-navy/70">{unit.label}</span>
      {unit.span ? ` (${unit.span})` : ''}. Net change is the end-grade score minus the start-grade score, in{' '}
      {unit.points}; a move smaller than <span className="font-semibold text-navy/70">{gap ?? '—'} {unit.points}</span>{' '}
      counts as neither up nor down.
      {ctx?.weighting === 'simple'
        ? ' At least one year arrived without a tester count, so those averages are unweighted.'
        : ' Averages are weighted by the number of students tested.'}
      {ctx?.truncated
        ? ` Showing the ${ctx.panelsAvailable ? `latest of ${ctx.panelsAvailable}` : 'latest'} cohorts these grades support.`
        : ''}
      {spanMismatch
        ? ` Grades ${ctx.gradeSpan.lowGrade}–${ctx.gradeSpan.highGrade} have results on file; this school's profile says ${profile.gradeLow}–${profile.gradeHigh}.`
        : ''}
    </p>
  )
}

/** Three blocks about READING the grid, not about the unit — the strip above
 *  already carries the unit, and repeating it teaches the reader to skip both. */
function HowToRead({ unit, gap, ctx, reduce }) {
  const blocks = [
    {
      k: 'One axis, every panel',
      v: `Every cohort is drawn on the same ${unit.label} scale, so a line sitting lower is a genuinely lower group — not a panel zoomed differently.`,
    },
    {
      k: 'Read across, not just down',
      v: 'A row of the table below tells you whether a decline was one subject or the whole battery. One subject is a curriculum question; the battery is a cohort question.',
    },
    {
      k: 'Small moves are not moves',
      v: `A change smaller than ${gap ?? 'the materiality floor'} ${unit.points} is marked as neither up nor down${
        ctx?.window ? `, and a ${ctx.window}-year change is a ${ctx.window}-year claim — the ends, not the best year in between` : ''
      }.`,
    },
  ]
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: COH_EASE, delay: 0.1 }}
      className="grid gap-x-8 gap-y-3 border-t border-hair pt-4 sm:grid-cols-3"
    >
      {blocks.map((b) => (
        <div key={b.k}>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: COH_HUE }}>
            {b.k}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{b.v}</p>
        </div>
      ))}
    </motion.div>
  )
}

/**
 * PRINT IS THE EXPORT — deliberately, for now.
 *
 * There is no academics export endpoint and ExportMenu is bound to the finance
 * workbook, so a CSV pipeline here would be a whole new seam built for one
 * button. The browser already renders this to PDF perfectly well once the
 * chrome is out of the way and the motion is at rest.
 */
function PrintRules() {
  return (
    <style>{`
      @media print {
        .coh-controls, .coh-noprint { display: none !important; }
        .coh-root * { animation: none !important; transition: none !important; }
        .coh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .coh-panel { break-inside: avoid; box-shadow: inset 0 0 0 1px rgba(16,28,61,0.18) !important; }
        .coh-matrix-scroll { overflow: visible !important; }
        .coh-matrix-stick { position: static !important; }
      }
    `}</style>
  )
}
