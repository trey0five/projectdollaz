// ─────────────────────────────────────────────────────────────────────────────
// SignalCoverageTable — Phase E: every signal the early-warning engine tried to
// read, and for each one that it could not, THE REASON IN THE ENGINE'S OWN WORDS.
//
// This is the table that makes the whole engine legible. A school looking at four
// findings has no way to judge whether that is four out of four or four out of
// thirty-five; this answers that in one screen, and it answers it in the direction
// nobody else in this market will: by listing what we cannot see.
//
// THE FOUR AVAILABILITY STATES ARE NOT A RANKING AND ARE NOT A SCORE:
//   available     — read, dated, usable.
//   not_licensed  — the school has not bought that module. OUR commercial state,
//                   not their failure. It lowers coverage; it never lowers a score
//                   and never produces a finding.
//   no_data       — the query ran and found nothing. A real, common, honest answer.
//   not_tracked   — KYRO does not hold this at all. OUR hole, and we say so.
//
// `unavailableReason` is printed VERBATIM. It is composed server-side precisely so
// that no client can soften "we do not track this" into "coming soon".
//
// GRACEFUL, HONEST DEGRADATION. The per-signal rows are optional on the wire. When
// `/twin` carries them the full catalog renders. When it does not, this component
// falls back to the two things the payload always guarantees — the availability
// COUNTS, and the blocked signals named one-by-one in `notEvaluated[]` — and says
// plainly that the rest of the roster is not in this payload. It never invents a
// row and it never implies a signal is fine because it is missing from the list.
// ─────────────────────────────────────────────────────────────────────────────
import { Radio } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'

const AMBER = '#F59E0B'

const AVAILABILITY_META = {
  available: { label: 'Available', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  not_licensed: { label: 'Not licensed', cls: 'border-[#F59E0B]/40 bg-amber-50 text-amber-700' },
  no_data: { label: 'No data', cls: 'border-rule/60 bg-section text-muted' },
  not_tracked: { label: 'Not tracked', cls: 'border-navy/20 bg-navy/5 text-navy' },
}

const CHANGE_STATE_LABEL = {
  moved: 'Moved',
  unchanged: 'Unchanged',
  stale_data: 'Gone quiet',
  never_observed: 'Never observed',
}

function AvailabilityChip({ availability }) {
  const meta = AVAILABILITY_META[availability] ?? AVAILABILITY_META.no_data
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function Th({ children }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
      {children}
    </th>
  )
}

function CountPill({ availability, n }) {
  const meta = AVAILABILITY_META[availability] ?? AVAILABILITY_META.no_data
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${meta.cls}`}
    >
      {meta.label}
      <span className="tabular-nums">{n}</span>
    </span>
  )
}

/** The counts strip — always renderable, because coverage.signals is guaranteed. */
function CountsStrip({ counts }) {
  if (!counts) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {['available', 'not_licensed', 'no_data', 'not_tracked'].map((k) =>
        typeof counts[k] === 'number' ? <CountPill key={k} availability={k} n={counts[k]} /> : null,
      )}
    </div>
  )
}

function Shell({ counts, children }) {
  return (
    <section className="rounded-2xl border border-rule/50 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-serif text-[16px] font-semibold text-navy">
            <Radio size={15} style={{ color: AMBER }} aria-hidden />
            Signal coverage
          </h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
            What the early-warning engine tried to read, and — for everything it could not — why,
            in its own words.
          </p>
        </div>
        <CountsStrip counts={counts} />
      </div>
      {children}
    </section>
  )
}

export default function SignalCoverageTable({
  /** The collected signal set, when /twin carries it. Optional by contract. */
  rows = [],
  /** coverage.signals — always present on a live payload. */
  counts = null,
  /** Used for the honest fallback when `rows` is empty. */
  notEvaluated = [],
  loading = false,
}) {
  if (loading && rows.length === 0 && !counts) {
    return (
      <Shell counts={null}>
        <div className="h-24 rounded-xl bg-section motion-safe:animate-pulse" aria-hidden />
      </Shell>
    )
  }

  // ── FALLBACK: no per-signal roster on the wire. Say so, then say the part we
  //    genuinely know — every signal that blocked a rule, named, with its own
  //    message. This is strictly more useful than an empty table and strictly
  //    more honest than a fabricated one.
  if (rows.length === 0) {
    const blocked = []
    const seen = new Set()
    for (const ne of notEvaluated) {
      if (!ne.blockingSignalKey || seen.has(ne.blockingSignalKey)) continue
      seen.add(ne.blockingSignalKey)
      blocked.push(ne)
    }
    return (
      <Shell counts={counts}>
        <p className="text-[12.5px] leading-relaxed text-muted">
          The per-signal roster is not in this payload, so the counts above are the whole of what
          we can show for the signals that read cleanly. Every signal that <em>blocked</em> a rule
          is listed below with the engine&apos;s own reason.
        </p>
        {blocked.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">
            No signal blocked a rule on this run.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {blocked.map((ne) => (
              <li
                key={ne.blockingSignalKey}
                className="rounded-xl border border-rule/50 bg-cream/50 px-3 py-2"
              >
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-navy">
                  {ne.blockingSignalLabel ?? ne.blockingSignalKey}
                  <span className="rounded-md border border-rule/60 bg-section px-1.5 py-0.5 font-mono text-[10.5px] font-normal text-muted">
                    {ne.blockingSignalKey}
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{ne.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Shell>
    )
  }

  return (
    <Shell counts={counts}>
      <div className="overflow-x-auto rounded-xl border border-rule/50">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-cream">
            <tr>
              <Th>Signal</Th>
              <Th>Availability</Th>
              <Th>Observed</Th>
              <Th>Change</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const live = s.availability === 'available'
              return (
                <tr key={s.key} className="border-t border-rule/50 align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-navy">{s.label}</p>
                    <p className="font-mono text-[10.5px] text-muted">{s.key}</p>
                    {/* The engine's own words, verbatim. Never softened, never a
                        "coming soon", never replaced by an empty cell. */}
                    {!live && s.unavailableReason ? (
                      <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted">
                        {s.unavailableReason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <AvailabilityChip availability={s.availability} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {s.observedOn ? (
                      formatShortDate(String(s.observedOn).slice(0, 10))
                    ) : (
                      <span className="text-muted/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {live ? (CHANGE_STATE_LABEL[s.changeState] ?? s.changeState) : <span className="text-muted/60">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        <span className="font-semibold text-navy">Not licensed</span> is a commercial state, not a
        finding: an unlicensed module lowers what we can evaluate, never your score.{' '}
        <span className="font-semibold text-navy">Not tracked</span> is our hole, not yours — and we
        name what would close it rather than proxying it with something that would score you wrongly.
      </p>
    </Shell>
  )
}
