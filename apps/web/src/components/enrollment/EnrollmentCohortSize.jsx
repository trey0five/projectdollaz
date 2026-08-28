// ─────────────────────────────────────────────────────────────────────────────
// E3 — COHORT SIZE PROGRESSION, as small multiples.
//
// THE SHARED SCALE IS COMPUTED HERE, ONCE, OVER EVERY COHORT — and handed down.
// This is the whole reason the small-multiple format works: panels each fitted
// to their own range look identical while describing a class of 118 and a class
// of 24. `EnrollmentCohortPanel` therefore contains no scale-fitting code at
// all, and the enlarged overlay is handed this same domain rather than its own.
//
// THE FLOOR IS ZERO. Every other rule on this page bends before that one does:
// these are headcounts, they have a real zero, and an axis that starts at 90
// would turn a four-student move into a cliff face.
//
// The scale is computed over ALL cohorts including any the reader has narrowed
// away, so changing what is on screen can never silently rescale the axis
// underneath them.
//
// ── THE LADDER LENGTH ───────────────────────────────────────────────────────
// Panels of DIFFERENT lengths are not comparable. A class caught two rungs into
// its time here has half the room to move of one followed for five, so a grid
// that mixed them read the short panels as the steady ones — a finding that was
// an artefact of the window rather than anything about the school. The reader
// now picks ONE length and every panel has it, exactly as on the academics
// cohort view, which is where this control's vocabulary and its Segmented come
// from. The panel SET is the server's answer at that length; nothing here
// filters, slices or re-lengths a cohort.
//
// NAMING: "cohort size progression". Never "retention" — see the panel's header
// for why, and the explainer below for what the reader is told.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Users2 } from 'lucide-react'
// The SAME control the academics cohort view uses, imported rather than cloned:
// its disabled-option affordance (a title on a wrapper, because a disabled
// button never fires hover) and its selected-pill contrast were solved once,
// and a second copy is a second place for them to regress.
import { Segmented } from '../academics/AssessmentFilters.jsx'
import EnrollmentCohortPanel, { pointsOf } from './EnrollmentCohortPanel.jsx'
import { COHORT_WINDOWS } from './EnrollmentAnalyticsTabs.jsx'
import { fmtCount, zeroBasedDomain } from './enrollmentAnalyticsKit.jsx'

/**
 * The honest strip for the state this card is in most often.
 *
 * A school needs TWO school years of grade-level readings before a class can be
 * followed up a rung, and most schools arrive here with one. That makes this the
 * most common thing the card renders, so it gets designed rather than dashed off
 * — it says what is missing, why, and exactly what will make it appear.
 */
function CohortsNotYet({ note }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-navy/[0.025] px-6 py-9 text-center ring-1 ring-navy/[0.06]">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/10 text-sky-600">
        <Users2 size={20} />
      </span>
      <p className="max-w-lg text-[13.5px] font-semibold leading-snug text-navy">
        Following a class up the grades needs two school years of readings.
      </p>
      <p className="max-w-lg text-[12.5px] leading-relaxed text-muted">
        {note ??
          'Only one school year of grade-level data is on file, so there is no rung-to-rung walk to draw yet. It unlocks with next year’s reading — nothing else to set up.'}
      </p>
    </div>
  )
}

/**
 * The length control, in YEARS — the academics wording, deliberately.
 *
 * Every option the server named in `availableWindows` is live; the others are
 * shown DISABLED with the reason rather than hidden, because a reader who knows
 * the academics page offers five years needs to be told why this one does not,
 * and a control that silently loses options reads as a bug.
 */
function CohortLengthControl({ cohortSize, value, onWindow, loading }) {
  const available = cohortSize?.availableWindows ?? []
  const span = cohortSize?.gradeSpan
  if (available.length < 2) return null

  const why = (w) => {
    if (span?.gradeDepth != null && span.gradeDepth < w) {
      return `Only ${span.gradeDepth} consecutive grades are on file at this school${
        span.low && span.high ? ` (${span.low}–${span.high})` : ''
      }`
    }
    return `Only ${span?.yearDepth ?? 0} school years of readings are on file, so a ${w}-year walk cannot be evidenced`
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted/80">Cohort length</span>
      <Segmented
        // UNIQUE. `layoutId` is global to the page and the academics bar uses
        // 'cohort-window'; two thumbs sharing an id fly between components.
        uid="enr-cohort-window"
        ariaLabel="Cohort length"
        value={value}
        options={COHORT_WINDOWS.map((w) => ({
          value: w,
          label: `${w} years`,
          disabled: !available.includes(w),
          title: available.includes(w) ? undefined : why(w),
        }))}
        onChange={(w) => onWindow?.(Number(w))}
      />
      {loading ? (
        <span className="text-[11.5px] text-muted" role="status">
          Redrawing…
        </span>
      ) : null}
    </div>
  )
}

export default function EnrollmentCohortSize({
  cohortSize,
  moveFloor = 3,
  minCell = 5,
  note = null,
  reduce = false,
  selectedWindow = null,
  onWindow = null,
  loading = false,
}) {
  const cohorts = useMemo(() => cohortSize?.cohorts ?? [], [cohortSize])

  // ── THE SHARED DOMAIN. Computed once, over every visible rung on the page. ──
  const { scale, ticks } = useMemo(() => {
    const values = []
    for (const c of cohorts) {
      for (const p of pointsOf(c)) if (p.value !== null) values.push(p.value)
    }
    // `maxCount` is the server's own shared-scale hint; taking the max of both
    // means a payload that ever grows a rung the panels do not draw still cannot
    // push a point above the axis.
    const top = Math.max(cohortSize?.maxCount ?? 0, ...(values.length ? values : [0]), 1)
    // Zero-based AND guaranteed to contain the largest rung — see zeroBasedDomain.
    const { lo, hi, ticks: t } = zeroBasedDomain(top)
    return { scale: { lo, hi }, ticks: t }
  }, [cohorts, cohortSize?.maxCount])

  // No cohort structure AT ALL (one year on file) — there is no length to pick
  // either, so the control is not drawn over an empty state it cannot fix.
  if (!cohortSize) return <CohortsNotYet note={note} />

  // The server used this. The pill follows the reader's own pick only when the
  // server would accept it, so a link carrying an impossible length shows what
  // was actually drawn rather than highlighting nothing.
  const used = cohortSize.window
  const pill = selectedWindow && (cohortSize.availableWindows ?? []).includes(selectedWindow) ? selectedWindow : used
  const narrowed = cohortSize.requestedWindow > used

  const control = (
    <CohortLengthControl cohortSize={cohortSize} value={pill} onWindow={onWindow} loading={loading} />
  )

  if (cohorts.length === 0) {
    return (
      <div>
        {control}
        {/* The length that emptied the grid is still on screen with every other
            length beside it — the reader can undo their own choice. */}
        <CohortsNotYet note={cohortSize.reason ?? note} />
      </div>
    )
  }

  return (
    <div>
      {control}

      {/* THE ONE PLACE THE SCALE IS STATED. The panels repeat the gridlines at
          these same values and carry no numbers of their own, so there is
          exactly one axis statement for the whole grid. */}
      <p className="mb-3 text-[11.5px] leading-snug text-muted">
        {/* The length is quoted from the SERVER's echo, so it is stated only
            when the server stated it — never a number this file assumed. */}
        {typeof used === 'number' ? (
          <>
            Every panel follows <span className="font-semibold text-navy">{used} years</span> of one class and shares
            one axis —{' '}
          </>
        ) : (
          <>Every panel shares one axis — </>
        )}
        <span className="font-semibold tabular-nums text-navy">
          0 to {fmtCount(scale.hi)} students
        </span>
        , gridlines at{' '}
        <span className="font-mono font-semibold tabular-nums text-navy/70">{ticks.join(' · ')}</span>. A line sitting
        lower is a genuinely smaller class, not a panel zoomed differently.
      </p>

      {/* ONLY WHEN THE SERVER REALLY NARROWED IT. A reader who deliberately
          picked two years is not told their choice was a compromise. */}
      {narrowed ? (
        <p className="mb-3 text-[11.5px] leading-snug text-amber-700">
          Narrowed to {used} years — that is all the history on file
          {cohortSize.gradeSpan?.low && cohortSize.gradeSpan?.high
            ? ` for grades ${cohortSize.gradeSpan.low}–${cohortSize.gradeSpan.high}`
            : ''}
          .
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cohorts.map((c, i) => (
          <EnrollmentCohortPanel
            key={c.id}
            cohort={c}
            // NOT RE-FITTED DOWNSTREAM. The panel takes these as read.
            scale={scale}
            ticks={ticks}
            moveFloor={moveFloor}
            minCell={minCell}
            index={i}
            reduce={reduce}
          />
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        A move of fewer than {moveFloor} students is reported as holding steady rather than as a direction — the chip
        reads the server&apos;s call, never the sign of the number. Click any panel to open it full size on this same
        axis.
        {cohortSize.truncated ? (
          <>
            {' '}
            Showing the {cohorts.length} classes closest to leaving, of {cohortSize.panelsAvailable} this span holds.
          </>
        ) : null}
      </p>
    </div>
  )
}
