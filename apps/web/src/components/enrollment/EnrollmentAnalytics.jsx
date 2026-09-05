// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT ANALYTICS — the module's Analytics tab.
//
// One read (`GET …/enrollment/analytics`) behind a whole dashboard: a dark hero
// band of registry tiles, a bento of charts, what the gap costs, every grade in
// figures, and the two surfaces that report on the data rather than from it.
//
// ── THE PAGE IS FOUR VIEWS, NOT ONE COLUMN ──────────────────────────────────
// All of that used to be a single ~4,500px scroll, which meant most of it was
// never seen and none of it could be linked to. It is now four doors behind a
// `?view=` tab strip (EnrollmentAnalyticsTabs) — Trend · Grades · Cohorts ·
// Who's here — because those are four different questions rather than four
// slices of one.
//
// THREE THINGS DELIBERATELY DO NOT MOVE INTO A VIEW:
//   • the HERO VITALS BAND stays pinned above the strip. It is the school's
//     headcount and the "as of" date every card below is qualified by, and it is
//     the one thing that is equally true on all four views.
//   • the RECONCILIATION STRIP stays pinned under it — it is about the tiles and
//     the grade charts disagreeing, and those now live on two different views.
//   • the two HONESTY SURFACES stay pinned at the foot: they qualify every
//     figure on the page, so filing them behind one tab would leave the other
//     three unqualified.
//
// ── THE ONE RULE THIS FILE EXISTS TO KEEP ───────────────────────────────────
// The server computed everything — counts, shares, gaps, gap percentages, net
// changes, directions, staleness, suppression. This file and its children lay
// out and format; they do not calculate. The only maths here is geometry (a
// value's position in a domain), and even that reads domains the server sized.
// The moment a percentage is derived in the browser it becomes the first figure
// on the page with no canonical definition, and the first one able to disagree
// with the board packet printed from the same data.
//
// ── WHAT MAKES THIS BEAT THE DECK IT REPLACES ───────────────────────────────
// Flash is the easy half — the navy band, the count-ups, the gradient washes,
// the stroke draw-in. The half the deck fails is legibility, and where the two
// conflict legibility wins:
//   • ZERO-BASED AXES ALWAYS. Their "Enrollment over Time" starts its y-axis at
//     2,400 and turns a 3% wobble into a mountain range.
//   • AN "AS OF" ON EVERY ROSTER-DERIVED CARD, amber once the server calls the
//     reading stale — because a count is a claim about a specific day.
//   • OBSERVED vs PLANNED AS A VISUAL CLASS DISTINCTION, never two solid bars.
//   • NO PIE for a skewed eight-part distribution.
//   • SUPPRESSION IS A BLANK WITH A REASON, never a zero, never interpolated.
//
// Every card carries a source-aware sentence saying what is plotted — and the
// sentence genuinely differs for a live register versus a dated file, because
// those are different claims about the world.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BarChart3, Coins } from 'lucide-react'
import '../../styles/analytics-v2.css'
import ChartCard from '../analytics/v2/ChartCard.jsx'
import V2StatTile from '../analytics/v2/V2StatTile.jsx'
import { formatMetric, formatMetricDeltaOf } from '../analytics/v2/helpers.js'
import { deltaTone } from '../../lib/metricMeta.js'
import { useEnrollmentAnalytics } from '../../hooks/useEnrollmentAnalytics.js'
import { useBriefing } from '../../hooks/useBriefing.js'
import EnrollmentHeadcountTrend from './EnrollmentHeadcountTrend.jsx'
import EnrollmentGradeHeatmap from './EnrollmentGradeHeatmap.jsx'
import EnrollmentCohortSize from './EnrollmentCohortSize.jsx'
import EnrollmentVsPlanChart from './EnrollmentVsPlanChart.jsx'
import { EnrollmentDemographicsCard, EnrollmentSupportNeedsCard } from './EnrollmentMixCards.jsx'
import { EnrollmentNotes, ReconciliationStrip, UnavailableBlock } from './EnrollmentHonesty.jsx'
import EnrollmentGradeTable from './EnrollmentGradeTable.jsx'
import RosterAnalyticsSection from './RosterAnalyticsSection.jsx'
import EnrollmentAnalyticsTabs, {
  EnrollmentAnalyticsPanel,
  useEnrollmentAnalyticsView,
  useEnrollmentCohortWindow,
} from './EnrollmentAnalyticsTabs.jsx'
import {
  AsOfChip,
  ChartCaption,
  ENROLL_HUE,
  PLAN_INK,
  RefChip,
  WhatThisMeasures,
  fmtCount,
  fmtDate,
  providerLabel,
  schoolYearLabel,
} from './enrollmentAnalyticsKit.jsx'

const COHORT_MOVE_FLOOR = 3

/** The navy band the tiles sit on — the BriefingBand's sibling idiom. */
function HeroBand({ eyebrow, right, children, reduce }) {
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-label={eyebrow}
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.5), transparent)' }}
      />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-sky-300/80">{eyebrow}</span>
          {right}
        </div>
        {children}
      </div>
    </motion.section>
  )
}

/**
 * Q6 — WHAT THE GAP COSTS, rendered from the briefing item VERBATIM.
 *
 * The tuition-and-cash consequence of missing plan is already computed, already
 * worded and already quoted on the home briefing. Recomputing it here would put
 * two dollar figures for one fact on two pages, and eventually they would
 * differ. So this strip forwards the item and adds nothing but a frame.
 *
 * There is deliberately NO CHART here: it is one sentence and two numbers, and a
 * chart would decorate a claim that is already fully stated.
 */
function ImpactStrip({ items, reduce }) {
  if (!items.length) return null
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4 }}
      aria-label="What this means for the budget"
      className="av2-card overflow-hidden p-0"
    >
      <div className="flex items-center gap-2 border-b border-navy/[0.07] px-4 py-2.5 sm:px-5">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-500/12 text-emerald-700">
          <Coins size={13} />
        </span>
        <h3 className="font-serif text-[15px] font-semibold text-navy">What this means for the budget</h3>
      </div>
      <ul className="divide-y divide-navy/[0.06]">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-3 sm:px-5">
            <p className="text-[13.5px] font-semibold leading-snug text-navy">{it.title}</p>
            {it.why ? <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{it.why}</p> : null}
            {it.link ? (
              <Link
                to={it.link}
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-sky-700 hover:underline"
              >
                Take a look <ArrowRight size={12} />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </motion.section>
  )
}

export default function EnrollmentAnalytics({ schoolId, periodId, rosterMode = false, onGoToAddData = null }) {
  const reduce = useReducedMotion()
  const [view, setView] = useEnrollmentAnalyticsView()
  // The cohort ladder LENGTH is a URL setting and a REQUEST parameter: the set
  // of cohorts that exist at four grades is not a filter over the set that
  // exists at two, so the server is asked again rather than the client sliced.
  const [cohortWindow, setCohortWindow] = useEnrollmentCohortWindow()
  const { data, loading, error, notLicensed, notEntitled, reload } = useEnrollmentAnalytics(schoolId, periodId, {
    cohortWindow,
  })
  // The briefing is fetched separately and FILTERED, rather than the analytics
  // service taking a heavy BriefingService dependency for one sentence.
  const { data: briefing } = useBriefing(schoolId, periodId)
  const impactItems = useMemo(
    () => (briefing?.items ?? []).filter((i) => i.source === 'enrollment'),
    [briefing],
  )

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-page space-y-4 px-4 py-8 sm:px-10">
        <div className="h-40 animate-pulse rounded-2xl bg-navy/[0.06]" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl border border-rule/40 bg-white/60" />
          <div className="h-64 animate-pulse rounded-2xl border border-rule/40 bg-white/60" />
        </div>
      </div>
    )
  }

  if (notLicensed || notEntitled) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="card-soft px-6 py-12 text-center">
          <p className="text-[15px] text-muted">
            {notLicensed
              ? 'Enrollment analytics come with the Enrollment module.'
              : 'Your subscription is paused, so this analysis is unavailable.'}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="rounded-2xl border border-danger/30 bg-danger/[0.06] px-6 py-10 text-center">
          <p className="text-[15px] text-danger">{error}</p>
          <button
            onClick={reload}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-4 py-2 text-[15px] font-semibold text-navy transition-all hover:bg-gold/20"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const {
    asOf,
    tiles = [],
    trend,
    gradeByYear,
    ladder,
    cohortSize,
    vsPlan,
    planFailed,
    reconciliation,
    demographics,
    mix,
    notes = [],
    unavailable = [],
    minCell = 5,
    period,
  } = data

  const asOfChip = <AsOfChip asOf={asOf} />
  const live = asOf?.source === 'roster'
  const sourceScope = asOf
    ? `${live ? 'Live register' : `Filed reading${asOf.provider ? ` · ${providerLabel(asOf.provider)}` : ''}`} · ${fmtDate(
        asOf.observedOn,
      )}`
    : 'No reading on file'

  // The headcount tile gets a real series under it — the same dated readings E1
  // draws, so the sparkline and the chart cannot tell different stories.
  const trendVals = (trend?.points ?? []).map((p) => p.total)
  const sparkFor = (key) => (key === 'enrollment_headcount' && trendVals.length >= 2 ? trendVals : null)

  const yearSpan =
    gradeByYear?.years?.length > 1
      ? `${schoolYearLabel(gradeByYear.years[0])} → ${schoolYearLabel(gradeByYear.years[gradeByYear.years.length - 1])}`
      : gradeByYear?.years?.length === 1
        ? schoolYearLabel(gradeByYear.years[0])
        : null

  return (
    // pb-28 below lg: the floating Penny coin is fixed bottom-right, and at
    // narrow widths this data-dense page's last rows (E4's school total, E5's
    // donut) could never scroll clear of it — the coin sat ON the figures.
    // Clearance beats repositioning the coin: everything stays reachable and
    // the coin behaves like every other page's.
    <div className="mx-auto max-w-page space-y-4 px-4 py-8 pb-28 sm:px-10 lg:pb-8">
      {/* ── HERO: the registry tiles, and ONLY the ones the server sent. A tile
          the server could not compute is absent, never a card of em-dashes. ── */}
      <HeroBand eyebrow="Enrollment vitals" right={asOfChip} reduce={reduce}>
        {tiles.length ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t, i) => (
              <V2StatTile
                key={t.key}
                index={i}
                label={t.boardLabel ?? t.label}
                // PRE-FORMATTED by the canonical formatter, so a tile here and
                // the same metric on the scorecard print the same string.
                value={formatMetric(t)}
                delta={t.periodOverPeriodDelta}
                deltaText={formatMetricDeltaOf(t)}
                deltaTone={deltaTone(t.periodOverPeriodDelta, t.goodDirection)}
                status={t.status}
                sparkVals={sparkFor(t.key)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] leading-relaxed text-white/70">
            No period-anchored figures yet. Once a fiscal year holds an enrollment headcount, the vitals appear here —
            the same numbers your briefing and board pack quote.
          </p>
        )}
      </HeroBand>

      {/* HONESTY SURFACE 1 — PINNED, not filed under a view. It exists because
          the TILES (promoted headcount) and the GRADE CHARTS (current reading)
          can quote two different observations. Half of that pair lives above the
          strip and the other half is on the Grades tab, so a reader who opened
          Grades directly would compare a vs-plan table against a tile drawn from
          a different day with nothing on screen saying so — precisely the
          confusion this strip was built to prevent. It renders only when the two
          have actually diverged, so pinning it costs nothing the rest of the
          time. */}
      <ReconciliationStrip
        reconciliation={reconciliation}
        periodLabel={period?.label}
        onResync={onGoToAddData}
        reduce={reduce}
      />

      {/* ── THE FOUR DOORS ── */}
      <EnrollmentAnalyticsTabs view={view} onView={setView} />

      <EnrollmentAnalyticsPanel view={view}>
      {/* ── TREND — the whole school, over time, and what the gap costs ── */}
      {view === 'trend' ? (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* E1.
            ── PROSE → PROGRESSIVE DISCLOSURE (this card and every chart card
            below): the full WhatThisMeasures paragraph moves VERBATIM into the
            card's ⓘ popover — every honesty sentence survives, none is read as a
            wall — and the body leads with ONE short caption plus the scope stamp
            and any reference-line key, which are data and stay in view. */}
        <ChartCard
          id="enr-trend"
          sub="E1 · Over time"
          title="Headcount over time"
          asOf={asOfChip}
          className="lg:col-span-2"
          info={
            <WhatThisMeasures
              scope={sourceScope}
              reduce={reduce}
              refs={
                trend?.planTotal != null ? (
                  <RefChip
                    color={PLAN_INK}
                    name="Plan"
                    value={fmtCount(trend.planTotal)}
                    gloss="the headcount you planned for — intended, never counted"
                  />
                ) : null
              }
              note="The vertical axis starts at zero and is not truncated, so the height of a rise on this chart is the size of the rise."
            >
              {live ? (
                <>
                  Each point is one day&apos;s headcount <strong className="font-semibold text-navy">counted from your
                  live student register</strong> — one reading per day, on the day it changed.
                </>
              ) : (
                <>
                  Each point is one <strong className="font-semibold text-navy">enrollment reading you filed</strong>,
                  placed on the day it describes rather than in the order it arrived — so a year&apos;s gap looks like a
                  year.
                </>
              )}
            </WhatThisMeasures>
          }
        >
          <ChartCaption
            scope={sourceScope}
            refs={
              trend?.planTotal != null ? (
                <RefChip
                  color={PLAN_INK}
                  name="Plan"
                  value={fmtCount(trend.planTotal)}
                  // The IN-VIEW key keeps the class distinction visible without
                  // opening the ⓘ: plan is an intention, not an observation.
                  gloss="intended, never counted"
                />
              ) : null
            }
          >
            {live
              ? 'One reading per day from your live register — the axis starts at zero.'
              : 'Each filed reading, placed on the day it describes — the axis starts at zero.'}
          </ChartCaption>
          <EnrollmentHeadcountTrend points={trend?.points ?? []} planTotal={trend?.planTotal ?? null} reduce={reduce} />
        </ChartCard>

        {/* Q6 — forwarded verbatim from the briefing, never recomputed. It sits
            with the TREND rather than with the grades that decompose the gap:
            it is a whole-school consequence stated in dollars, which is the
            question this view answers ("how are we doing, and so what"). */}
        {impactItems.length ? (
          <div className="lg:col-span-2">
            <ImpactStrip items={impactItems} reduce={reduce} />
          </div>
        ) : null}
      </div>
      ) : null}

      {/* ── GRADES — where the miss actually is, chart then figure ── */}
      {view === 'grades' ? (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* E4 — the marquee. */}
        <ChartCard
          id="enr-vs-plan"
          sub="E4 · Against plan"
          title="Which grades carry the miss"
          asOf={asOfChip}
          className="lg:col-span-2"
          info={
            <WhatThisMeasures
              scope={sourceScope}
              reduce={reduce}
              note="Colour sits on the GAP, not on the bar: a grade under plan is not a red grade, it is a grade with a red gap."
            >
              Two marks per grade, and they are deliberately different kinds of mark. The{' '}
              <strong className="font-semibold text-navy">solid bar is the actual</strong> — children somebody counted{' '}
              {live ? 'on your register' : 'in the reading you filed'}. The{' '}
              <strong className="font-semibold text-navy">dashed outline is the plan</strong> — a figure typed into a
              budget that nobody ever counted. The whole-school number tells you that you missed; this tells you where.
            </WhatThisMeasures>
          }
        >
          <ChartCaption scope={sourceScope}>
            Solid bar = counted actual · dashed outline = the plan nobody counted.
          </ChartCaption>
          <EnrollmentVsPlanChart
            vsPlan={vsPlan}
            planFailed={planFailed}
            periodLabel={period?.label}
            minCell={minCell}
            reduce={reduce}
          />
        </ChartCard>

        {/* E2 */}
        <ChartCard
          id="enr-heatmap"
          sub="E2 · Grade × year"
          title="Every grade, every year"
          asOf={asOfChip}
          className="lg:col-span-2"
          info={
            <WhatThisMeasures scope={yearSpan ? `${sourceScope} · ${yearSpan}` : sourceScope} reduce={reduce}>
              Every cell is the headcount in <strong className="font-semibold text-navy">one grade in one school
              year</strong>, shaded on a single scale that starts at zero — so a cell here is comparable to any other
              cell, in any row or column. Read <strong className="font-semibold text-navy">across a row</strong> for how
              one grade has moved, and <strong className="font-semibold text-navy">down a column</strong> for the shape
              of the school that year. Each column is dated with the reading it came from.
            </WhatThisMeasures>
          }
        >
          <ChartCaption scope={yearSpan ? `${sourceScope} · ${yearSpan}` : sourceScope}>
            One cell = one grade in one school year, all shaded on one zero-based scale.
          </ChartCaption>
          <EnrollmentGradeHeatmap gradeByYear={gradeByYear} minCell={minCell} reduce={reduce} />
        </ChartCard>

        {/* The charts' twin: every figure, printed. It belongs with the two
            charts it prints — the table IS "every grade, in figures", and a
            reader who distrusts a bar wants the number in the same view, not
            four screens away on a tab about something else. */}
        <div className="lg:col-span-2">
          <EnrollmentGradeTable
            ladder={ladder}
            vsPlan={vsPlan}
            gradeByYear={gradeByYear}
            minCell={minCell}
            reduce={reduce}
          />
        </div>
      </div>
      ) : null}

      {/* ── COHORTS — one class, followed up the grades ── */}
      {view === 'cohorts' ? (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* E3 — the star. */}
        <ChartCard
          id="enr-cohorts"
          sub="E3 · Following a class"
          title="Cohort size progression"
          asOf={asOfChip}
          className="lg:col-span-2"
          info={
            <WhatThisMeasures
              scope={yearSpan ? `${sourceScope} · ${yearSpan}` : sourceScope}
              reduce={reduce}
              note="A year that was hidden or never filed BREAKS the line rather than being drawn through — a dashed connector spans the gap so the eye is not left to invent one."
            >
              Each panel follows <strong className="font-semibold text-navy">one class as it moves up the
              grades</strong>, every point that class&apos;s headcount on that rung. Every panel shares{' '}
              <strong className="font-semibold text-navy">one axis starting at zero</strong>, so a line sitting lower is
              a genuinely smaller class and not a panel drawn to its own scale.{' '}
              <strong className="font-semibold text-navy">This is class SIZE, not retention.</strong> A rung holding 95%
              as many bodies as last year is not 95% of the same children — students transfer in and out, and this data
              cannot tell them apart, because a student&apos;s grade is overwritten on every import and last year&apos;s
              is gone.
            </WhatThisMeasures>
          }
        >
          <ChartCaption scope={yearSpan ? `${sourceScope} · ${yearSpan}` : sourceScope}>
            One panel = one class followed up the grades, all on one zero-based axis — class size, not retention.
          </ChartCaption>
          <EnrollmentCohortSize
            cohortSize={cohortSize}
            moveFloor={COHORT_MOVE_FLOOR}
            minCell={minCell}
            reduce={reduce}
            // The pill reflects the reader's pick straight away when it is one
            // the server said it would take; otherwise the server's own echo
            // wins, so a pasted `?window=5` on a three-year school shows the 3.
            selectedWindow={cohortWindow}
            onWindow={setCohortWindow}
            loading={loading}
          />
        </ChartCard>
      </div>
      ) : null}

      {/* ── WHO'S HERE — the people behind the counts ── */}
      {view === 'who' ? (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* E5 */}
        <ChartCard
          id="enr-demographics"
          sub="E5 · Who is here"
          title="Demographic mix"
          asOf={asOfChip}
          info={
            <WhatThisMeasures
              scope={sourceScope}
              reduce={reduce}
              note="Nothing here is read off an angle: the ring carries the SHAPE of the mix, and every figure is printed at full size in the key beneath it. A category under five students is listed but not drawn — sizing a slice for it would put the withheld count back on the page as geometry."
            >
              One ring per breakdown, with the{' '}
              <strong className="font-semibold text-navy">counted student total in the centre</strong> and every category
              below it as a <strong className="font-semibold text-navy">count of students</strong> and its share of that
              total — counts first, because three per cent of a hundred students is three children. Colour marks the
              category and carries no judgement.
            </WhatThisMeasures>
          }
        >
          <ChartCaption scope={sourceScope}>
            Counts first — every figure is printed in the key, nothing is read off an angle.
          </ChartCaption>
          <EnrollmentDemographicsCard demographics={demographics} />
        </ChartCard>

        {/* E7 */}
        <ChartCard
          id="enr-support"
          sub="E7 · Support needs"
          title="Support needs and register status"
          asOf={asOfChip}
          info={
            <WhatThisMeasures
              scope={sourceScope}
              reduce={reduce}
              note={`Support flags are hidden hard: with fewer than ${minCell} students a flag identifies a child by name to anyone who knows the school.`}
            >
              Counts of students carrying each support flag on{' '}
              <strong className="font-semibold text-navy">your own register</strong>, and how that register breaks down
              by status. Counts, not percentages — a share would round real children away.
            </WhatThisMeasures>
          }
        >
          <ChartCaption scope={sourceScope}>
            Counts of support flags on your register — under-{minCell} cells stay hidden, never zero.
          </ChartCaption>
          <EnrollmentSupportNeedsCard mix={mix} />
        </ChartCard>

        {/* MOVED HERE FROM THE OVERVIEW. A different question from the charts
            above — "who is on my register", filterable — rather than "how is
            enrollment doing". Its own headcount trend is dropped: E1 is that
            chart, and the same line twice on one page is noise. It lands on THIS
            view because it asks E5's and E7's question with the filters live. */}
        {rosterMode ? (
          <section aria-label="Explore the register" className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <BarChart3 size={15} style={{ color: ENROLL_HUE }} />
              <h3 className="font-serif text-[16px] font-semibold text-navy">Explore the register</h3>
              <span className="text-[12px] text-muted">— filter your roster and watch every mix respond</span>
            </div>
            <RosterAnalyticsSection schoolId={schoolId} />
          </section>
        ) : null}
      </div>
      ) : null}
      </EnrollmentAnalyticsPanel>

      {/* ── PINNED FOOT, ON EVERY VIEW ─────────────────────────────────────────
          These two qualify EVERY figure on the page, not the four on whichever
          view you opened: the notes name which reading each chart was drawn from
          and where a series breaks, and "can't show yet" is what stops a reader
          hunting for a percent-full gauge and mistaking a neighbouring number for
          it. Filing them on the last tab would leave the other three views
          silently unqualified — the reader who never opens "Who's here" is
          exactly the one who needs them. They are calm and they sit at the foot,
          so the cost of carrying them everywhere is a scroll nobody has to take.
          ─────────────────────────────────────────────────────────────────────── */}
      <EnrollmentNotes notes={notes} reduce={reduce} />

      {/* HONESTY SURFACE 2 — the boundary of what the data supports, named. */}
      <UnavailableBlock unavailable={unavailable} reduce={reduce} />
    </div>
  )
}
