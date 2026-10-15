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
//
// PREMIUM UI P4 (a2): each standard code is a sub-rule (code tag + hairline),
// its findings are ruled rows on the ground, severity / likelihood / "already
// being worked" are ledger Pills, and the consequence is a ruled note.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleCheck, Landmark } from 'lucide-react'
import FindingBasisChain from './FindingBasisChain.jsx'
import { SEVERITY_LABEL, SEVERITY_TONE } from '../ruleActions.js'
import { Pill } from '../../ui/surface/index.js'
import '../../../styles/pending/a2-carry.css'

const SEVERITY_BADGE = {
  critical: { label: SEVERITY_LABEL.critical, tone: SEVERITY_TONE.critical },
  warn: { label: SEVERITY_LABEL.warn, tone: SEVERITY_TONE.warn },
  info: { label: SEVERITY_LABEL.info, tone: SEVERITY_TONE.info },
}

/**
 * The likelihood chip. The word, capitalised for the sentence position it sits in
 * — and that capitalisation is the ONLY transform this file applies to any
 * server string. It carries no digit and no percent sign, and a spec asserts it.
 */
function LikelihoodChip({ likelihood }) {
  if (!likelihood) return null
  return (
    <Pill data-testid="likelihood" className="capitalize">
      {likelihood}
    </Pill>
  )
}

function FindingCard({ finding, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const sev = SEVERITY_BADGE[finding?.severity] ?? SEVERITY_BADGE.info
  const alsoServes = Array.isArray(finding?.alsoServes) ? finding.alsoServes : []
  const basis = Array.isArray(finding?.basis) ? finding.basis : []
  return (
    <li data-testid="visit-finding">
      <div className="flex flex-wrap items-center gap-2">
        <Pill variant="status" tone={sev.tone}>
          {sev.label}
        </Pill>
        <LikelihoodChip likelihood={finding?.likelihood} />
        {alsoServes.map((code) => (
          <span key={code} className="a2-code" title="This finding also touches this standard">
            {code}
          </span>
        ))}
        <span className="flex-1" />
        {/* Phase G back-link: this gap already has an owner and a date. */}
        {finding?.worked ? (
          <Pill variant="status" tone="good" data-testid="worked">
            <CircleCheck size={11} aria-hidden /> already being worked
          </Pill>
        ) : null}
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{finding?.title}</p>
      <p className="mt-1 text-small leading-relaxed text-ink2">{finding?.rationale}</p>
      {finding?.consequence ? (
        <p className="a2-note mt-2" data-tone={sev.tone}>
          {finding.consequence}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="dt-link mt-2.5 text-[12px]"
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
    <section data-testid="finding-group">
      <h3 className="sec-head !mb-1">
        {Icon ? <Icon size={14} className="shrink-0 text-ink2" aria-hidden /> : null}
        <span data-testid="group-code" className="text-[13px] font-semibold tracking-[0.02em] text-ink">
          {code}
        </span>
        <span className="sec-rule" aria-hidden="true" />
      </h3>
      {/* The school-level note is the server's frozen sentence, verbatim. */}
      {note ? <p className="mb-1 text-small leading-relaxed text-ink2">{note}</p> : null}
      <ul className="a2-rows a2-rows-open">
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
      <p className="a2-empty">
        No rule fired against your register on this run. Act 5 below names every rule that could
        not be evaluated — a rule we could not run is not a rule that passed.
      </p>
    )
  }

  return (
    <div className="space-y-6">
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
