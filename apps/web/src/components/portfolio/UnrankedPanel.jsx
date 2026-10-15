// ─────────────────────────────────────────────────────────────────────────────
// UnrankedPanel — AIC Phase I. THE SCHOOLS WE CANNOT HONESTLY RANK.
//
// This is the panel the whole program exists for. An unmeasured school that
// appears low on a ranked list reads as "fine"; an unmeasured school that appears
// ANYWHERE on a ranked list has been given a number nobody can defend. So the
// server refuses to rank it (`insufficientData[]`, spec §2.3) and this panel says
// so, with the missing measures NAMED, at the same visual weight as the ranked
// table.
//
// THE HARD RULES (spec §7.1, guarded by WEB-1):
//   · NO score, NO band, NO percentage, NO green state renders here — ever. There
//     is deliberately no code path in this file that can print a `%`.
//   · `confidence` is NOT rendered. It is a real number on the payload, but 0.38
//     on screen reads as a score of a school, and the honest statement is not "how
//     confident are we" — it is "these four things are missing, by name".
//   · A `notLicensed` school renders its NAME AND NOTHING ELSE (acceptance 3). No
//     readiness, no counts, no confidence, no component list — the API does not
//     even send them, and this panel must not grow a place to put them.
//
// The two lists are separate panels because they are separate facts: "we have no
// data" and "this school has not bought the module" are different problems with
// different fixes, and merging them lets a licensing gap hide inside a data gap.
// ─────────────────────────────────────────────────────────────────────────────
import { Lock } from 'lucide-react'
import { Section, DataTable, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'
import { humanizeToken } from './AttentionBandChip.jsx'

/**
 * The six component keys (`PORTFOLIO_COMPONENT_KEYS`, spec §2.1) → English.
 *
 * MIRROR — copied VERBATIM from `COMPONENT_LABELS` in
 * packages/compliance/src/portfolio-priority.ts (exported from the package
 * index). Do not "improve" a word here: the SERVER puts these same strings in
 * `drivers[].label` on every ranked row, and a second vocabulary meant a ranked
 * school showed the driver "Evidence-backed coverage" while the not-ranked panel
 * below it named the identical measure "Readiness level" — two names for one
 * thing on one page, and no way for a superintendent to connect them. The house
 * pattern for a mirror is apps/web/src/components/accreditation/evidenceMeta.js.
 *
 * apps/web does not depend on @finrep/compliance (it pulls @finrep/engine and a
 * Prisma type surface with it), so this is a copy — and PORTFOLIO-LABELS in the
 * web honesty spec pins it against the package's own table.
 */
export const COMPONENT_LABELS = Object.freeze({
  readinessLevel: 'Evidence-backed coverage',
  earlyWarning: 'Open early warnings',
  evidenceCurrency: 'Self-score above evidence',
  domainExposure: 'Weakest domain',
  improvement: 'Improvement response',
  trajectory: 'Movement since the baseline',
})

/**
 * The stated reasons a component is UNKNOWN (spec §2.2 / §2.7) → English.
 *
 * The first block is what the API ACTUALLY EMITS (portfolio.service.ts's
 * `unknownComponent(...)` calls plus the pure module's four
 * `TrajectoryUnknownReason`s and `INVALID_INPUT_REASON`). An unrecognised token
 * still renders — `missingReasonText` falls back to the humanised token — so a
 * new reason surfaces as readable English rather than disappearing, but a token
 * the server really sends deserves a real sentence.
 */
export const MISSING_REASON_LABELS = Object.freeze({
  // emitted by apps/api/src/portfolio/portfolio.service.ts
  no_readiness_snapshot: 'no readiness snapshot has been taken',
  findings_ledger_unreadable: 'the findings ledger could not be read',
  evidence_currency_not_in_force:
    'evidence currency has not been established for this school',
  no_domain_scores: 'no per-domain scores are recorded',
  improvement_registers_unreadable: 'the improvement registers could not be read',
  // emitted by @finrep/compliance (TrajectoryUnknownReason + INVALID_INPUT_REASON)
  no_latest_reading: 'there is no current reading to measure from',
  no_baseline_reading: 'no earlier reading to compare against',
  span_too_short: 'the two readings are too close together to show movement',
  comparability_break: 'the series changed basis, so movement is not comparable',
  invalid_input: 'the stored value could not be read',
  // retained aliases — older payloads and the honesty fixtures
  no_snapshot: 'no readiness snapshot has been taken',
  not_licensed: 'the accreditation module is not licensed',
  basis_exists: 'evidence currency has not been established for this school',
  read_failed: 'the underlying record could not be read',
})

/** The top-level exclusion reason (spec §2.3) → a full sentence. */
export const EXCLUSION_REASON_LABELS = Object.freeze({
  too_few_components: 'Too few measures are known to rank this school.',
  low_confidence: 'The measures we do have carry too little weight to rank this school.',
})

export function missingReasonText(reason) {
  if (!reason) return null
  return MISSING_REASON_LABELS[reason] ?? humanizeToken(reason)?.toLowerCase() ?? null
}

export function componentLabel(key) {
  return COMPONENT_LABELS[key] ?? humanizeToken(key) ?? String(key ?? '')
}

// ── The not-ranked schools as ONE table ──────────────────────────────────────
// Schools × the measures that are missing somewhere, with an em dash where a
// measure is missing. What is said the same way about every school (the
// exclusion sentence, the reason a measure is blank, what IS measured) is said
// ONCE above the table; only what differs is said per row. A missing measure is
// still named in words with its stated reason — the entire point of the panel.

const missingOf = (row) => (Array.isArray(row?.missingComponents) ? row.missingComponents : [])
const knownOf = (row) => (Array.isArray(row?.knownComponents) ? row.knownComponents : [])

/** The value every row agrees on, or undefined when any two rows differ. */
function shared(rows, fn) {
  if (rows.length === 0) return undefined
  const first = fn(rows[0])
  return rows.every((r) => fn(r) === first) ? first : undefined
}

const exclusionText = (row) =>
  EXCLUSION_REASON_LABELS[row?.reason] ?? 'This school cannot be ranked from what we hold.'

function InsufficientTable({ rows }) {
  // The measures missing at ANY school, in the server's canonical order.
  const order = Object.keys(COMPONENT_LABELS)
  const present = new Set(rows.flatMap((r) => missingOf(r).map((m) => m?.component)).filter(Boolean))
  const components = [...order.filter((k) => present.has(k)), ...[...present].filter((k) => !order.includes(k))]

  const reasonFor = (row, key) => {
    const m = missingOf(row).find((x) => x?.component === key)
    return m ? missingReasonText(m?.reason) ?? 'reason not stated' : null
  }
  // A measure whose reason is the same at every school it is missing from → said once.
  const sharedReason = {}
  for (const key of components) {
    const reasons = rows.map((r) => reasonFor(r, key)).filter((x) => x != null)
    if (reasons.length > 0 && reasons.every((x) => x === reasons[0])) sharedReason[key] = reasons[0]
  }
  const sharedExclusion = shared(rows, exclusionText)
  const sharedKnown = shared(rows, (r) => knownOf(r).map(componentLabel).join(' · '))

  const columns = [
    {
      key: 'name',
      header: 'School',
      render: (row) => (
        <div className="min-w-[12rem] py-1.5">
          <span className="font-semibold text-ink">{row?.name ?? 'Unnamed school'}</span>
          {sharedExclusion === undefined ? <span className="dt-sub mt-0.5">{exclusionText(row)}</span> : null}
          {sharedKnown === undefined && knownOf(row).length > 0 ? (
            <span className="dt-sub">Measured here: {knownOf(row).map(componentLabel).join(' · ')}</span>
          ) : null}
          {missingOf(row).length === 0 ? (
            <span role="alert" className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <i className="mark tone-risk" aria-hidden="true" />
              The server named no missing measure for this school — report this row.
            </span>
          ) : null}
        </div>
      ),
    },
    ...components.map((key) => ({
      key: `m-${key}`,
      header: componentLabel(key),
      render: (row) => {
        const reason = reasonFor(row, key)
        if (reason == null) return <span className="sr-only">Not missing</span>
        return (
          <span title={reason}>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Missing: {reason}</span>
            {sharedReason[key] === undefined ? <span className="dt-sub">{reason}</span> : null}
          </span>
        )
      },
    })),
  ]

  const sharedReasons = components.filter((k) => sharedReason[k] !== undefined)
  return (
    <>
      {sharedExclusion !== undefined ? (
        <p className="mt-2 max-w-prose text-[13px] font-semibold leading-snug text-ink">{sharedExclusion}</p>
      ) : null}
      {sharedReasons.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {sharedReasons.map((k) => (
            <li key={k} className="flex flex-wrap gap-x-1.5 text-[12.5px] leading-snug">
              <span className="font-semibold text-ink">{componentLabel(k)}</span>
              <span className="text-ink2">— {sharedReason[k]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {sharedKnown ? <p className="sec-note">Measured here: {sharedKnown}</p> : null}
      <DataTable
        caption="Schools that cannot be ranked, and the measures each is missing"
        columns={columns}
        rows={rows}
        rowKey={(row, i) => row?.schoolId ?? row?.name ?? i}
        className="mt-3"
      />
    </>
  )
}

// ── One unlicensed school: the NAME, and nothing else ────────────────────────
function NotLicensedRow({ row }) {
  return (
    <li className="b1-row">
      <Lock size={14} aria-hidden className="shrink-0 text-ink2" />
      <span className="font-semibold text-ink">{row?.name ?? 'Unnamed school'}</span>
      <span className="text-[12.5px] text-ink2">Accreditation is not licensed at this school.</span>
    </li>
  )
}

export default function UnrankedPanel({ insufficientData = [], notLicensed = [] }) {
  const insufficient = Array.isArray(insufficientData) ? insufficientData : []
  const unlicensed = Array.isArray(notLicensed) ? notLicensed : []
  if (insufficient.length === 0 && unlicensed.length === 0) return null

  return (
    <div>
      {insufficient.length > 0 && (
        <Section
          aria-labelledby="portfolio-unranked"
          label={
            <span id="portfolio-unranked">
              Not ranked · {insufficient.length} {insufficient.length === 1 ? 'school' : 'schools'}
            </span>
          }
        >
          <p className="max-w-prose text-[13.5px] leading-relaxed text-ink2">
            These schools are missing too much for a rank to mean anything. They are not at the
            bottom of the list and they are not at the top of it — they are off it, with what is
            missing named below — a dash marks each measure we do not have. Fill the gap and they
            rank next refresh.
          </p>
          <InsufficientTable rows={insufficient} />
        </Section>
      )}

      {unlicensed.length > 0 && (
        <Section
          aria-labelledby="portfolio-unlicensed"
          label={
            <span id="portfolio-unlicensed">
              Not licensed · {unlicensed.length} {unlicensed.length === 1 ? 'school' : 'schools'}
            </span>
          }
        >
          <p className="max-w-prose text-[13.5px] leading-relaxed text-ink2">
            Accreditation is not licensed at these schools, so nothing about their readiness is
            shown here — not even a band. Adding the module brings them into the portfolio.
          </p>
          <ul className="b1-list mt-3">
            {unlicensed.map((row) => (
              <NotLicensedRow key={row?.schoolId ?? row?.name} row={row} />
            ))}
          </ul>
          {/* ── THE CONTROL HAS TO REACH THE SCHOOLS THIS PANEL JUST NAMED ─────
              /settings/billing is bound to the ACTIVE school — which, to be
              reading this page at all, already licenses accreditation. Sending a
              superintendent there to unlock St. Bede lands them on a page where
              accreditation is already ticked and no control touches St. Bede: a
              functional dead end wearing the words of a fix. Licensing is
              per-school, and the per-school × per-module grid is the Modules tab
              of the organization view, so that is what is named and linked. */}
          <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-ink2">
            Accreditation is licensed <span className="font-semibold">per school</span>, so it has
            to be added at each school named above. The billing page for the school you are
            currently in cannot change them — the per-school module grid is the{' '}
            <span className="font-semibold">Modules</span> tab of the organization view.
          </p>
          <Button to="/app" className="mt-3">
            Open the organization view
          </Button>
        </Section>
      )}
    </div>
  )
}
