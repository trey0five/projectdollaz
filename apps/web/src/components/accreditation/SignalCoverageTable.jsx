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
//
// PREMIUM UI P4: a `Section` (label "Signal coverage", the counts as Pills in the
// aside) holding a `DataTable` on the ground — availability as a 2px mark + word.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'
import { DataTable, Section, Pill } from '../ui/surface/index.js'

const AVAILABILITY_META = {
  available: { label: 'Available', tone: 'good' },
  not_licensed: { label: 'Not licensed', tone: 'watch' },
  no_data: { label: 'No data', tone: 'neutral' },
  not_tracked: { label: 'Not tracked', tone: 'neutral' },
}

const CHANGE_STATE_LABEL = {
  moved: 'Moved',
  unchanged: 'Unchanged',
  stale_data: 'Gone quiet',
  never_observed: 'Never observed',
}

function AvailabilityWord({ availability }) {
  const meta = AVAILABILITY_META[availability] ?? AVAILABILITY_META.no_data
  return <span className="text-ink">{meta.label}</span>
}

function CountPill({ availability, n }) {
  const meta = AVAILABILITY_META[availability] ?? AVAILABILITY_META.no_data
  return (
    <Pill variant="status" tone={meta.tone}>
      {meta.label} <span className="tabular-nums">{n}</span>
    </Pill>
  )
}

/** The counts strip — always renderable, because coverage.signals is guaranteed. */
function CountsStrip({ counts }) {
  if (!counts) return null
  return (
    <>
      {['available', 'not_licensed', 'no_data', 'not_tracked'].map((k) =>
        typeof counts[k] === 'number' ? <CountPill key={k} availability={k} n={counts[k]} /> : null,
      )}
    </>
  )
}

const LABEL = (
  <span className="inline-flex items-center gap-1.5">
    <Radio size={13} aria-hidden />
    Signal coverage
  </span>
)

function Shell({ counts, children }) {
  return (
    <Section label={LABEL} aside={<CountsStrip counts={counts} />}>
      <p className="mb-3 max-w-[72ch] text-small leading-relaxed text-ink2">
        What the early-warning engine tried to read, and — for everything it could not — why,
        in its own words.
      </p>
      {children}
    </Section>
  )
}

const COLUMNS = [
  {
    key: 'label',
    header: 'Signal',
    render: (s) => {
      const live = s.availability === 'available'
      return (
        <span className="block whitespace-normal">
          <span className="font-semibold text-ink">{s.label}</span>
          <span className="dt-sub">{s.key}</span>
          {/* The engine's own words, verbatim. Never softened, never a
              "coming soon", never replaced by an empty cell. */}
          {!live && s.unavailableReason ? (
            <span className="dt-sub max-w-xl !text-[12px] leading-relaxed">{s.unavailableReason}</span>
          ) : null}
        </span>
      )
    },
  },
  { key: 'availability', header: 'Availability', className: 'dt-nowrap', render: (s) => <AvailabilityWord availability={s.availability} /> },
  {
    key: 'observedOn',
    header: 'Observed',
    className: 'dt-nowrap',
    render: (s) => (s.observedOn ? <span className="text-ink2">{formatShortDate(String(s.observedOn).slice(0, 10))}</span> : <span className="text-ink2">—</span>),
  },
  {
    key: 'changeState',
    header: 'Change',
    className: 'dt-nowrap',
    render: (s) =>
      s.availability === 'available' ? <span className="text-ink2">{CHANGE_STATE_LABEL[s.changeState] ?? s.changeState}</span> : <span className="text-ink2">—</span>,
  },
]

export default function SignalCoverageTable({
  /** The collected signal set, when /twin carries it. Optional by contract. */
  rows = [],
  /** coverage.signals — always present on a live payload. */
  counts = null,
  /** Used for the honest fallback when `rows` is empty. */
  notEvaluated = [],
  loading = false,
}) {
  // ── FALLBACK: no per-signal roster on the wire. Say so, then say the part we
  //    genuinely know — every signal that blocked a rule, named, with its own
  //    message. This is strictly more useful than an empty table and strictly
  //    more honest than a fabricated one.
  const blocked = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const ne of notEvaluated) {
      if (!ne.blockingSignalKey || seen.has(ne.blockingSignalKey)) continue
      seen.add(ne.blockingSignalKey)
      out.push(ne)
    }
    return out
  }, [notEvaluated])

  if (loading && rows.length === 0 && !counts) {
    return (
      <Shell counts={null}>
        <div className="h-24 rounded bg-ink/[.04] motion-safe:animate-pulse" aria-hidden />
      </Shell>
    )
  }

  if (rows.length === 0) {
    return (
      <Shell counts={counts}>
        <p className="text-small leading-relaxed text-ink2">
          The per-signal roster is not in this payload, so the counts above are the whole of what
          we can show for the signals that read cleanly. Every signal that <em>blocked</em> a rule
          is listed below with the engine&apos;s own reason.
        </p>
        {blocked.length === 0 ? (
          <p className="mt-3 text-small text-ink2">No signal blocked a rule on this run.</p>
        ) : (
          <ul className="mt-3 border-t border-hair">
            {blocked.map((ne) => (
              <li key={ne.blockingSignalKey} className="border-b border-hair py-2.5">
                <p className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink">
                  {ne.blockingSignalLabel ?? ne.blockingSignalKey}
                  <Pill variant="count">{ne.blockingSignalKey}</Pill>
                </p>
                <p className="mt-0.5 text-small leading-relaxed text-ink2">{ne.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Shell>
    )
  }

  return (
    <Shell counts={counts}>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey="key"
        markOf={(s) => (AVAILABILITY_META[s.availability] ?? AVAILABILITY_META.no_data).tone}
        caption="Signal coverage"
      />
      <p className="sec-note">
        <span className="font-semibold text-ink">Not licensed</span> is a commercial state, not a
        finding: an unlicensed module lowers what we can evaluate, never your score.{' '}
        <span className="font-semibold text-ink">Not tracked</span> is our hole, not yours — and we
        name what would close it rather than proxying it with something that would score you wrongly.
      </p>
    </Shell>
  )
}
