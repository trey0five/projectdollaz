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
// AURORA (2026-10-15): a "Look deeper" section strip over colourful tiles —
// Headcount · Grades · Cohorts, each a live link with its figure, plus any
// `extra` tile the page passes (the diocesan import door).
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
import { BarChart3, GraduationCap, LineChart, Users } from 'lucide-react'
import { healthStatus, bandsFor } from '@finrep/analytics'
import Sparkline from '../analytics/charts/Sparkline.jsx'
import { useEnrollmentAnalytics } from '../../hooks/useEnrollmentAnalytics.js'
import {
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  VerdictPill,
} from '../ui/aurora/index.js'
import { ENROLL_HUE, fmtCount, schoolYearLabel, signedCount, signedShare } from './enrollmentAnalyticsKit.jsx'

/** The section frame every state shares. */
function LookDeeper({ children, ...rest }) {
  return (
    <AuroraSection icon={BarChart3} hue="var(--au-h2)" title="Look deeper" subtitle="Analytics for this school" {...rest}>
      {children}
    </AuroraSection>
  )
}

/** The plain door, kept as the degraded state — never a dead end. */
function PointerFallback({ extra = null }) {
  return (
    <LookDeeper>
      <AuroraTileGrid cols={extra ? 2 : 3}>
        <AuroraTile
          to="/enrollment?tab=analytics"
          icon={BarChart3}
          title="Analytics"
          desc="Trends, grade mix and cohorts"
        />
        {extra}
      </AuroraTileGrid>
    </LookDeeper>
  )
}

/** The little grew/shrank/steady tally pills — server verdicts, counted only. */
function PulsePill({ tone, n, word }) {
  if (!n) return null
  return <VerdictPill verdict={tone === 'neutral' ? null : tone} label={`${n} ${word}`} className="au-pill-sm" />
}

export default function EnrollmentAnalyticsPreview({ schoolId, periodId, extra = null }) {
  const { data, loading, error, notLicensed, notEntitled } = useEnrollmentAnalytics(schoolId, periodId)

  if (loading && !data) {
    return (
      <LookDeeper>
        <div className="h-40 animate-pulse rounded-2xl bg-ink/[.04]" aria-hidden="true" />
      </LookDeeper>
    )
  }
  if (error || notLicensed || notEntitled || !data) return <PointerFallback extra={extra} />

  const { trend, vsPlan, gradeByYear, cohortSize } = data
  const points = trend?.points ?? []
  const totals = vsPlan?.totals ?? null
  const cohorts = cohortSize?.cohorts ?? []
  // Tallies of the server's own direction verdicts — display counting only.
  const dirCount = (d) => cohorts.filter((c) => c.direction === d).length
  const latest = points.length ? points[points.length - 1] : null

  // Nothing drawable at all (brand-new school): the plain pointer says it best.
  if (!latest && !totals && !gradeByYear?.grades?.length && cohorts.length === 0) return <PointerFallback extra={extra} />

  const yearsOnFile = gradeByYear?.years?.length ?? 0
  // The gap's verdict from the CANONICAL enrollment_vs_plan bands — the same
  // healthStatus call the band's "Gap to plan" card (EnrollmentHero) and the
  // VsPlanKpi tile make, so one gap never wears two verdicts on one page
  // (verifier 2026-10-15: the band said "At risk" while this tile said a grey
  // "Behind plan" for the same −11 / −7.1%). No share → no pill, never a guess.
  const gapVerdict =
    totals && totals.gapPct != null && Number.isFinite(Number(totals.gapPct))
      ? healthStatus(Number(totals.gapPct), bandsFor('enrollment_vs_plan'), true)
      : null
  const gapTone = gapVerdict && gapVerdict !== 'neutral' ? gapVerdict : null

  return (
    <LookDeeper aria-label="Enrollment analytics preview">
      <AuroraTileGrid cols={extra ? 4 : 3}>
        {/* ── 1 · The headcount sparkline → Trend ── */}
        <AuroraTile
          to="/enrollment?tab=analytics&view=trend"
          ariaLabel="Open the headcount trend in Analytics"
          icon={LineChart}
          title="Headcount"
          figure={latest ? fmtCount(latest.total) : '—'}
          unit={latest ? (trend?.planTotal != null ? `of ${fmtCount(trend.planTotal)} planned` : 'students') : null}
          desc={latest ? 'How the count has moved.' : 'No enrollment reading filed yet.'}
        >
          {latest && points.length >= 2 ? (
            <div className="mt-1 h-8">
              <Sparkline vals={points.map((p) => p.total)} color={ENROLL_HUE} h={32} fill stretch />
            </div>
          ) : null}
        </AuroraTile>

        {/* ── 2 · The vs-plan headline → Grades ── */}
        <AuroraTile
          to="/enrollment?tab=analytics&view=grades"
          ariaLabel="Open the grade breakdown in Analytics"
          icon={GraduationCap}
          hue="var(--au-h2)"
          title="Grades"
          figure={totals ? signedCount(totals.gap) : yearsOnFile ? gradeByYear.grades.length : '—'}
          unit={totals ? (totals.gapPct != null ? signedShare(totals.gapPct) : null) : yearsOnFile ? 'grades' : null}
          desc={
            totals
              ? `Which grades the gap sits in (plan ${fmtCount(totals.plan)}).`
              : yearsOnFile
                ? `${yearsOnFile} school ${yearsOnFile === 1 ? 'year' : 'years'}${
                    yearsOnFile > 1
                      ? ` (${schoolYearLabel(gradeByYear.years[0])} → ${schoolYearLabel(gradeByYear.years[yearsOnFile - 1])})`
                      : ''
                  } — no plan set yet.`
                : 'No grade-level reading on file yet.'
          }
          // The band's own Good / Watch / At risk word for this gap.
          verdict={gapTone}
        >
          {/* DIVERGENCE, said out loud (mirrors EnrollmentVsPlanChart's note,
              in its smallest honest form): when the server says this vs-plan
              total and the promoted headline headcount are two different
              observations, this tile and the band print two different
              percentages — never average them, name it. */}
          {totals && totals.agreesWithTile === false ? (
            <p className="enr-diverge">differs from the headline figure — see Analytics</p>
          ) : null}
        </AuroraTile>

        {/* ── 3 · The cohort pulse → Cohorts ── */}
        <AuroraTile
          to="/enrollment?tab=analytics&view=cohorts"
          ariaLabel="Open the cohort progression in Analytics"
          icon={Users}
          hue="var(--au-h3)"
          title="Cohorts"
          figure={cohorts.length ? cohorts.length : '—'}
          unit={cohorts.length ? (cohorts.length === 1 ? 'class' : 'classes') : null}
          desc={cohorts.length ? 'Each class followed up the grades.' : 'Unlocks with a second year of grade counts.'}
          foot={
            cohorts.length ? (
              <span className="flex flex-wrap gap-1.5">
                <PulsePill tone="good" n={dirCount('grew')} word="grew" />
                <PulsePill tone="risk" n={dirCount('shrank')} word="shrank" />
                <PulsePill tone="neutral" n={dirCount('held')} word="steady" />
              </span>
            ) : null
          }
        />

        {extra}
      </AuroraTileGrid>
    </LookDeeper>
  )
}
