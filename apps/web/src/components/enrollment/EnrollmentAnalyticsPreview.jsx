// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentAnalyticsPreview — the Overview's LIVE door into Analytics.
//
// The Overview's only route to the analytics used to be one thin text bar
// ("Trends, grade mix and cohorts → Analytics"), which read as a footnote and
// hid a whole dashboard behind eleven grey words. This strip replaces it with
// three small LIVE tiles — a real headcount sparkline, the vs-plan headline, a
// cohort pulse — each one a clickable card that deep-links straight to its view
// (`?tab=analytics&view=…`, the URL model EnrollmentAnalyticsTabs owns). The
// tile teaches what the tab holds by SHOWING a bite of it.
//
// ── SERVER COMPUTES, THIS FILE PAINTS ───────────────────────────────────────
// Everything drawn here is read from the SAME `GET …/enrollment/analytics`
// payload the Analytics tab renders, via the same hook — so a tile and the
// chart it links to cannot tell different stories. No count, share, gap or
// direction is derived in this file: the sparkline plots the server's dated
// totals, the vs-plan line prints the server's own totals row, and the cohort
// chips TALLY the server's per-cohort `direction` verdicts (counting list items
// for display, never re-deciding a direction from a sign — the moveFloor rule
// lives server-side and must stay there).
//
// ── HONESTY UNDER FAILURE ───────────────────────────────────────────────────
// While loading: skeleton tiles. If the read fails, is unlicensed, or returns
// nothing drawable: the strip degrades to the SAME compact text pointer it
// replaced — the door to Analytics never disappears, it just loses its preview.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BarChart3, TrendingDown, TrendingUp, Users2 } from 'lucide-react'
import Sparkline from '../analytics/charts/Sparkline.jsx'
import { useEnrollmentAnalytics } from '../../hooks/useEnrollmentAnalytics.js'
import {
  EASE,
  ENROLL_HUE,
  PLAN_INK,
  fmtCount,
  schoolYearLabel,
  signedCount,
  signedShare,
} from './enrollmentAnalyticsKit.jsx'

/** The plain door, kept as the degraded state — never a dead end. */
function PointerFallback() {
  return (
    <Link
      to="/enrollment?tab=analytics"
      className="group flex items-center gap-2.5 self-start rounded-xl border border-rule/60 bg-white px-4 py-2.5 text-[13.5px] text-muted transition-all hover:border-sky-400/60 hover:text-navy"
    >
      <BarChart3 size={16} className="text-sky-600" />
      <span>
        Trends, grade mix and cohorts <span className="font-semibold text-navy">→ Analytics</span>
      </span>
      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/**
 * One preview tile — a real Link (middle-clickable, focusable, honest cursor),
 * wearing the module hue. `caption` reuses the analytics tab's own sublabel
 * vocabulary (HOW IT MOVED …) so the tile and the door it opens share a name.
 */
function PreviewTile({ to, label, caption, ariaLabel, index, reduce, children }) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : index * 0.07 }}
      className="min-w-0"
    >
      <Link
        to={to}
        aria-label={ariaLabel}
        className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-rule/60 bg-white px-4 py-3.5 outline-none transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-sky-500/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        style={{ boxShadow: '0 10px 30px -24px rgba(16,28,61,0.35)' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, ${ENROLL_HUE}, transparent 70%)` }}
        />
        <span className="mb-2 flex items-baseline justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-navy">{label}</span>
            <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted/80">
              {caption}
            </span>
          </span>
          <ArrowRight
            size={14}
            className="shrink-0 text-sky-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
        <span className="min-w-0 flex-1">{children}</span>
      </Link>
    </motion.div>
  )
}

/** The little grew/shrank/steady tally chips — server verdicts, counted only. */
function PulseChip({ tone, icon: Icon, n, word }) {
  if (!n) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${tone}`}>
      {Icon ? <Icon size={11} strokeWidth={2.6} /> : null}
      {n} {word}
    </span>
  )
}

export default function EnrollmentAnalyticsPreview({ schoolId, periodId }) {
  const reduce = useReducedMotion()
  const { data, loading, error, notLicensed, notEntitled } = useEnrollmentAnalytics(schoolId, periodId)

  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-rule/40 bg-white/60" />
        ))}
      </div>
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

  return (
    <section aria-label="Enrollment analytics preview" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-serif text-[15px] font-semibold text-navy">
          <BarChart3 size={15} style={{ color: ENROLL_HUE }} /> Analytics
          <span className="text-[12px] font-normal text-muted">— live from the same figures the tab draws</span>
        </h3>
        <Link
          to="/enrollment?tab=analytics"
          className="group inline-flex items-center gap-1 text-[12px] font-semibold text-sky-700 hover:underline"
        >
          Open analytics <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* ── 1 · The headcount sparkline → Trend ── */}
        <PreviewTile
          to="/enrollment?tab=analytics&view=trend"
          label="Headcount"
          caption="how it moved"
          ariaLabel="Open the headcount trend in Analytics"
          index={0}
          reduce={reduce}
        >
          {latest ? (
            <span className="flex items-end justify-between gap-3">
              <span className="shrink-0">
                <span className="block font-serif text-[24px] font-bold leading-none tabular-nums text-navy">
                  {fmtCount(latest.total)}
                </span>
                <span className="mt-1 block text-[10.5px] text-muted">
                  students
                  {trend?.planTotal != null ? (
                    <>
                      {' '}
                      · <span className="font-bold tabular-nums" style={{ color: PLAN_INK }}>
                        plan {fmtCount(trend.planTotal)}
                      </span>
                    </>
                  ) : null}
                </span>
              </span>
              {points.length >= 2 ? (
                <span className="min-w-0 flex-1">
                  <Sparkline vals={points.map((p) => p.total)} color={ENROLL_HUE} h={34} fill stretch />
                </span>
              ) : (
                <span className="pb-0.5 text-[10.5px] italic leading-snug text-muted">
                  the line starts with your next reading
                </span>
              )}
            </span>
          ) : (
            <span className="text-[12px] italic leading-snug text-muted">No enrollment reading filed yet.</span>
          )}
        </PreviewTile>

        {/* ── 2 · The vs-plan headline → Grades ── */}
        <PreviewTile
          to="/enrollment?tab=analytics&view=grades"
          label="Grades"
          caption="where the miss is"
          ariaLabel="Open the grade breakdown in Analytics"
          index={1}
          reduce={reduce}
        >
          {totals ? (
            <span className="flex flex-col gap-1">
              <span className="flex items-baseline gap-1.5">
                <span className="font-serif text-[24px] font-bold leading-none tabular-nums text-navy">
                  {fmtCount(totals.actual)}
                </span>
                <span className="text-[12px] tabular-nums text-muted">/ {fmtCount(totals.plan)} planned</span>
              </span>
              <span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                    totals.gap === 0
                      ? 'bg-slate-100 text-slate-500'
                      : totals.gap < 0
                        ? 'bg-red-500/10 text-red-600'
                        : 'bg-emerald-500/10 text-emerald-700'
                  }`}
                >
                  {signedCount(totals.gap)}
                  {totals.gapPct != null ? (
                    <span className="font-semibold opacity-70">{signedShare(totals.gapPct)}</span>
                  ) : null}
                </span>
                <span className="ml-1.5 text-[10.5px] text-muted">vs plan — by grade inside</span>
              </span>
            </span>
          ) : yearsOnFile ? (
            <span className="text-[12px] leading-snug text-muted">
              <span className="font-serif text-[24px] font-bold leading-none tabular-nums text-navy">
                {gradeByYear.grades.length}
              </span>{' '}
              grades across {yearsOnFile} school {yearsOnFile === 1 ? 'year' : 'years'}
              {yearsOnFile > 1
                ? ` (${schoolYearLabel(gradeByYear.years[0])} → ${schoolYearLabel(gradeByYear.years[yearsOnFile - 1])})`
                : ''}{' '}
              — no plan set yet.
            </span>
          ) : (
            <span className="text-[12px] italic leading-snug text-muted">No grade-level reading on file yet.</span>
          )}
        </PreviewTile>

        {/* ── 3 · The cohort pulse → Cohorts ── */}
        <PreviewTile
          to="/enrollment?tab=analytics&view=cohorts"
          label="Cohorts"
          caption="following a class"
          ariaLabel="Open the cohort progression in Analytics"
          index={2}
          reduce={reduce}
        >
          {cohorts.length ? (
            <span className="flex flex-col gap-1.5">
              <span className="flex items-baseline gap-1.5">
                <span className="font-serif text-[24px] font-bold leading-none tabular-nums text-navy">
                  {cohorts.length}
                </span>
                <span className="text-[12px] text-muted">
                  {cohorts.length === 1 ? 'class' : 'classes'} followed up the grades
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <PulseChip
                  tone="bg-emerald-500/12 text-emerald-700 ring-emerald-500/30"
                  icon={TrendingUp}
                  n={dirCount('grew')}
                  word="grew"
                />
                <PulseChip
                  tone="bg-rose-500/12 text-rose-700 ring-rose-500/30"
                  icon={TrendingDown}
                  n={dirCount('shrank')}
                  word="shrank"
                />
                <PulseChip tone="bg-navy/[0.06] text-navy/60 ring-navy/15" n={dirCount('held')} word="steady" />
              </span>
            </span>
          ) : (
            <span className="flex items-start gap-2 text-[12px] leading-snug text-muted">
              <Users2 size={14} className="mt-0.5 shrink-0 text-sky-600" />
              <span>Unlocks with a second school year of grade-level readings.</span>
            </span>
          )}
        </PreviewTile>
      </div>
    </section>
  )
}
