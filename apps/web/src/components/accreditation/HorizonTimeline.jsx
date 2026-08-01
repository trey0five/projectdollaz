// ─────────────────────────────────────────────────────────────────────────────
// HorizonTimeline — Phase E: twenty-four months, and an equally prominent column
// for every finding we refuse to put a date on.
//
// THE RIGHT-HAND COLUMN IS THE POINT OF THIS COMPONENT. Any product can draw a
// timeline of the things it happens to have dates for; the discipline is showing,
// at the same size and in the same card, the findings whose honest answer is
// "we cannot give you a date, and here is why". Those are `horizon.kind === 'none'`
// and their `horizon.reason` is printed verbatim.
//
// TWO KINDS OF DATE, DRAWN DIFFERENTLY ON PURPOSE:
//   · `by_date`            — a STATED REGISTER DATE (a plan end date, an evidence
//                            expiry). A fact, not a projection. Solid marker, and
//                            it carries no statistical confidence because attaching
//                            one to a stated date would be a category error.
//   · `periods_to_breach`  — a PROJECTION, and only ever produced at the engine's
//                            top confidence rung. DASHED marker, and its label says
//                            "at the current rate" so it can never be misread as a
//                            commitment.
//
// LIKELIHOOD IS A WORD. 'possible' or 'likely', rendered as the word, always.
// There is no percentage anywhere in this file and there must never be one: the
// engine deliberately emits an ordinal, and converting it to a number in the UI
// would manufacture a precision the arithmetic does not have — and it would put a
// probability of an accreditation outcome on a school's screen, which this program
// does not do.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, HelpCircle } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'

const AMBER = '#F59E0B'
const AMBER_INK = '#B45309'
const MONTHS = 24
const TICKS = 12 // one label every two months

const SEVERITY_MARK = {
  critical: '#DC2626',
  warn: AMBER,
  info: '#64748B',
}

/** yyyy-mm-dd → a UTC Date, or null. No local-timezone drift on a date-only string. */
function parseDay(value) {
  if (typeof value !== 'string' || value.length < 10) return null
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Fractional months from `from` to `to`. Negative when `to` is in the past. */
function monthsBetween(from, to) {
  const whole = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  const dayFraction = (to.getUTCDate() - from.getUTCDate()) / 30.44
  return whole + dayFraction
}

/** "Aug '26" for the tick rail. */
function tickLabel(base, monthOffset) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, 1))
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = String(d.getUTCFullYear()).slice(-2)
  return `${month} '${year}`
}

function LikelihoodChip({ likelihood }) {
  // THE WORD. Never a number, never a percentage, never a decision.
  if (!likelihood) return null
  return (
    <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
      {likelihood}
    </span>
  )
}

function StandardTags({ tags = [] }) {
  if (!tags.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.slice(0, 3).map((t) => (
        <span
          key={t}
          className="rounded-md border border-[#F59E0B]/35 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700"
        >
          {t}
        </span>
      ))}
    </span>
  )
}

/** One finding's lane against the shared axis. */
function Lane({ plot, index, reduce }) {
  const { finding, offsetPct, capped, projected, label } = plot
  const color = SEVERITY_MARK[finding.severity] ?? AMBER

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: reduce ? 0 : Math.min(index, 8) * 0.04 }}
      className="py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StandardTags tags={finding.standardTags} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-navy">
          {finding.title}
        </span>
        <LikelihoodChip likelihood={finding.likelihood} />
      </div>

      {/* The track. A STATED date draws a solid connector; a PROJECTION draws a
          dashed one — the visual difference is load-bearing, not decoration. */}
      <div className="relative mt-2 h-[18px]">
        <div className="absolute inset-x-0 top-[8px] h-[2px] rounded-full bg-section" aria-hidden />
        {projected ? (
          <div
            className="absolute top-[8px]"
            style={{
              left: 0,
              width: `${offsetPct}%`,
              borderTop: `2px dashed ${color}`,
              opacity: 0.55,
            }}
            aria-hidden
          />
        ) : (
          <div
            className="absolute top-[8px] h-[2px] rounded-full"
            style={{ left: 0, width: `${offsetPct}%`, backgroundColor: color, opacity: 0.4 }}
            aria-hidden
          />
        )}
        <span
          className="absolute top-[3px] -ml-[6px] inline-block h-3 w-3 rounded-full border-2 bg-white"
          style={{
            left: `${offsetPct}%`,
            borderColor: color,
            borderStyle: projected ? 'dashed' : 'solid',
          }}
          aria-hidden
        />
        {capped ? (
          <span
            className="absolute right-0 top-0 text-[10.5px] font-semibold text-muted"
            title="Beyond the twenty-four-month window"
          >
            ≥24m
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-[12px] font-semibold" style={{ color: AMBER_INK }}>
        {label}
      </p>
    </motion.li>
  )
}

export default function HorizonTimeline({ findings = [], now = null, loading = false }) {
  const reduce = useReducedMotion()
  const base = parseDay(now)

  const { plotted, undated } = useMemo(() => {
    const dated = []
    const none = []
    for (const f of findings) {
      const h = f?.horizon
      if (!h || h.kind === 'none' || h.kind == null) {
        none.push(f)
        continue
      }
      if (h.kind === 'by_date') {
        const at = parseDay(typeof h.value === 'string' ? h.value : null)
        if (!at || !base) {
          none.push(f)
          continue
        }
        const months = monthsBetween(base, at)
        const clamped = Math.max(0, Math.min(months, MONTHS))
        const day = formatShortDate(String(h.value).slice(0, 10))
        dated.push({
          finding: f,
          months,
          offsetPct: (clamped / MONTHS) * 100,
          capped: months > MONTHS,
          projected: false,
          // A stated date is a fact: print the date, nothing more. A date that has
          // ALREADY PASSED pins to the left edge, so it is labelled as past —
          // otherwise a lapsed audit reads as though it expires today, which is the
          // one misreading a horizon strip can cause on its own.
          label: months < 0 ? `${day} · already passed` : day,
        })
        continue
      }
      if (h.kind === 'periods_to_breach') {
        const years = Number(h.value)
        if (!Number.isFinite(years) || !base) {
          none.push(f)
          continue
        }
        const months = years * 12
        const clamped = Math.max(0, Math.min(months, MONTHS))
        dated.push({
          finding: f,
          months,
          offsetPct: (clamped / MONTHS) * 100,
          capped: months > MONTHS,
          projected: true,
          // "at the current rate" is load-bearing: this is a projection, and the
          // sentence must never read as a commitment to a date.
          label: `about ${years} year${years === 1 ? '' : 's'} at the current rate`,
        })
        continue
      }
      none.push(f)
    }
    dated.sort((a, b) => a.months - b.months)
    return { plotted: dated, undated: none }
  }, [findings, base])

  const ticks = useMemo(() => {
    if (!base) return []
    return Array.from({ length: TICKS }, (_, i) => tickLabel(base, i * (MONTHS / TICKS)))
  }, [base])

  if (loading && findings.length === 0) {
    return (
      <section className="kpi-3d rounded-2xl p-4">
        <div className="h-32 rounded-xl bg-section motion-safe:animate-pulse" aria-hidden />
      </section>
    )
  }

  return (
    <section className="kpi-3d rounded-2xl p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 font-serif text-[16px] font-semibold text-navy">
          <CalendarClock size={15} style={{ color: AMBER }} aria-hidden />
          The next twenty-four months
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          Stated dates are drawn solid; projections are drawn dashed and labelled &ldquo;at the
          current rate&rdquo;. Likelihood is a word, never a percentage.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── LEFT: the axis and its lanes ─────────────────────────────────── */}
        <div className="min-w-0 lg:col-span-2">
          {plotted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-4 py-8 text-center">
              <p className="text-[13px] font-semibold text-navy">
                No finding carries a date we can stand behind.
              </p>
              <p className="mt-1 text-[12.5px] text-muted">
                That is an answer, not an empty state — every open finding is listed to the right
                with the reason no date can honestly be given.
              </p>
            </div>
          ) : (
            <>
              {base ? (
                // A 12-column grid, not justify-between: every tick must sit at
                // exactly i/12 of the track or the labels stop describing the
                // markers underneath them. Odd labels are made INVISIBLE on small
                // screens rather than removed, so the columns keep their positions.
                <div className="mb-1 grid grid-cols-12 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {ticks.map((t, i) => (
                    <span key={`${t}-${i}`} className={i % 2 === 0 ? '' : 'invisible sm:visible'}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <ul className="divide-y divide-rule/40 border-t border-rule/40">
                {plotted.map((p, i) => (
                  <Lane key={p.finding.findingKey ?? p.finding.factKey} plot={p} index={i} reduce={reduce} />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ── RIGHT: the column that is the point of this component ─────────── */}
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
            <HelpCircle size={13} aria-hidden />
            No date we can honestly give
          </h4>
          {undated.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted">
              Every open finding carries a date.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {undated.map((f) => (
                <li
                  key={f.findingKey ?? f.factKey}
                  className="rounded-xl border border-rule/50 bg-cream/50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StandardTags tags={f.standardTags} />
                    <LikelihoodChip likelihood={f.likelihood} />
                  </div>
                  <p className="mt-1 text-[13px] font-semibold leading-snug text-navy">{f.title}</p>
                  {/* The engine's own reason, verbatim. Never a guessed date. */}
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {f.horizon?.reason ?? 'No horizon was computed for this finding.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
