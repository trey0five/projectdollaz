// ─────────────────────────────────────────────────────────────────────────────
// FindingBasisChain — ACCEPTANCE 1, rendered.
//
// "Every finding card renders ≥1 basis with an observed value and date, and every
// basis deep-links." This component is that sentence in JSX, and it is the reason
// a Mock Visit finding is arguable rather than assertive: a head of school can
// click any row and land on the register the number came from.
//
// WHAT IT RENDERS PER ROW, AND NOTHING ELSE:
//   · `label`   — the server's name for the reading;
//   · `display` — THE SERVER'S RENDERED STRING. Never `value` re-formatted here.
//                 Every numeral in a rationale comes from one of these, so a
//                 second formatter would let the chain and the sentence above it
//                 quote the same reading differently.
//   · `asOf`    — the observation date, or the frozen "no date recorded" note. An
//                 undated reading is a fact about the reading and is shown as one;
//                 it is never back-filled with today. It is FORMATTED through the
//                 shared `fmtDay` the print pages use, because the screen and the
//                 paper printing "2026-06-30" and "Jun 30, 2026" for one reading is
//                 two answers to "when did we observe this".
//   · a LINK, from `basisHref` — destinations only, no composed statement.
//
// AN EMPTY CHAIN IS A BUG, NOT A FINDING. The engine has never produced one and
// the composer's test asserts `basis.length >= 1` for every finding. This
// component therefore does NOT silently render nothing when handed an empty
// array: it says the basis is missing, loudly, because a finding card with no
// basis is exactly the thing this product must never ship quietly.
//
// NO PERCENTAGE IS INTRODUCED HERE, because no string is introduced here
// (acceptance 2). A `display` that legitimately contains a percent sign — an
// operating margin, say — is the server's own rendering of a measured value and
// is not this file adding one.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { ArrowUpRight, AlertOctagon } from 'lucide-react'
import { basisHref, basisIsRouted } from '../basisLinks.js'
import { fmtDay } from '../visitDates.js'

/** Frozen. An undated reading says so; it is never given today's date. */
export const NO_DATE_NOTE = 'no date recorded'

/** Frozen. Shown only in the state the composer's spec says cannot occur. */
export const MISSING_BASIS_NOTE =
  'This finding arrived with no basis chain. That is a defect in the engine, not a finding about your school — please report it.'

function BasisRow({ entry }) {
  const href = basisHref(entry)
  const routed = basisIsRouted(entry)
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-rule/50 bg-cream/40 px-2.5 py-1.5">
      <span className="text-[12px] font-semibold text-navy">{entry?.label}</span>
      <span className="font-mono text-[12.5px] text-navy" data-testid="basis-display">
        {entry?.display}
      </span>
      <span className="text-[11.5px] text-muted" data-testid="basis-asof">
        {entry?.asOf ? fmtDay(entry.asOf) : NO_DATE_NOTE}
      </span>
      <span className="flex-1" />
      <Link
        to={href}
        data-testid="basis-link"
        className="inline-flex items-center gap-1 rounded-md border border-rule/60 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-navy transition hover:border-navy/40"
      >
        {routed ? 'Open the register' : 'Where we looked'}
        <ArrowUpRight size={11} aria-hidden />
      </Link>
    </li>
  )
}

export default function FindingBasisChain({ basis = [] }) {
  const rows = Array.isArray(basis) ? basis : []
  if (rows.length === 0) {
    return (
      <p
        data-testid="basis-missing"
        className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-[12px] leading-relaxed text-danger"
      >
        <AlertOctagon size={14} className="mt-[1px] shrink-0" aria-hidden />
        <span>{MISSING_BASIS_NOTE}</span>
      </p>
    )
  }
  return (
    <ul className="space-y-1.5" data-testid="basis-chain">
      {rows.map((entry, i) => (
        <BasisRow key={entry?.key ? `${entry.key}-${i}` : `basis-${i}`} entry={entry} />
      ))}
    </ul>
  )
}
