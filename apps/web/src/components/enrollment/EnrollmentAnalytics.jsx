// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT ANALYTICS — the module's Analytics tab.
//
// One read (`GET …/enrollment/analytics`) behind a whole dashboard: a Stat strip
// of registry vitals, the charts in Sections on the ground, what the gap costs,
// every grade in figures, and the two surfaces that report on the data rather
// than from it. PREMIUM UI P4: no dark band, no tiles — Stats, rules, ground.
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
import { useLocation } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { BarChart3, CircleDollarSign, GraduationCap, LayoutGrid, LineChart, TrendingUp, Users, Wrench } from 'lucide-react'
import '../../styles/analytics-v2.css'
import '../../styles/pending/aurora-enroll-acad.css'
import ChartCard from '../analytics/v2/ChartCard.jsx'
import { formatMetric, formatMetricDeltaOf } from '../analytics/v2/helpers.js'
import { AddDataCta, RecordsCta } from '../module/ModuleCtas.jsx'
import { DomainStatePanel } from '../domain/DomainCommandCenter.jsx'
import {
  AuroraHero,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  AuroraButton,
  AuroraLightButton,
  VerdictEm,
  toVerdict,
  fyLabel,
} from '../ui/aurora/index.js'
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
function ImpactStrip({ items }) {
  if (!items.length) return null
  return (
    <AuroraSection
      icon={CircleDollarSign}
      hue="var(--au-h2)"
      title="What it means for the budget"
      subtitle="Tuition and cash, from your briefing"
      aria-label="What this means for the budget"
    >
      <AuroraTileGrid cols={Math.min(3, Math.max(2, items.length))}>
        {items.map((it) => (
          <AuroraTile
            key={it.id}
            icon={CircleDollarSign}
            tone={toVerdict(it.severity ?? it.tone) ?? null}
            title={it.title}
            desc={it.why ? firstSentence(it.why) : null}
            tip={it.why ?? undefined}
            verdict={toVerdict(it.severity ?? it.tone)}
            to={it.link ?? undefined}
          />
        ))}
      </AuroraTileGrid>
    </AuroraSection>
  )
}

/** The first sentence of a server-authored line (the full text rides the tooltip). */
function firstSentence(text) {
  const m = String(text).match(/^.+?[.!?](\s|$)/)
  return m ? m[0].trim() : String(text)
}

/** The view strips: one medallion heading per door. */
const VIEW_STRIP = {
  trend: { icon: LineChart, title: 'How it moved', subtitle: 'The whole school, over time' },
  grades: { icon: GraduationCap, title: 'Where the miss is', subtitle: 'Grade by grade, against plan' },
  cohorts: { icon: Users, title: 'Following a class', subtitle: 'One class, up the grades' },
  who: { icon: LayoutGrid, title: "Who's here", subtitle: 'The mix behind the counts' },
}

export default function EnrollmentAnalytics({
  schoolId,
  periodId,
  rosterMode = false,
  onGoToAddData = null,
  schoolName = null,
  periodLabel = null,
}) {
  const reduce = useReducedMotion()
  const { pathname } = useLocation()
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
      <DomainStatePanel
        moduleKey="enrollment"
        title="Enrollment"
        eyebrow="Analytics"
        verdict="Loading the analysis…"
        icon={BarChart3}
        text="Fetching trends, grades and cohorts."
        busy
      />
    )
  }

  if (notLicensed || notEntitled) {
    return (
      <DomainStatePanel
        moduleKey="enrollment"
        title="Enrollment"
        eyebrow="Analytics"
        verdict={notLicensed ? 'Analytics come with the Enrollment module.' : 'Your subscription is paused.'}
        icon={BarChart3}
        text={
          notLicensed
            ? 'Enrollment analytics come with the Enrollment module.'
            : 'Your subscription is paused, so this analysis is unavailable.'
        }
        action={
          <AuroraLightButton variant="ghost" to="/settings/billing">
            See plans
          </AuroraLightButton>
        }
      />
    )
  }

  if (error) {
    return (
      <DomainStatePanel
        moduleKey="enrollment"
        title="Enrollment"
        eyebrow="Analytics"
        verdict="We couldn't load the analysis just now."
        icon={Wrench}
        text={error}
        action={
          <AuroraLightButton variant="ghost" onClick={reload}>
            Try again
          </AuroraLightButton>
        }
      />
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

  // ── The band: eyebrow, verdict and glass figures from the registry tiles ──
  const bandEyebrow =
    [
      periodLabel ? fyLabel(periodLabel) : null,
      'Analytics',
      asOf?.observedOn ? `as of ${fmtDate(asOf.observedOn)}${asOf.stale ? ` · ${asOf.staleDays} days old` : ''}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null
  // ── Plain words for the registry tiles (the registry label is jargon on a
  // band: "Enrollment vs Plan", "Enrollment Change (YoY)"). ──
  const head = tiles.find((t) => t.key === 'enrollment_headcount') ?? null
  const vsTile = tiles.find((t) => t.key === 'enrollment_vs_plan') ?? null
  const headN = head && Number.isFinite(Number(head.value)) ? Number(head.value) : null
  const planN = vsPlan?.totals && Number.isFinite(Number(vsPlan.totals.plan)) ? Number(vsPlan.totals.plan) : null
  // The gap is taken from the SAME promoted headcount the band quotes (and the
  // vs-plan tile is computed from), so the sentence, the card and the tile can
  // never describe two different readings.
  const planGap = headN != null && planN != null ? Math.round(headN - planN) : null
  const headDelta =
    head && Number.isFinite(Number(head.periodOverPeriodDelta)) ? Math.round(Number(head.periodOverPeriodDelta)) : null
  const trueMinus = (v) => (v == null ? v : String(v).replace(/^-/, '−'))
  const signedN = (n) => (n > 0 ? `+${fmtCount(n)}` : n < 0 ? `−${fmtCount(Math.abs(n))}` : '0')
  const PLAIN = {
    enrollment_headcount: { label: 'Students enrolled', icon: Users },
    enrollment_change_yoy: { label: 'Change on last year', icon: TrendingUp },
    enrollment_vs_plan: { label: 'Gap to plan', icon: TrendingUp },
    student_teacher_ratio: { label: 'Students per teacher', icon: Users },
  }
  const captionFor = (t) => {
    const dt = trueMinus(formatMetricDeltaOf(t))
    if (t.key === 'enrollment_headcount') return planN != null ? `Plan ${fmtCount(planN)}` : dt ? `${dt} on last year` : 'Latest count'
    if (t.key === 'enrollment_change_yoy') return headDelta != null ? `${signedN(headDelta)} students` : 'Against last year'
    if (t.key === 'enrollment_vs_plan')
      return planGap == null
        ? 'Against the plan'
        : planGap < 0
          ? `${fmtCount(Math.abs(planGap))} short of ${fmtCount(planN)}`
          : planGap > 0
            ? `${fmtCount(planGap)} over ${fmtCount(planN)}`
            : `Right on ${fmtCount(planN)}`
    return dt ? `${dt} on last year` : 'This year'
  }
  const bandKpis = tiles.map((t) => ({
    key: t.key,
    icon: PLAIN[t.key]?.icon ?? TrendingUp,
    label: PLAIN[t.key]?.label ?? t.boardLabel ?? t.label,
    // PRE-FORMATTED by the canonical formatter, so a card here and the same
    // metric on the scorecard print the same figure (with a true minus sign).
    value: trueMinus(formatMetric(t)),
    caption: captionFor(t),
    verdict: toVerdict(t.status),
  }))
  const fy = periodLabel || period?.label ? fyLabel(periodLabel || period?.label) : null
  const planTone = vsTile ? toVerdict(vsTile.status) : null
  // Built the way the Overview's band builds it — the headcount, then the gap
  // to the plan in students. Tied to the YEAR, never "the latest count": the
  // ReconciliationStrip below may say a newer reading counts a different
  // number, and this sentence must not claim to be the newest.
  const bandVerdict = tiles.length ? (
    <>
      {head ? (
        <>
          <VerdictEm>{formatMetric(head)} students</VerdictEm>
          {fy ? ` in ${fy}` : reconciliation?.diverged ? ' on the promoted count' : ''}.{' '}
        </>
      ) : null}
      {planGap != null ? (
        planGap < 0 ? (
          <>
            That is <VerdictEm tone={planTone ?? undefined}>{fmtCount(Math.abs(planGap))} short</VerdictEm> of the plan
            of {fmtCount(planN)}.
          </>
        ) : planGap > 0 ? (
          <>
            That is <VerdictEm tone={planTone ?? undefined}>{fmtCount(planGap)} over</VerdictEm> the plan of{' '}
            {fmtCount(planN)}.
          </>
        ) : (
          <>Right on the plan of {fmtCount(planN)}.</>
        )
      ) : null}
    </>
  ) : (
    'No year holds an enrollment headcount yet. Add one and these figures fill in.'
  )
  const strip = VIEW_STRIP[view] ?? VIEW_STRIP.trend

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
    <div className="au-scope mx-auto max-w-page px-4 py-6 pb-28 sm:px-10 sm:py-8 lg:pb-10">
      {/* ── THE BAND: the registry vitals as glass cards, and ONLY the ones the
          server sent. A figure the server could not compute is absent, never a
          card of em-dashes. ── */}
      <AuroraHero
        moduleKey="enrollment"
        school={schoolName}
        eyebrow={bandEyebrow}
        title="Enrollment"
        verdict={bandVerdict}
        actions={
          <>
            <AddDataCta />
            <RecordsCta module="enrollment" />
            <AuroraButton to={pathname} icon={<TrendingUp size={18} aria-hidden="true" />}>
              Overview
            </AuroraButton>
          </>
        }
        kpis={bandKpis}
      />

      {/* HONESTY SURFACE 1 — PINNED, not filed under a view. It exists because
          the band's figures (promoted headcount) and the GRADE CHARTS (current
          reading) can quote two different observations; a reader who opened
          Grades directly would otherwise compare two different days with
          nothing saying so. It renders only when the two have diverged. */}
      <ReconciliationStrip
        reconciliation={reconciliation}
        periodLabel={period?.label}
        onResync={onGoToAddData}
        reduce={reduce}
      />

      {/* ── THE FOUR DOORS ── */}
      <div className="mt-8">
        <EnrollmentAnalyticsTabs view={view} onView={setView} />
      </div>

      <AuroraSection
        first
        icon={strip.icon}
        title={strip.title}
        subtitle={strip.subtitle}
        count={yearSpan ?? null}
      >
      <EnrollmentAnalyticsPanel view={view}>
      {/* ── TREND — the whole school, over time, and what the gap costs ── */}
      {view === 'trend' ? (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* E1.
            ── PROSE → PROGRESSIVE DISCLOSURE (this card and every chart card
            below): the full WhatThisMeasures paragraph moves VERBATIM into the
            card's ⓘ popover — every honesty sentence survives, none is read as a
            wall — and the body leads with ONE short caption plus the scope stamp
            and any reference-line key, which are data and stay in view. */}
        <ChartCard
          id="enr-trend"
          sub="Over time"
          title="Headcount over time"
          asOf={asOfChip}
          className="enr-chartcard lg:col-span-2"
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
            {live ? 'One reading per day from your register.' : 'Each filed reading, on the day it describes.'}
          </ChartCaption>
          <EnrollmentHeadcountTrend points={trend?.points ?? []} planTotal={trend?.planTotal ?? null} reduce={reduce} />
        </ChartCard>

      </div>
      ) : null}

      {/* ── GRADES — where the miss actually is, chart then figure ── */}
      {view === 'grades' ? (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* E4 — the marquee. */}
        <ChartCard
          id="enr-vs-plan"
          sub="Against plan"
          title="Which grades carry the miss"
          asOf={asOfChip}
          className="enr-chartcard lg:col-span-2"
          info={
            <WhatThisMeasures
              scope={sourceScope}
              reduce={reduce}
              note="Colour sits on the GAP, not on the column: a grade under plan is not a red grade, it is a grade with a red gap."
            >
              Two marks per grade, and they are deliberately different kinds of mark. The{' '}
              <strong className="font-semibold text-navy">solid column is the actual</strong> — children somebody counted{' '}
              {live ? 'on your register' : 'in the reading you filed'}. The{' '}
              <strong className="font-semibold text-navy">dashed outline is the plan</strong> — a figure typed into a
              budget that nobody ever counted. The whole-school number tells you that you missed; this tells you where.
            </WhatThisMeasures>
          }
        >
          <ChartCaption>Solid = counted · dashed = the plan.</ChartCaption>
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
          sub="Grade by year"
          title="Every grade, every year"
          asOf={asOfChip}
          className="enr-chartcard lg:col-span-2"
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
          <ChartCaption>One cell = one grade in one school year.</ChartCaption>
          <EnrollmentGradeHeatmap gradeByYear={gradeByYear} minCell={minCell} reduce={reduce} />
        </ChartCard>

        {/* The charts' twin: every figure, printed. It belongs with the two
            charts it prints — the table IS "every grade, in figures", and a
            reader who distrusts a bar wants the number in the same view, not
            four screens away on a tab about something else. */}
        <div className="enr-chartcard lg:col-span-2">
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
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* E3 — the star. */}
        <ChartCard
          id="enr-cohorts"
          sub="Following a class"
          title="Cohort size progression"
          asOf={asOfChip}
          className="enr-chartcard lg:col-span-2"
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
          <ChartCaption>One class per panel — its size, not retention.</ChartCaption>
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
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* E5 */}
        <ChartCard
          id="enr-demographics"
          className="enr-chartcard"
          sub="Who is here"
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
          <ChartCaption>Counts first — every figure is in the key.</ChartCaption>
          <EnrollmentDemographicsCard demographics={demographics} />
        </ChartCard>

        {/* E7 */}
        <ChartCard
          id="enr-support"
          className="enr-chartcard"
          sub="Support needs"
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
          <ChartCaption>Support flags on your register — under {minCell} stays hidden.</ChartCaption>
          <EnrollmentSupportNeedsCard mix={mix} />
        </ChartCard>

        {/* MOVED HERE FROM THE OVERVIEW. A different question from the charts
            above — "who is on my register", filterable — rather than "how is
            enrollment doing". Its own headcount trend is dropped: E1 is that
            chart, and the same line twice on one page is noise. It lands on THIS
            view because it asks E5's and E7's question with the filters live. */}
        {rosterMode ? (
          <div className="lg:col-span-2" aria-label="Explore the records">
            <AuroraSection
              compact
              icon={BarChart3}
              title="Explore the records"
              subtitle="Filter the list and watch every mix respond"
            >
              <RosterAnalyticsSection schoolId={schoolId} />
            </AuroraSection>
          </div>
        ) : null}
      </div>
      ) : null}
      </EnrollmentAnalyticsPanel>
      </AuroraSection>

      {/* Q6 — forwarded verbatim from the briefing, never recomputed: the
          whole-school consequence in dollars, under the trend it follows. */}
      {view === 'trend' ? <ImpactStrip items={impactItems} /> : null}

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
