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
import { ChevronRight, Info, RefreshCcw, Scale } from 'lucide-react'
import { EASE, fmtCount } from './enrollmentAnalyticsKit.jsx'
import { AuroraSection, AuroraTile, AuroraTileGrid, AuroraLightButton, HowThisWorks } from '../ui/aurora/index.js'

/**
 * BOTH NUMBERS, NAMED — and what to do about them.
 *
 * Amber, not red: nothing is broken and no figure on the page is wrong. Two
 * true readings were taken at two moments, and the page is telling you which.
 */
export function ReconciliationStrip({ reconciliation, periodLabel = null, onResync = null }) {
  if (!reconciliation?.diverged) return null
  const { promoted, currentReading } = reconciliation
  const full = `The headcount promoted to ${periodLabel ?? 'this fiscal year'} is ${fmtCount(promoted)} — the number the band, the briefing and your board pack all quote. The reading the grade charts and the vs-plan table are drawn from counts ${fmtCount(currentReading)}. Your register has moved since the last promote. Re-sync your roster so every surface quotes one number.`
  return (
    <AuroraSection first icon={Scale} tone="watch" title="Needs a look" subtitle="Two readings are in play" role="status">
      <AuroraTileGrid cols={2}>
        <AuroraTile
          icon={Scale}
          tone="watch"
          title="Two readings are in play, and this page shows both."
          desc={`Promoted ${fmtCount(promoted)} · register ${fmtCount(currentReading)}. Re-sync so every page agrees.`}
          tip={full}
          foot={
            onResync ? (
              <AuroraLightButton size="sm" hue="#b45309" onClick={onResync} icon={<RefreshCcw size={14} aria-hidden="true" />}>
                Re-sync roster
              </AuroraLightButton>
            ) : null
          }
        />
      </AuroraTileGrid>
    </AuroraSection>
  )
}

/** The server-authored honesty lines, printed verbatim — the web does not
 *  compose them, and must not paraphrase them into something weaker.
 *
 *  COLLAPSED BY DEFAULT, DELETED NEVER. The block used to open as a bullet wall
 *  on every view; it is now a native <details> disclosure ("About these
 *  figures ▸") that expands to the same bullets, verbatim. Native details:
 *  keyboard toggling, sane semantics and no JS for free — and the notes count is
 *  printed on the summary so a reader knows the fold is not empty. */
export function EnrollmentNotes({ notes = [], reduce = false }) {
  if (!notes.length) return null
  return (
    <motion.aside
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      aria-label="What to know about these figures"
      className="mt-10 border-t border-hair pt-3"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-micro font-semibold uppercase text-ink2 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-navy-soft/40 [&::-webkit-details-marker]:hidden">
          <Info size={12} /> About these figures
          <span className="font-medium normal-case tracking-normal text-ink2">
            · {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
          <ChevronRight
            size={13}
            aria-hidden="true"
            className="transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
          />
        </summary>
        <ul className="mt-2.5 space-y-1.5">
          {notes.map((n) => (
            <li key={n} className="flex gap-2 text-small leading-relaxed text-ink2">
              <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink/25" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </details>
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
export function UnavailableBlock({ unavailable = [] }) {
  if (!unavailable.length) return null
  return (
    <HowThisWorks title="What this page can't show yet" aria-label="What this page can't show yet" className="!mt-4">
      <p>
        Figures a diocesan report often carries that we will not draw, because the data behind them does not exist
        here — an invented denominator is worse than a missing chart.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
        {unavailable.map((u) => (
          <div key={u.key} className="min-w-0 border-t border-hair py-2.5">
            <dt className="text-small font-semibold text-ink">{u.label}</dt>
            <dd className="mt-0.5 text-[12px] leading-relaxed text-ink2">{u.reason}</dd>
          </div>
        ))}
      </dl>
    </HowThisWorks>
  )
}
