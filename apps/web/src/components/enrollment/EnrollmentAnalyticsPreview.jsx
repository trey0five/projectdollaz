// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentAnalyticsPreview — the Overview's LIVE door into Analytics.
//
// The Overview's only route to the analytics used to be one thin text bar
// ("Trends, grade mix and cohorts → Analytics"), which read as a footnote and
// hid a whole dashboard behind eleven grey words. This strip replaces it with
// three LIVE Stats — a real headcount sparkline, the vs-plan headline, a cohort
// pulse — each one a link that deep-links straight to its view
// (`?tab=analytics&view=…`, the URL model EnrollmentAnalyticsTabs owns). The
// Stat teaches what the tab holds by SHOWING a bite of it.
//
// PREMIUM UI P4: a `Section` ("Analytics") holding a `StatStrip` of three
// linking `Stat`s on the ground — vertical rules, no tiles, no shadows.
//
// ── SERVER COMPUTES, THIS FILE PAINTS ───────────────────────────────────────
// Everything drawn here is read from the SAME `GET …/enrollment/analytics`
// payload the Analytics tab renders, via the same hook — so a Stat and the
// chart it links to cannot tell different stories. No count, share, gap or
// direction is derived in this file: the sparkline plots the server's dated
// totals, the vs-plan line prints the server's own totals row, and the cohort
// pills TALLY the server's per-cohort `direction` verdicts (counting list items
// for display, never re-deciding a direction from a sign — the moveFloor rule
// lives server-side and must stay there).
//
// ── HONESTY UNDER FAILURE ───────────────────────────────────────────────────
// While loading: a skeleton strip. If the read fails, is unlicensed, or returns
// nothing drawable: the strip degrades to the SAME compact text pointer it
// replaced — the door to Analytics never disappears, it just loses its preview.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3 } from 'lucide-react'
import Sparkline from '../analytics/charts/Sparkline.jsx'
import { useEnrollmentAnalytics } from '../../hooks/useEnrollmentAnalytics.js'
import { Section, StatStrip, Stat, Pill } from '../ui/surface/index.js'
import { ENROLL_HUE, fmtCount, schoolYearLabel, signedCount, signedShare } from './enrollmentAnalyticsKit.jsx'

/** The plain door, kept as the degraded state — never a dead end. */
function PointerFallback() {
  return (
    <Link to="/enrollment?tab=analytics" className="sec-more">
      <BarChart3 size={14} aria-hidden="true" />
      Trends, grade mix and cohorts <span className="font-semibold text-ink">→ Analytics</span>
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  )
}

/** The little grew/shrank/steady tally pills — server verdicts, counted only. */
function PulsePill({ tone, n, word }) {
  if (!n) return null
  return (
    <Pill variant="status" tone={tone}>
      {n} {word}
    </Pill>
  )
}

export default function EnrollmentAnalyticsPreview({ schoolId, periodId }) {
  const { data, loading, error, notLicensed, notEntitled } = useEnrollmentAnalytics(schoolId, periodId)

  if (loading && !data) {
    return (
      <Section label="Analytics">
        <div className="h-24 animate-pulse rounded-lg bg-ink/[.04]" aria-hidden="true" />
      </Section>
    )
  }
  if (error || notLicensed || notEntitled || !data) return <PointerFallback />

  const { trend, vsPlan, gradeByYear, cohortSize } = data
  const points = trend?.points ?? []
  const totals = vsPlan?.totals ?? null
  const cohorts = cohortSize?.cohorts ?? []
  // Tallies of the server's own direction verdicts — display counting only.
  const dirCount = (d) => cohorts.filter((c) => c.direction === d).length
  const latest = points.length ? points[points.length - 1] : null

  // Nothing drawable at all (brand-new school): the plain pointer says it best.
  if (!latest && !totals && !gradeByYear?.grades?.length && cohorts.length === 0) return <PointerFallback />

  const yearsOnFile = gradeByYear?.years?.length ?? 0
  const gapTone = totals ? (totals.gap === 0 ? 'neutral' : totals.gap < 0 ? 'risk' : 'good') : null

  return (
    <Section
      label="Analytics"
      aside={
        <Link to="/enrollment?tab=analytics" className="sec-more !mt-0">
          Open analytics <ArrowRight size={13} aria-hidden="true" />
        </Link>
      }
      aria-label="Enrollment analytics preview"
    >
      <StatStrip cols={3} className="stats-wrap !grid-cols-1 sm:!grid-cols-3">
        {/* ── 1 · The headcount sparkline → Trend ── */}
        <Stat
          to="/enrollment?tab=analytics&view=trend"
          aria-label="Open the headcount trend in Analytics"
          label="Headcount · how it moved"
          value={latest ? latest.total : '—'}
          note={
            latest
              ? trend?.planTotal != null
                ? `students · plan ${fmtCount(trend.planTotal)}`
                : 'students'
              : 'No enrollment reading filed yet.'
          }
        >
          {latest && points.length >= 2 ? (
            <div className="mt-2 h-8">
              <Sparkline vals={points.map((p) => p.total)} color={ENROLL_HUE} h={32} fill stretch />
            </div>
          ) : latest ? (
            <p className="mt-2 text-[12px] italic leading-snug text-ink2">the line starts with your next reading</p>
          ) : null}
        </Stat>

        {/* ── 2 · The vs-plan headline → Grades ── */}
        <Stat
          to="/enrollment?tab=analytics&view=grades"
          aria-label="Open the grade breakdown in Analytics"
          label="Grades · where the miss is"
          value={totals ? totals.actual : yearsOnFile ? gradeByYear.grades.length : '—'}
          status={totals ? gapTone : null}
          delta={
            totals
              ? {
                  text: `${signedCount(totals.gap)}${totals.gapPct != null ? ` ${signedShare(totals.gapPct)}` : ''} vs plan`,
                  tone: gapTone,
                }
              : null
          }
          note={
            totals
              ? null
              : yearsOnFile
                ? `grades across ${yearsOnFile} school ${yearsOnFile === 1 ? 'year' : 'years'}${
                    yearsOnFile > 1
                      ? ` (${schoolYearLabel(gradeByYear.years[0])} → ${schoolYearLabel(gradeByYear.years[yearsOnFile - 1])})`
                      : ''
                  } — no plan set yet.`
                : 'No grade-level reading on file yet.'
          }
        >
          {totals ? <p className="mt-1 text-small text-ink2">of {fmtCount(totals.plan)} planned — by grade inside</p> : null}
          {/* DIVERGENCE, said out loud (mirrors EnrollmentVsPlanChart's note,
              in its smallest honest form): when the server says this vs-plan
              total and the promoted headline headcount are two different
              observations, this Stat and the vitals print two different
              percentages side by side — never average them, name it. */}
          {totals && totals.agreesWithTile === false ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] leading-snug text-ink2">
              <span className="mark tone-watch" aria-hidden="true" />
              differs from the headline figure — see Analytics
            </p>
          ) : null}
        </Stat>

        {/* ── 3 · The cohort pulse → Cohorts ── */}
        <Stat
          to="/enrollment?tab=analytics&view=cohorts"
          aria-label="Open the cohort progression in Analytics"
          label="Cohorts · following a class"
          value={cohorts.length ? cohorts.length : '—'}
          note={
            cohorts.length
              ? `${cohorts.length === 1 ? 'class' : 'classes'} followed up the grades`
              : 'Unlocks with a second school year of grade-level readings.'
          }
        >
          {cohorts.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <PulsePill tone="good" n={dirCount('grew')} word="grew" />
              <PulsePill tone="risk" n={dirCount('shrank')} word="shrank" />
              <PulsePill tone="neutral" n={dirCount('held')} word="steady" />
            </div>
          ) : null}
        </Stat>
      </StatStrip>
    </Section>
  )
}
