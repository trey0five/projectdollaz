// ─────────────────────────────────────────────────────────────────────────────
// ACT 5 — "What we could not answer." THIS ACT MUST NOT BE CUT.
//
// It will be proposed for cutting in review, every time, because it is the only
// act that makes the product look smaller. It is what makes Acts 3 and 6
// believable: a findings list with no stated blind spots reads as "we looked
// everywhere", and a school that believes that walks into a visit unprepared for
// the question nobody warned them about. Every unmeasured domain on this act is
// also a module or an intake we can sell, so the act that looks like an admission
// is the act that carries the roadmap.
//
// FOUR HARD CONSTRAINTS, ALL SPEC-CHECKED (acceptance 6):
//   · It renders OPEN. There is no <details>, no tab, no "show more", no
//     `defaultCollapsed` prop, and no prop that could hide a section.
//   · The 36-row signal roster is rendered IN FULL. No `.slice()`, no "and N
//     more", no cap. A truncated roster is a roster that hides the row a visiting
//     team will ask about.
//   · A row that is not available and carries NO reason renders the frozen
//     fallback sentence. It never renders blank, because a blank cell reads as
//     "fine".
//   · Every sentence is the server's. The `unavailableReason` is the signal's own
//     wording, the named-hole `copy` is frozen server-side, the not-evaluated
//     `message` and `unlock` are the engine's. This file composes the section
//     headings and nothing else.
//
// THREE SOURCES, ALL EXISTING: `coverage.namedHoles` (the four permanent holes,
// each with the intake that closes it), the 36-row roster partitioned by
// availability, and `notEvaluated` (the rules that could not run, each naming its
// blocking signal). Plus the module upsell and the years-unlock ask, both carried
// through exactly as the twin emits them — `unlockableByYears` names ONE signal,
// EVERY year it needs and ONLY the rules that read it, and re-aggregating it here
// is how the ask stops being true.
//
// PREMIUM UI P4 (a2): every list is ruled rows on the ground; the partitions are
// 11px-caps sub-rules with their count; "what would unlock it" is a ruled note
// with a watch mark; rule ids and signal keys are code tags. No amber washes.
// ─────────────────────────────────────────────────────────────────────────────
import { KeyRound, Layers, Radio, ScanSearch } from 'lucide-react'
import CoverageCta from '../CoverageCta.jsx'
import { fmtDay } from '../visitDates.js'
import '../../../styles/pending/a2-carry.css'

const PARTITIONS = [
  {
    key: 'available',
    label: 'Read successfully',
    hint: 'These are the readings behind everything above.',
  },
  {
    key: 'notLicensed',
    label: 'Behind a module you do not license',
    hint: 'We did not read these. An unlicensed module lowers coverage — it never lowers your score and never produces a finding.',
  },
  {
    key: 'noData',
    label: 'Nothing recorded yet',
    hint: 'The place these live exists; nothing has been entered or imported into it.',
  },
  {
    key: 'notTracked',
    label: 'Not tracked in KYRO at all',
    hint: 'There is nowhere in the product to hold these today. A visiting team will still ask.',
  },
]

/**
 * RENDER `reasonText`, NOT `unavailableReason`.
 *
 * The composer carries `unavailableReason` through verbatim — and it MAY BE NULL
 * even on a row that could not be read. `reasonText` is the field that is
 * guaranteed non-empty for every non-available row: the collector's own words, or
 * the frozen `NO_REASON_GIVEN`. Reading the raw field here is exactly how a row
 * renders blank, and a blank cell reads as "fine".
 */
function SignalRow({ row }) {
  const reason = row?.reasonText ?? null
  return (
    <li data-testid="signal-row">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-small font-semibold text-ink">{row?.label ?? row?.key}</span>
        <span className="a2-code font-mono !font-medium" title="Signal key">{row?.key}</span>
        <span className="flex-1" />
        {row?.observedOn ? (
          <span className="text-[12px] tabular-nums text-ink2">observed {fmtDay(row.observedOn)}</span>
        ) : null}
      </div>
      {reason ? (
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink2" data-testid="signal-reason">
          {reason}
        </p>
      ) : null}
    </li>
  )
}

function Partition({ label, hint, rows }) {
  const list = Array.isArray(rows) ? rows : []
  return (
    <div className="min-w-0">
      <h4 className="sec-head !mb-1">
        <span className="sec-label">
          {label} · <span className="tabular-nums">{list.length}</span>
        </span>
        <span className="sec-rule" aria-hidden="true" />
      </h4>
      <p className="text-[12px] leading-relaxed text-ink2">{hint}</p>
      {list.length > 0 ? (
        // NO SLICE. The whole partition, every run.
        <ul className="a2-rows a2-rows-tight mt-2">
          {list.map((row, i) => (
            <SignalRow key={row?.key ?? `signal-${i}`} row={row} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function NamedHole({ hole }) {
  return (
    <li data-testid="named-hole">
      <div className="flex flex-wrap items-center gap-2">
        <span className="a2-code">{hole?.ruleId}</span>
        <span className="text-[14px] font-semibold text-ink">{hole?.intake}</span>
      </div>
      <p className="mt-1 text-small leading-relaxed text-ink2">{hole?.copy}</p>
    </li>
  )
}

function NotEvaluatedRule({ rule }) {
  return (
    <li data-testid="not-evaluated">
      <div className="flex flex-wrap items-center gap-2">
        <span className="a2-code">{rule?.ruleId}</span>
        <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">
          {rule?.title ?? rule?.ruleId}
        </span>
      </div>
      {/* THE BLOCKING SIGNAL, NAMED. Never "insufficient data". */}
      {rule?.blockingSignalKey ? (
        <p className="mt-1 text-small leading-relaxed text-ink2">
          <span className="font-semibold text-ink">
            {rule?.blockingSignalLabel ?? rule.blockingSignalKey}
          </span>
          <span className="a2-code ml-1.5 font-mono !font-medium align-middle" title="Signal key">{rule.blockingSignalKey}</span>
          {rule?.message ? <> — {rule.message}</> : null}
        </p>
      ) : rule?.message ? (
        <p className="mt-1 text-small leading-relaxed text-ink2">{rule.message}</p>
      ) : null}
      {rule?.unlock ? (
        <div className="a2-note mt-2" data-tone="watch">
          <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-micro font-semibold uppercase text-ink2">
            <KeyRound size={11} aria-hidden /> What would unlock it
          </p>
          <p className="mt-0.5 text-small font-semibold leading-snug text-ink">
            {rule.unlock.intake}
          </p>
          <p className="mt-0.5 text-small leading-relaxed text-ink2">{rule.unlock.copy}</p>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export default function ActUnanswered({ unanswered = null }) {
  if (!unanswered) {
    return (
      <p className="a2-empty">
        We could not read what we could not answer. That is itself unanswered — reload, and if it
        persists the engine is degraded, not your school.
      </p>
    )
  }

  const namedHoles = Array.isArray(unanswered.namedHoles) ? unanswered.namedHoles : []
  const rules = Array.isArray(unanswered.rules) ? unanswered.rules : []
  const rows = unanswered.signalRows ?? {}
  const upsell = Array.isArray(unanswered.upsell) ? unanswered.upsell : []

  return (
    <div className="space-y-8" data-testid="act-unanswered">
      {/* The "we could value nothing at all" case, in the server's own words. */}
      {unanswered.signalsUnavailable?.message ? (
        <p className="a2-note" data-tone="watch">
          {unanswered.signalsUnavailable.message}
        </p>
      ) : null}

      {namedHoles.length > 0 ? (
        <section>
          <h3 className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-ink">
            <ScanSearch size={15} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
            Questions a visiting team asks that we cannot answer for any school today
          </h3>
          <ul className="a2-rows mt-2">
            {namedHoles.map((h, i) => (
              <NamedHole key={h?.ruleId ?? `hole-${i}`} hole={h} />
            ))}
          </ul>
        </section>
      ) : null}

      {rules.length > 0 ? (
        <section>
          <h3 className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-ink">
            <Layers size={15} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
            Rules we could not run on this register
          </h3>
          <ul className="a2-rows mt-2">
            {rules.map((r, i) => (
              <NotEvaluatedRule key={r?.ruleId ?? `rule-${i}`} rule={r} />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-ink">
          <Radio size={15} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
          Every signal we tried to read, and what happened
          {typeof unanswered.rosterCounts?.total === 'number' ? (
            <span className="font-normal tabular-nums text-ink2"> · {unanswered.rosterCounts.total} in all</span>
          ) : null}
        </h3>
        <div className="mt-3 grid gap-x-10 gap-y-6 lg:grid-cols-2">
          {PARTITIONS.map((p) => (
            <Partition key={p.key} label={p.label} hint={p.hint} rows={rows[p.key]} />
          ))}
        </div>
      </section>

      {/* The two asks, carried through exactly as the twin emits them. */}
      <CoverageCta
        coverage={{
          unlockableByYears: unanswered.unlockableByYears ?? { ruleIds: [] },
          blockedByModule: Object.fromEntries(
            upsell.map((u) => [u?.moduleKey, Array.isArray(u?.ruleIds) ? u.ruleIds : []]),
          ),
        }}
      />
    </div>
  )
}
