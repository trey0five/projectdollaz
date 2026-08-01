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
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Award, BadgeCheck, Gauge } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'

const AMBER_INK = '#B45309'

function Glyph(props) {
  const Icon = props.icon
  return <Icon size={props.size ?? 13} aria-hidden className={props.className} />
}

/** One exclusion counter. Rendered only when it has something to report. */
function ExclusionStat({ label, value, title }) {
  if (typeof value !== 'number') return null
  return (
    <div
      title={title || undefined}
      className="rounded-lg border border-rule/60 bg-white px-2.5 py-1.5"
    >
      <p className="font-serif text-[17px] font-semibold leading-none text-navy">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{label}</p>
    </div>
  )
}

function Chip({ children, tone = 'neutral', title }) {
  const cls =
    tone === 'good'
      ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#8a5a06]'
        : 'border-rule/70 bg-section text-muted'
  return (
    <span
      title={title || undefined}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
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
      className="rounded-xl border border-emerald-300/50 bg-emerald-50/40 px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-rule/60 bg-white px-2 py-0.5 text-[12px] font-semibold text-muted">
          {item.code}
        </span>
        <span className="min-w-0 break-words text-[14px] font-semibold text-navy">{item.title}</span>
        <Chip tone="good" title="Your own rubric self-score">
          <Glyph icon={BadgeCheck} size={11} />
          {item.rubricLabel ?? `${item.rubricScore} of 4`}
        </Chip>
      </div>

      {/* THE NARRATIVE — deterministic, no LLM, every numeral traceable. Verbatim. */}
      {item.narrative ? (
        <p className="mt-1.5 max-w-[85ch] text-[12.5px] leading-relaxed text-navy/80">
          {item.narrative}
        </p>
      ) : null}

      {evidence.length || signals.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {evidence.map((e) => (
            <Chip
              key={`${e.tag}-${e.label}`}
              tone="neutral"
              title={e.expiresOn ? `Current to ${e.expiresOn}` : undefined}
            >
              {e.label}
              {e.expiresOn ? (
                <span className="font-normal opacity-75">
                  · to {formatShortDate(String(e.expiresOn).slice(0, 10))}
                </span>
              ) : null}
            </Chip>
          ))}
          {signals.map((s) => (
            <Chip key={s.key} tone="amber" title={s.asOf ? `As of ${s.asOf}` : undefined}>
              <Glyph icon={Gauge} size={11} />
              {s.label}
              {s.formattedValue ? (
                <span className="font-bold" style={{ color: AMBER_INK }}>
                  {s.formattedValue}
                </span>
              ) : null}
            </Chip>
          ))}
        </div>
      ) : null}
    </motion.li>
  )
}

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
}) {
  const reduce = useReducedMotion()

  // Degraded is one line, never a rubric-only list assembled to fill the space.
  if (notLicensed || (error && commendations.length === 0)) {
    return (
      <section className={`rounded-2xl border border-rule/60 bg-white p-4 ${className}`}>
        <p className="text-[12.5px] text-muted">Commendations are unavailable right now.</p>
      </section>
    )
  }

  if (loading && commendations.length === 0 && !exclusions) {
    return (
      <section className={`rounded-2xl border border-rule/60 bg-white p-4 ${className}`}>
        <div className="h-[54px] rounded-lg bg-section motion-safe:animate-pulse" aria-hidden />
      </section>
    )
  }

  return (
    <section className={`rounded-2xl border border-rule/60 bg-white p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          <Glyph icon={Award} size={12} className="text-[#F59E0B]" />
          Commendations
        </p>
        <span className="text-[11.5px] font-semibold text-muted">
          {commendations.length} defensible
        </span>
      </div>

      {/* The frozen caveat, verbatim — it names all three tests and the population. */}
      {caveat ? (
        <p className="mt-1.5 max-w-[85ch] text-[12.5px] leading-relaxed text-muted">{caveat}</p>
      ) : null}

      {/* THE REASON, when the reason is ours. A school with no imported trial
          balance has no favorable figure because KYRO could not value one — not
          because its numbers are bad. Server sentence, rendered verbatim. */}
      {signalsUnavailable?.message ? (
        <p className="mt-2 rounded-lg border border-rule/60 bg-section px-2.5 py-1.5 text-[12px] leading-relaxed text-muted">
          {signalsUnavailable.message}
        </p>
      ) : null}

      {commendations.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {commendations.map((c) => (
            <CommendationCard key={c.standardId} item={c} reduce={reduce} />
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          {/* NOT an empty state. The counts are the answer — and "no artifact list
              yet" is kept separate from "no current evidence", because a standard
              we never asked for an artifact against has not failed anything. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <ExclusionStat label="Eligible" value={exclusions?.eligible} />
            <ExclusionStat label="Not self-scored yet" value={exclusions?.noScore} />
            <ExclusionStat label="Scored below the bar" value={exclusions?.lowScore} />
            <ExclusionStat label="No artifact list yet" value={exclusions?.noRequirements} />
            <ExclusionStat label="No current evidence" value={exclusions?.noCurrentEvidence} />
            <ExclusionStat
              label="No favorable figure"
              value={exclusions?.noFavorableSignal}
              title={signalsUnavailable?.message || undefined}
            />
          </div>
        </div>
      )}
    </section>
  )
}
