// ─────────────────────────────────────────────────────────────────────────────
// NamedHolesPanel — Phase E: the rules we ship VISIBLE and cannot evaluate.
//
// THIS PANEL IS A DELIVERABLE, NOT A SHORTFALL. Four rules — professional
// development, safe-environment clearances, curriculum documentation aging and
// measured academic growth — appear on every payload and can never fire today.
// They are on screen anyway, because a school preparing for a visit needs to know
// exactly what a visiting team will ask that KYRO cannot answer. Hiding them would
// leave a reader believing this engine had looked everywhere.
//
// A CANNOT-EVALUATE RULE IS NEVER RENDERED AS A CHECK, GREEN OR RED. It renders as
// "we cannot answer this, and here is precisely what would unlock it" — the
// blocking signal by name, the engine's own message, and the frozen unlock copy
// (which says, in every case, what we refuse to proxy it with and why). None of
// that copy is composed here; all of it arrives from the server.
//
// The second section — rules blocked for any other reason on THIS run — is the
// same honesty applied to the school's own live state: an unlicensed module, a
// register with one snapshot instead of two, a query that found nothing. Every one
// names its blocking signal, because "we could not look" and "we looked and it is
// fine" are different facts and this product never conflates them.
// ─────────────────────────────────────────────────────────────────────────────
import { KeyRound, ScanSearch } from 'lucide-react'

const AMBER = '#F59E0B'

const REASON_LABEL = {
  signal_not_licensed: 'Module not licensed',
  signal_no_data: 'No data recorded',
  signal_not_tracked: 'Not tracked in KYRO',
  signal_present_but_expected_absent: 'The absence we needed is not there',
  no_prior_observation: 'No earlier observation to compare',
  no_standards: 'No matching standard in your register',
  value_not_usable: 'The recorded value cannot answer this',
  cells_suppressed: 'Counts below the publication threshold',
}

function ReasonChip({ reason }) {
  return (
    <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] font-semibold text-muted">
      {REASON_LABEL[reason] ?? reason}
    </span>
  )
}

function RuleId({ id }) {
  return (
    <span className="rounded-md border border-rule/60 bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
      {id}
    </span>
  )
}

/** One row: the rule, why we cannot answer it, and what would unlock it. */
function HoleRow({ entry, unlock }) {
  return (
    <li className="rounded-xl border border-rule/50 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <RuleId id={entry.ruleId} />
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-navy">
          {entry.title ?? entry.ruleId}
        </span>
        <ReasonChip reason={entry.reason} />
      </div>

      {/* The blocking signal, NAMED. Never "insufficient data". */}
      {entry.blockingSignalKey ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          <span className="font-semibold text-navy">
            {entry.blockingSignalLabel ?? entry.blockingSignalKey}
          </span>
          <span className="ml-1.5 font-mono text-[10.5px]">{entry.blockingSignalKey}</span>
          {entry.message ? <> — {entry.message}</> : null}
        </p>
      ) : entry.message ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{entry.message}</p>
      ) : null}

      {/* The unlock, verbatim. It is the only sentence on this page that is allowed
          to be about what we would build, and it says what we refuse to proxy. */}
      {unlock ? (
        <div className="mt-2 rounded-lg border border-[#F59E0B]/30 bg-amber-50/70 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
            <KeyRound size={12} aria-hidden />
            What would unlock it
          </p>
          <p className="mt-1 text-[12.5px] font-semibold leading-snug text-navy">{unlock.intake}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{unlock.copy}</p>
        </div>
      ) : null}
    </li>
  )
}

export default function NamedHolesPanel({
  /** coverage.namedHoles — the four permanent holes, with their frozen copy. */
  namedHoles = [],
  /** The whole notEvaluated array — the source of each rule's title and blocker. */
  notEvaluated = [],
  loading = false,
}) {
  if (loading && namedHoles.length === 0 && notEvaluated.length === 0) {
    return (
      <section className="rounded-2xl border border-rule/50 bg-white p-4">
        <div className="h-24 rounded-xl bg-section motion-safe:animate-pulse" aria-hidden />
      </section>
    )
  }

  const byRuleId = new Map(notEvaluated.map((n) => [n.ruleId, n]))
  const holeIds = new Set(namedHoles.map((h) => h.ruleId))

  // The four permanent holes, joined to their live notEvaluated row so the panel
  // shows both the frozen unlock copy and the blocking signal by name.
  const holes = namedHoles.map((h) => ({
    entry: byRuleId.get(h.ruleId) ?? { ruleId: h.ruleId, reason: 'signal_not_tracked' },
    unlock: { intake: h.intake, copy: h.copy },
  }))

  // Everything else we could not evaluate on this run — the school's live state.
  const others = notEvaluated
    .filter((n) => !holeIds.has(n.ruleId))
    .map((n) => ({ entry: n, unlock: n.unlock ?? null }))

  if (holes.length === 0 && others.length === 0) {
    return (
      <section className="rounded-2xl border border-rule/50 bg-white p-4">
        <h3 className="font-serif text-[16px] font-semibold text-navy">
          What we cannot answer
        </h3>
        <p className="mt-1 text-[12.5px] text-muted">
          Every rule in the catalog was evaluated on this run.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-rule/50 bg-white p-4">
      <h3 className="flex items-center gap-1.5 font-serif text-[16px] font-semibold text-navy">
        <ScanSearch size={15} style={{ color: AMBER }} aria-hidden />
        What we cannot answer
      </h3>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
        A rule we could not evaluate is not a pass and not a fail. Each one below names the signal
        that blocked it, so you know exactly what a visiting team will ask that we cannot answer for
        you today.
      </p>

      {holes.length ? (
        <>
          <h4 className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            Known holes — these will not fire for any school today
          </h4>
          <ul className="mt-2 space-y-2">
            {holes.map((h) => (
              <HoleRow key={h.entry.ruleId} entry={h.entry} unlock={h.unlock} />
            ))}
          </ul>
        </>
      ) : null}

      {others.length ? (
        <>
          <h4 className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            Blocked on this run
          </h4>
          <ul className="mt-2 space-y-2">
            {others.map((o) => (
              <HoleRow key={o.entry.ruleId} entry={o.entry} unlock={o.unlock} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
