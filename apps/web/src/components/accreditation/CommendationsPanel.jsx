// ─────────────────────────────────────────────────────────────────────────────
// CommendationsPanel — Phase C: THE STRENGTHS SURFACE.
//
// A visiting team writes commendations before recommendations, and every other
// screen in this module is about what is missing. This is the one that says what
// the school can actually defend — and it is only credible because it is hard to
// earn: three independent things must be true of the same standard at the same
// time, and the server enforces all three.
//
//   1. The school scored it highly on the accreditor's own rubric.
//   2. The evidence behind it is CURRENT — not merely present, not expiring, not
//      undated. "We have a policy somewhere" is not a strength.
//   3. An operating figure KYRO derived independently agrees. The school did not
//      enter that figure for accreditation, which is exactly what makes it worth
//      something in the room.
//
// ZERO COMMENDATIONS IS A LEGITIMATE AND COMMON ANSWER, and this panel is built
// to say so with numbers rather than an empty box or a padded list. The exclusion
// counts show precisely which of the three tests each standard fell at, so "none
// yet" is an actionable sentence and not a verdict. A rubric-only "strength" is
// the single thing this component must never render — it is the flattery the
// whole phase exists to refuse.
//
// Every sentence is the server's: the caveat, the narrative template, the signal
// labels and their formatted values. Nothing here composes a claim, and no number
// on screen is computed in the browser.
//
// PREMIUM UI P4 (a2): a ledger block — label rule with the defensible count as
// its aside, each commendation a ruled row (code tag, title, rubric word as a
// status Pill, evidence and figures as Pills), and the exclusion counts as a
// StatStrip whose figures count up once. No green wash, no boxed counters.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Award, BadgeCheck, Gauge } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'
import { Pill, Stat, StatStrip } from '../ui/surface/index.js'
import '../../styles/pending/a2-carry.css'

function Glyph(props) {
  const Icon = props.icon
  return <Icon size={props.size ?? 13} aria-hidden className={props.className} />
}

/** The label rule every state of the panel opens with. */
function Head({ aside = null }) {
  return (
    <div className="sec-head">
      <h3 className="sec-label inline-flex items-center gap-1.5">
        <Glyph icon={Award} size={12} />
        Commendations
      </h3>
      <span className="sec-rule" aria-hidden="true" />
      {aside ? <div className="sec-aside">{aside}</div> : null}
    </div>
  )
}

function CommendationCard({ item, reduce }) {
  const evidence = item.evidence ?? []
  const signals = item.signals ?? []
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="a2-code">{item.code}</span>
        <span className="min-w-0 break-words text-[15px] font-semibold text-ink">{item.title}</span>
        <Pill variant="status" tone="good" title="Your own rubric self-score">
          <Glyph icon={BadgeCheck} size={11} />
          {item.rubricLabel ?? `${item.rubricScore} of 4`}
        </Pill>
      </div>

      {/* THE NARRATIVE — deterministic, no LLM, every numeral traceable. Verbatim. */}
      {item.narrative ? (
        <p className="mt-1.5 max-w-[85ch] text-small leading-relaxed text-ink">{item.narrative}</p>
      ) : null}

      {evidence.length || signals.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {evidence.map((e) => (
            <Pill
              key={`${e.tag}-${e.label}`}
              className="max-w-full"
              title={e.expiresOn ? `Current to ${e.expiresOn}` : undefined}
            >
              <span className="truncate">{e.label}</span>
              {e.expiresOn ? (
                <span className="font-medium text-ink2">
                  · to {formatShortDate(String(e.expiresOn).slice(0, 10))}
                </span>
              ) : null}
            </Pill>
          ))}
          {signals.map((s) => (
            <Pill key={s.key} className="max-w-full" title={s.asOf ? `As of ${s.asOf}` : undefined}>
              <Glyph icon={Gauge} size={11} className="text-ink2" />
              <span className="truncate font-medium text-ink2">{s.label}</span>
              {s.formattedValue ? <span className="tabular-nums">{s.formattedValue}</span> : null}
            </Pill>
          ))}
        </div>
      ) : null}
    </motion.li>
  )
}

/** The six exclusion counters, as a StatStrip — only those the server sent. */
const EXCLUSION_STATS = [
  // [key, one-line label, the long form for the tooltip]
  ['eligible', 'Eligible', 'Standards eligible for a commendation'],
  ['noScore', 'Unscored', 'Not self-scored yet'],
  ['lowScore', 'Below bar', 'Scored below the bar'],
  ['noRequirements', 'No list', 'No artifact list yet'],
  ['noCurrentEvidence', 'Not current', 'No current evidence'],
  ['noFavorableSignal', 'No figure', 'No favorable operating figure'],
]

// ═════════════════════════════════════════════════════════════════════════════

export default function CommendationsPanel({
  commendations = [],
  exclusions = null,
  caveat = '',
  /** Server-composed: `{ reason, message }` when no operating figure could be
   *  valued at all. Rendered verbatim — the panel composes no reason of its own. */
  signalsUnavailable = null,
  loading = false,
  error = '',
  notLicensed = false,
  className = '',
  /** Hosted under a heading that already names it (the mock visit's Act 2):
   *  drop the panel's own label rule. The server's caveat stays — it carries the
   *  qualifying count and the population, which no host heading repeats. */
  bare = false,
}) {
  const reduce = useReducedMotion()

  // Degraded is one line, never a rubric-only list assembled to fill the space.
  if (notLicensed || (error && commendations.length === 0)) {
    return (
      <section className={className}>
        {bare ? null : <Head />}
        <p className="text-small text-ink2">Commendations are unavailable right now.</p>
      </section>
    )
  }

  if (loading && commendations.length === 0 && !exclusions) {
    return (
      <section className={className}>
        {bare ? null : <Head />}
        <div className="h-[54px] rounded-lg bg-ink/[0.04] motion-safe:animate-pulse" aria-hidden />
      </section>
    )
  }

  const stats = EXCLUSION_STATS.filter(([key]) => typeof exclusions?.[key] === 'number')

  return (
    <section className={className}>
      {bare ? null : (
        <Head
          aside={
            <Pill variant="count">{`${commendations.length} defensible`}</Pill>
          }
        />
      )}

      {/* The frozen caveat, verbatim — it names all three tests and the population. */}
      {caveat ? <p className="max-w-[85ch] text-small leading-relaxed text-ink2">{caveat}</p> : null}

      {/* THE REASON, when the reason is ours. A school with no imported trial
          balance has no favorable figure because KYRO could not value one — not
          because its numbers are bad. Server sentence, rendered verbatim. */}
      {signalsUnavailable?.message ? (
        <p className="a2-note mt-2">{signalsUnavailable.message}</p>
      ) : null}

      {commendations.length > 0 ? (
        <ul className="a2-rows mt-3">
          {commendations.map((c) => (
            <CommendationCard key={c.standardId} item={c} reduce={reduce} />
          ))}
        </ul>
      ) : stats.length > 0 ? (
        // NOT an empty state. The counts are the answer — and "no artifact list
        // yet" is kept separate from "no current evidence", because a standard
        // we never asked for an artifact against has not failed anything.
        <StatStrip className="stats-wrap stats-compact mt-3 border-t border-hair" cols={Math.min(stats.length, 6)}>
          {stats.map(([key, label, long]) => (
            <Stat
              key={key}
              label={label}
              value={exclusions[key]}
              title={
                key === 'noFavorableSignal' && signalsUnavailable?.message
                  ? `${long} — ${signalsUnavailable.message}`
                  : long
              }
            />
          ))}
        </StatStrip>
      ) : null}
    </section>
  )
}
