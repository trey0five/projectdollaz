// ─────────────────────────────────────────────────────────────────────────────
// THE TWO HONESTY SURFACES — the parts of this page that report on the data
// rather than from it. Both are features. Neither is an apology.
//
// ── 1. RECONCILIATION ───────────────────────────────────────────────────────
// The hero tiles read `period_operational_data.enrollment` — the PROMOTED
// headcount that the briefing, the scorecard, the org roll-up and the board pack
// all quote. The grade-level views read the CURRENT observation. They are the
// same number right up until the register moves after the last promote, and then
// they are not: a live call against real data found 435 promoted against 436 on
// the register, with the vs-plan table reading −3.11% under a tile reading
// −3.33%.
//
// The wrong responses are (a) hide one, (b) average them, (c) quietly redraw the
// tile from the reading. All three destroy the property that makes the tile
// worth anything: that it is the same number every other surface prints. So the
// page shows BOTH, names which is which, and turns the discrepancy into a task.
//
// ── 2. WHAT THIS PAGE CANNOT SHOW YET ───────────────────────────────────────
// The deck this page replaces has a "Percent Full 91%" gauge, an average class
// size, a 20+-absences count, two faith-participation stats and a teacher
// retention chart. We hold the data for none of them — capacity appears nowhere
// in the schema, sections are not imported, attendance is not collected,
// religion is deliberately not stored, and staff are aggregate FTE.
//
// Omitting them silently would be the worst option: the reader who knows the
// deck will hunt for them, not find them, and conclude the page is incomplete or
// — worse — read some neighbouring number as the missing one. Naming each
// absence WITH ITS REASON is what stops a "percent full" figure from eventually
// being invented out of an enrollment total and a guess.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { AlertTriangle, Info, RefreshCcw } from 'lucide-react'
import { EASE, fmtCount } from './enrollmentAnalyticsKit.jsx'

/**
 * BOTH NUMBERS, NAMED — and what to do about them.
 *
 * Amber, not red: nothing is broken and no figure on the page is wrong. Two
 * true readings were taken at two moments, and the page is telling you which.
 */
export function ReconciliationStrip({ reconciliation, periodLabel = null, onResync = null, reduce = false }) {
  if (!reconciliation?.diverged) return null
  const { promoted, currentReading } = reconciliation
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      role="status"
      className="flex flex-col gap-3 rounded-2xl bg-amber-500/[0.07] px-4 py-3.5 ring-1 ring-amber-500/25 sm:flex-row sm:items-center"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700">
        <AlertTriangle size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-navy">
          Two readings are in play, and this page shows both.
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          The headcount promoted to {periodLabel ?? 'this fiscal year'} is{' '}
          <span className="font-bold tabular-nums text-navy">{fmtCount(promoted)}</span> — that is the number the
          tiles, the briefing and your board pack all quote. The reading the grade charts and the vs-plan table are
          drawn from counts{' '}
          <span className="font-bold tabular-nums text-navy">{fmtCount(currentReading)}</span>. Your register has moved
          since the last promote. Re-sync your roster so every surface quotes one number.
        </p>
      </div>
      {onResync ? (
        <button
          type="button"
          onClick={onResync}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-500/40 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy transition-colors hover:bg-amber-500/10 sm:self-auto"
        >
          <RefreshCcw size={14} /> Re-sync roster
        </button>
      ) : null}
    </motion.div>
  )
}

/** The server-authored honesty lines, printed verbatim — the web does not
 *  compose them, and must not paraphrase them into something weaker. */
export function EnrollmentNotes({ notes = [], reduce = false }) {
  if (!notes.length) return null
  return (
    <motion.aside
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: EASE }}
      aria-label="What to know about these figures"
      className="av2-card p-4 sm:p-5"
    >
      <h4 className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
        <Info size={12} /> What to know about these figures
      </h4>
      <ul className="space-y-1.5">
        {notes.map((n) => (
          <li key={n} className="flex gap-2 text-[12.5px] leading-relaxed text-navy/75">
            <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-navy/25" />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </motion.aside>
  )
}

/**
 * WHAT THIS PAGE CANNOT SHOW YET — each absence with its reason.
 *
 * Deliberately calm: a plain list on a quiet surface, not a warning panel. These
 * are not errors and not a to-do list for the reader; they are the boundary of
 * what the data can honestly support, published so nobody has to guess where it
 * runs.
 */
export function UnavailableBlock({ unavailable = [], reduce = false }) {
  if (!unavailable.length) return null
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: EASE }}
      aria-label="What this page can't show yet"
      className="rounded-2xl bg-navy/[0.025] p-4 ring-1 ring-navy/[0.07] sm:p-5"
    >
      <h3 className="font-serif text-[16px] font-semibold text-navy">What this page can&apos;t show yet</h3>
      <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        These are the figures a diocesan report usually carries that we will not draw, because the data behind them
        does not exist here. Each one is named with the reason rather than left off quietly — an invented denominator
        is worse than a missing chart.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {unavailable.map((u) => (
          <div key={u.key} className="min-w-0">
            <dt className="text-[12.5px] font-bold text-navy">{u.label}</dt>
            <dd className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{u.reason}</dd>
          </div>
        ))}
      </dl>
    </motion.section>
  )
}
