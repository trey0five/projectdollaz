// ─────────────────────────────────────────────────────────────────────────────
// AssessmentFilters — the scope bar.
//
// WHAT WAS WRONG, since the design is a direct answer to it.
//
// 1. FIVE CONTROLS, ALL SPELLED THE SAME. Test type, year, grade, cohort and
//    subject sat in one row as identical native selects, which said they were
//    five equal choices. They are not. Test type and year FRAME the data — they
//    decide which dataset you are looking at. Grade and subject NARROW it. A
//    cohort is a different question entirely. Rendering them alike hid all of
//    that and left the reader to work it out.
//
// 2. MOST OF THEM DID NOTHING ON MOST VIEWS. Tracing each view to the payload
//    it actually consumes: subject reaches only `movements` and `cohort`, so on
//    Standing, Classroom and Network the subject select changed the request and
//    nothing on screen. The cohort select is consumed by the Cohorts view
//    alone, so it was inert on four of five. A control that looks live and does
//    nothing is worse than no control — the reader concludes the DATA is wrong.
//    So the bar now shows only what bites on the view you are on.
//
// 3. NOTHING SAID WHAT YOU HAD NARROWED TO. Set grade 4 and math, scroll, and
//    every number was a subset with no reminder and no way back to the whole.
//    There is now a plain-language summary and a Clear that appears only when
//    there is something to clear.
//
// The frame is a segmented control rather than a dropdown wherever the options
// are few: every choice is visible, it is one click instead of two, and the
// thumb slides between them so the change reads as a change.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { subjectLabelOf } from '@finrep/analytics'

const HUE = '#0D9488'
const EASE = [0.2, 0.8, 0.2, 1]

// THE SELECTED PILL IS DARKER THAN THE BRAND TEAL, ON PURPOSE. White on
// teal-600 (#0D9488) is 3.7:1 and on teal-500 it is 2.5:1 — the selected
// option, the one thing on the bar that must be readable at a glance, was the
// only text on it below AA. teal-700 → teal-800 carries the same hue and puts
// the label at 5.5:1 at the light end of the gradient. The glow keeps it lit.
const THUMB = 'linear-gradient(135deg, #0F766E, #115E59)'

/**
 * Which controls BITE on which view. Derived by tracing each view's payload:
 *   standing  → subjects · heatmap · schools · insights
 *   classroom → distribution · subgroups · objectives
 *   time      → movements · trend
 *   cohorts   → the dedicated /assessments/cohorts payload
 *   network   → table · crossDomain
 * against the query each of those is computed from. Keep this in step with the
 * view blocks; a filter listed here that does not reach the data is exactly the
 * lie this component was built to remove.
 *
 * COHORTS, since it is the one that changed. The view now draws a grid of
 * multi-year cohorts from its own route, and three of the old five controls
 * mean something different there:
 *   · the single-cohort select is GONE. It picked one current grade out of a
 *     two-point payload; the view now enumerates every cohort the school's
 *     grades support, and picks between them in its own control bar.
 *   · GRADE is deliberately absent. A cohort SPANS grades — "grade 4" is a
 *     category error on a chart whose subject is a group of children crossing
 *     four of them.
 *   · SUBJECT is the series selector. Empty means the publisher's reported
 *     Total Battery rather than "all subjects", so the chip says so on this
 *     view and only on this view.
 */
export const FILTERS_FOR_VIEW = {
  standing: ['grade'],
  classroom: ['grade'],
  time: ['grade', 'subject'],
  cohorts: ['subject'],
  network: ['grade'],
}

const TEST_LABEL = {
  act: 'ACT',
  sat: 'SAT',
  preact: 'PreACT',
  psat_nmsqt: 'PSAT/NMSQT',
  psat_10: 'PSAT 10',
  psat_89: 'PSAT 8/9',
  terranova: 'TerraNova',
}
const testLabel = (t) => TEST_LABEL[t] ?? String(t ?? '').toUpperCase()

// ── Segmented control ────────────────────────────────────────────────────────

/**
 * All options visible, one click, and a thumb that slides between them.
 *
 * Exported because the cohort view needs the same control for its own window
 * picker. `uid` MUST be unique per instance: the thumb is a shared `layoutId`,
 * and two instances with the same uid fling one thumb between two bars.
 *
 * An option may be `disabled` — a school with three grades on file has no
 * four-grade cohort, and greying that option out with a reason says so, where
 * hiding it would leave the reader wondering where the choice went.
 *
 * ── WHY THE THUMB IS NOT `-z-10` ANY MORE ───────────────────────────────────
 * It was, and the selected option was consequently INVISIBLE: white text on
 * white. `z-index: -10` does not mean "behind my label", it means "behind
 * everything in the nearest ancestor STACKING CONTEXT" — and neither the
 * button nor the group is one (`position: relative` with `z-index: auto`
 * creates none). So the thumb sank past the group's own tinted track, past the
 * bar's `bg-white`, and painted against the first real stacking context up the
 * page. The label kept `color:#fff` and landed on the white card behind it, at
 * about 1.05:1. The selected option — the only one that has to be legible —
 * was the least legible thing in the control.
 *
 * The fix is the ordinary one: the thumb stays in flow at z-auto, and the
 * LABEL is lifted above it with `relative z-10`. A painted-on-top thumb needs
 * nothing from the ancestors, so no future wrapper can sink it again.
 */
export function Segmented({ options, value, onChange, ariaLabel, uid }) {
  const reduce = useReducedMotion()
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative inline-flex items-center gap-0.5 rounded-xl p-1"
      style={{ background: 'rgba(16,28,61,0.05)', boxShadow: 'inset 0 0 0 1px rgba(16,28,61,0.06)' }}
    >
      {options.map((o) => {
        const on = String(o.value) === String(value)
        const off = Boolean(o.disabled)
        return (
          // THE REASON HAS TO LIVE ON A WRAPPER. A `disabled` button swallows
          // every pointer event, so the browser never fires the hover that
          // would show its own `title` — the explanation for why the option is
          // greyed out was unreachable by exactly the reader who needed it.
          // `aria-disabled` keeps it announced-and-focusable, the span carries
          // the tooltip, and the click handler still refuses.
          <span key={o.value} title={off ? o.title : undefined} className="inline-flex">
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={off || undefined}
              title={off ? undefined : o.title}
              onClick={() => !off && onChange(o.value)}
              className={`relative rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                off && !on ? 'cursor-not-allowed' : ''
              }`}
              // NOT `opacity-40` for the disabled state. Fading the whole
              // button also faded the thumb, so a disabled-but-selected option
              // washed out to nothing; and an opacity is invisible to a
              // contrast check, which reads the colour and not the layer. A
              // lighter slate says "not available here" in the colour itself,
              // still above AA, and plainly distinct from the live options.
              style={{ color: on ? '#FFFFFF' : off ? '#94A3B8' : '#475569' }}
            >
              {on ? (
                <motion.span
                  aria-hidden="true"
                  layoutId={`${uid}-thumb`}
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: THUMB,
                    boxShadow: `0 6px 18px -8px ${HUE}`,
                  }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              {/* Above the thumb, which now paints on top of the button's own
                  inline content. Without this the label is under the pill. */}
              <span className="relative z-10">{o.label}</span>
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ── Dropdown chip ────────────────────────────────────────────────────────────

/**
 * Quiet when it is set to "all", lit when it is narrowing something — so a
 * glance at the bar tells you whether you are looking at everything or a slice.
 *
 * Exported for the same reason as Segmented: the cohort view's span picker is
 * this control, and a second dropdown built to look like it would drift.
 */
export function FilterChip({ label, value, options, onChange, allLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = value !== null && value !== undefined && value !== '' && value !== 'all'

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const current = options.find((o) => String(o.value) === String(value))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold transition-all"
        style={
          active
            ? { background: `${HUE}14`, color: '#0f766e', boxShadow: `inset 0 0 0 1px ${HUE}55` }
            : { background: '#fff', color: '#475569', boxShadow: 'inset 0 0 0 1px rgba(16,28,61,0.12)' }
        }
      >
        <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] opacity-60">{label}</span>
        {current?.label ?? allLabel}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 top-full z-30 mt-1.5 max-h-64 min-w-[168px] overflow-auto rounded-xl border border-navy/10 bg-white py-1 shadow-[0_24px_60px_-24px_rgba(16,28,61,0.5)]"
          >
            {options.map((o) => {
              const on = String(o.value) === String(value)
              return (
                <li key={String(o.value)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] text-navy transition-colors hover:bg-navy/[0.04]"
                    style={on ? { color: '#0f766e', fontWeight: 700 } : undefined}
                  >
                    {o.label}
                    {on ? <Check size={13} /> : null}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

// ── The bar ──────────────────────────────────────────────────────────────────

// `data` is gone from the signature: the only thing it fed was the retired
// single-cohort select, and a prop nothing reads is the next reader's dead end.
export default function AssessmentFilters({ ctx, view, onSelect, loading, anonymous, onAnonymous }) {
  const shown = FILTERS_FOR_VIEW[view] ?? []
  const grade = ctx?.grade ?? 'all'
  const subject = ctx?.subject ?? ''

  const years = ctx?.years ?? []
  const tests = ctx?.availableTestTypes ?? []
  const subjects = ctx?.subjects ?? []

  // On the cohort view an empty subject is not "all subjects" — it is the
  // publisher's own reported composite, which is a NAMED measure and not a
  // mean of the columns beside it. The chip says which one it is, in the NAME
  // that family uses: the server labels it, because an ACT school's composite
  // is not called what a TerraNova school's is.
  const totalIsDefault = view === 'cohorts'
  const totalLabel = (ctx?.availableSeries ?? []).find((s) => s.key === 'total')?.label ?? 'Composite'

  // Only count what is actually biting on this view — a subject left set from
  // another view is not narrowing anything here, and claiming it is would send
  // the reader hunting for an effect that is not there.
  const narrowed = [
    shown.includes('grade') && grade !== 'all' ? `grade ${grade}` : null,
    shown.includes('subject') && subject ? subjectLabelOf(subject).toLowerCase() : null,
  ].filter(Boolean)

  const clear = () => onSelect({ gradeLevel: null, subject: null, cohortGrade: null })

  return (
    <div
      className="sticky top-2 z-20 rounded-2xl border border-navy/10 px-4 py-3 backdrop-blur-md"
      style={{
        background: 'rgba(255,255,255,0.9)',
        boxShadow: '0 18px 44px -34px rgba(16,28,61,0.5)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {/* ── The frame: which dataset ── */}
        {tests.length > 1 ? (
          tests.length <= 3 ? (
            <Segmented
              uid="test"
              ariaLabel="Test"
              value={ctx?.testType}
              options={tests.map((t) => ({ value: t, label: testLabel(t) }))}
              // A NEW TEST IS A NEW QUESTION. Merging the patch carried the old
              // test's year and grade across — a school with TerraNova grade 5
              // and an ACT in grade 11 switched to ACT, kept gradeLevel 5, got
              // an empty dashboard, and had no grade 5 option left to click
              // back out of.
              onChange={(t) => onSelect({ testType: t, schoolYear: null, gradeLevel: null, cohortGrade: null, subject: null })}
            />
          ) : (
            <FilterChip
              label="Test"
              value={ctx?.testType}
              allLabel="Test"
              options={tests.map((t) => ({ value: t, label: testLabel(t) }))}
              onChange={(t) => onSelect({ testType: t, schoolYear: null, gradeLevel: null, cohortGrade: null, subject: null })}
            />
          )
        ) : null}

        {years.length > 1 ? (
          years.length <= 4 ? (
            <Segmented
              uid="year"
              ariaLabel="School year"
              value={ctx?.year}
              options={[...years].sort((a, b) => a - b).map((y) => ({ value: y, label: String(y) }))}
              onChange={(y) => onSelect({ schoolYear: Number(y) })}
            />
          ) : (
            <FilterChip
              label="Year"
              value={ctx?.year}
              allLabel="Year"
              options={years.map((y) => ({ value: y, label: String(y) }))}
              onChange={(y) => onSelect({ schoolYear: Number(y) })}
            />
          )
        ) : null}

        {(tests.length > 1 || years.length > 1) && shown.length > 0 ? (
          <span aria-hidden="true" className="h-6 w-px bg-navy/10" />
        ) : null}

        {/* ── The lens: only what bites on this view ── */}
        {shown.includes('grade') && (ctx?.grades ?? []).length > 0 ? (
          <FilterChip
            label="Grade"
            value={grade}
            allLabel="All grades"
            options={[
              { value: 'all', label: 'All grades' },
              ...(ctx.grades ?? []).map((g) => ({ value: g, label: `Grade ${g}` })),
            ]}
            onChange={(g) => onSelect({ gradeLevel: g === 'all' ? null : g })}
          />
        ) : null}

        {shown.includes('subject') && subjects.length > 1 ? (
          <FilterChip
            label={totalIsDefault ? 'Measure' : 'Subject'}
            value={subject}
            allLabel={totalIsDefault ? totalLabel : 'All subjects'}
            options={[
              { value: '', label: totalIsDefault ? totalLabel : 'All subjects' },
              ...subjects.map((s) => ({ value: s, label: subjectLabelOf(s) })),
            ]}
            onChange={(s) => onSelect({ subject: s || null })}
          />
        ) : null}

        {narrowed.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-navy/[0.05] hover:text-navy"
          >
            <RotateCcw size={12} /> Clear
          </button>
        ) : null}

        {/* ── Presentation, not filtering — so it sits apart ── */}
        <label
          className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
          style={anonymous ? { background: `${HUE}14`, color: '#0f766e' } : { color: '#64748b' }}
          title="Replace every peer school's name with its position, server-side"
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={Boolean(anonymous)}
            onChange={(e) => onAnonymous(e.target.checked)}
          />
          <span
            aria-hidden="true"
            className="relative h-[18px] w-[32px] rounded-full transition-colors"
            style={{ background: anonymous ? HUE : 'rgba(16,28,61,0.18)' }}
          >
            <motion.span
              className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm"
              animate={{ left: anonymous ? 16 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            />
          </span>
          <EyeOff size={13} /> Hide peer names
        </label>
      </div>

      {/* ── What you are looking at, in words ── */}
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
        <SlidersHorizontal size={11} style={{ color: HUE }} />
        {loading ? (
          <span>Updating…</span>
        ) : (
          <span>
            {testLabel(ctx?.testType)} · {ctx?.year} ·{' '}
            {narrowed.length > 0 ? (
              <span className="font-semibold text-navy">{narrowed.join(' · ')}</span>
            ) : (
              'everything on file'
            )}
            {ctx?.peerCount ? ` — against ${ctx.peerCount} peer school${ctx.peerCount === 1 ? '' : 's'}` : ''}
          </span>
        )}
      </p>
    </div>
  )
}
