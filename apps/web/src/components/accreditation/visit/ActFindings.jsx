// ─────────────────────────────────────────────────────────────────────────────
// ACT 3 — "What they'd likely find." Rendered UNDER NAMED STANDARD CODES.
//
// This is the act a visiting team would recognise. It is grouped by standard code
// because that is how a team reports: not "eight risks", but "under COG-A1, here
// is what we found". The grouping and the ordering are the SERVER's (worst
// severity, then code, ASCII ascending) — this file re-sorts nothing, because two
// orderings of one list is two answers to "what is worst".
//
// THREE HONESTY RULES, ALL SPEC-CHECKED:
//
// 1. NO PERCENTAGE APPEARS ON A FINDING (acceptance 2). `likelihood` is the ORDINAL
//    WORD the engine emits — 'possible' or 'likely' — because one visit per six
//    years is not calibratable. Converting it to a number is a one-line change that
//    reads as an improvement and would be a fabricated statistic wearing the
//    engine's authority. Nothing here computes, and no numeral is introduced.
//
// 2. EVERY SENTENCE IS THE SERVER'S. `title`, `rationale` and `consequence` are
//    printed byte-identical to what `/twin` returns for the same `findingKey` —
//    the composer writes no sentence about a finding, so the Mock Visit and the
//    Signals tab cannot describe one fact two ways.
//
// 3. EVERY CARD SHOWS ITS BASIS CHAIN, EXPANDED, ON FIRST PAINT. Not the first
//    card in each group — every card. Acceptance 1 is verbatim "every finding card
//    renders ≥1 basis with an observed value and date", and a group of three
//    findings that showed the chain on one of them satisfied that for a third of
//    the act: cards two and three rendered a title, a rationale, a consequence and
//    a severity with the evidence absent from the DOM behind a collapsed button.
//    The chain IS the argument; a finding whose evidence is one click away is an
//    assertion until somebody clicks. The toggle stays, for collapsing a long act.
//
//    NOTE FOR THE SPEC: `visit-honesty.spec.jsx` clicks every
//    `button[aria-expanded="false"]` before asserting, which would have kept
//    passing had this regressed to hiding EVERY card. There is now a case that
//    asserts the chains WITHOUT clicking anything.
//
// A finding scoped to no standard is NOT dropped and NOT filed under a borrowed
// code. It goes in the school-level section under the server's frozen note, which
// says a visiting team would raise it with the head of school rather than under a
// standard code. `alsoServes` carries the other codes a finding touches, so a
// finding appears exactly once and its other standards are still visible.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleCheck, Landmark } from 'lucide-react'
import FindingBasisChain from './FindingBasisChain.jsx'

const SEVERITY_BADGE = {
  critical: { label: 'Critical', cls: 'border-danger/30 bg-danger/10 text-danger' },
  warn: { label: 'Warning', cls: 'border-[#F59E0B]/45 bg-amber-50 text-amber-800' },
  info: { label: 'Informational', cls: 'border-rule/60 bg-section text-muted' },
}

/**
 * The likelihood chip. The word, capitalised for the sentence position it sits in
 * — and that capitalisation is the ONLY transform this file applies to any
 * server string. It carries no digit and no percent sign, and a spec asserts it.
 */
function LikelihoodChip({ likelihood }) {
  if (!likelihood) return null
  return (
    <span
      data-testid="likelihood"
      className="rounded-md border border-navy/20 bg-navy/5 px-1.5 py-0.5 text-[11px] font-semibold capitalize text-navy"
    >
      {likelihood}
    </span>
  )
}

function FindingCard({ finding, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const sev = SEVERITY_BADGE[finding?.severity] ?? SEVERITY_BADGE.info
  const alsoServes = Array.isArray(finding?.alsoServes) ? finding.alsoServes : []
  const basis = Array.isArray(finding?.basis) ? finding.basis : []
  return (
    <li className="rounded-xl border border-rule/50 bg-white p-3" data-testid="visit-finding">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${sev.cls}`}>
          {sev.label}
        </span>
        <LikelihoodChip likelihood={finding?.likelihood} />
        {alsoServes.map((code) => (
          <span
            key={code}
            className="rounded-md border border-rule/60 bg-cream/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted"
            title="This finding also touches this standard"
          >
            {code}
          </span>
        ))}
        <span className="flex-1" />
        {/* Phase G back-link: this gap already has an owner and a date. */}
        {finding?.worked ? (
          <span
            data-testid="worked"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
          >
            <CircleCheck size={11} aria-hidden /> already being worked
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[14px] font-semibold leading-snug text-navy">{finding?.title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{finding?.rationale}</p>
      {finding?.consequence ? (
        <p className="mt-1.5 rounded-lg border border-dashed border-rule/60 bg-cream/50 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-navy">
          {finding.consequence}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-navy hover:underline"
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        {/* The count is the length of an array on screen, not a claim about the
            school — the one numeral this file emits, and it is self-evident. */}
        {basis.length === 1 ? 'The basis (1 reading)' : `The basis (${basis.length} readings)`}
      </button>
      {open ? (
        <div className="mt-1.5">
          <FindingBasisChain basis={basis} />
        </div>
      ) : null}
    </li>
  )
}

function Group({ code, findings, note = null, Icon = null }) {
  const list = Array.isArray(findings) ? findings : []
  return (
    <section className="rounded-2xl border border-rule/60 bg-cream/30 p-3" data-testid="finding-group">
      <h3 className="flex flex-wrap items-center gap-2">
        {Icon ? <Icon size={15} className="shrink-0 text-navy/70" aria-hidden /> : null}
        <span
          data-testid="group-code"
          className="rounded-md border border-navy/20 bg-white px-2 py-0.5 font-mono text-[12px] font-semibold text-navy"
        >
          {code}
        </span>
      </h3>
      {/* The school-level note is the server's frozen sentence, verbatim. */}
      {note ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{note}</p> : null}
      <ul className="mt-2 space-y-2">
        {list.map((f, i) => (
          /* No `defaultOpen` prop: EVERY card opens with its chain. See rule 3. */
          <FindingCard key={f?.findingKey ?? `finding-${i}`} finding={f} />
        ))}
      </ul>
    </section>
  )
}

export default function ActFindings({ findings = null, schoolLevelNote = '' }) {
  const groups = Array.isArray(findings?.groups) ? findings.groups : []
  const schoolLevel = Array.isArray(findings?.schoolLevel) ? findings.schoolLevel : []

  if (groups.length === 0 && schoolLevel.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-4 py-6 text-center text-[13px] text-muted">
        No rule fired against your register on this run. Act 5 below names every rule that could
        not be evaluated — a rule we could not run is not a rule that passed.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {groups.map((g, i) => (
        <Group
          key={g?.code ?? g?.key ?? `group-${i}`}
          code={g?.code ?? g?.key}
          findings={g?.findings}
        />
      ))}
      {schoolLevel.length > 0 ? (
        <Group
          code="Raised with the head of school"
          findings={schoolLevel}
          note={schoolLevelNote}
          Icon={Landmark}
        />
      ) : null}
    </div>
  )
}
