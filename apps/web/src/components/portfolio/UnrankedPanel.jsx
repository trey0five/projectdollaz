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
import { Link } from 'react-router-dom'
import { HelpCircle, Lock } from 'lucide-react'
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

// ── One not-ranked school ────────────────────────────────────────────────────
function InsufficientRow({ row }) {
  const missing = Array.isArray(row?.missingComponents) ? row.missingComponents : []
  const known = Array.isArray(row?.knownComponents) ? row.knownComponents : []
  return (
    <li className="rounded-xl border border-rule/70 bg-section px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-semibold text-navy">{row?.name ?? 'Unnamed school'}</span>
        <span className="inline-flex items-center rounded-md border border-rule/70 bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          Not ranked
        </span>
      </div>

      <p className="mt-1 text-[13px] leading-snug text-muted">
        {EXCLUSION_REASON_LABELS[row?.reason] ?? 'This school cannot be ranked from what we hold.'}
      </p>

      {/* The missing measures, BY NAME — the entire point of the panel. */}
      <ul className="mt-2 space-y-1">
        {missing.map((m, i) => (
          <li key={`${m?.component ?? 'missing'}-${i}`} className="flex flex-wrap gap-x-1.5 text-[12.5px]">
            <span className="font-semibold text-navy">{componentLabel(m?.component)}</span>
            <span className="text-muted">— {missingReasonText(m?.reason) ?? 'reason not stated'}</span>
          </li>
        ))}
        {missing.length === 0 && (
          <li role="alert" className="text-[12.5px] font-semibold text-danger">
            The server named no missing measure for this school — report this row.
          </li>
        )}
      </ul>

      {known.length > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          Measured here: {known.map(componentLabel).join(' · ')}
        </p>
      )}
    </li>
  )
}

// ── One unlicensed school: the NAME, and nothing else ────────────────────────
function NotLicensedRow({ row }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rule/70 bg-section px-4 py-3">
      <Lock size={14} aria-hidden className="shrink-0 text-muted" />
      <span className="font-semibold text-navy">{row?.name ?? 'Unnamed school'}</span>
      <span className="text-[12.5px] text-muted">Accreditation is not licensed at this school.</span>
    </li>
  )
}

export default function UnrankedPanel({ insufficientData = [], notLicensed = [] }) {
  const insufficient = Array.isArray(insufficientData) ? insufficientData : []
  const unlicensed = Array.isArray(notLicensed) ? notLicensed : []
  if (insufficient.length === 0 && unlicensed.length === 0) return null

  return (
    <div className="space-y-5">
      {insufficient.length > 0 && (
        <section aria-labelledby="portfolio-unranked" className="card-soft px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-section text-muted">
              <HelpCircle size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="portfolio-unranked" className="font-serif text-[17px] font-semibold text-navy">
                Not ranked — {insufficient.length}{' '}
                {insufficient.length === 1 ? 'school' : 'schools'}
              </h2>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                These schools are missing too much for a rank to mean anything. They are not at the
                bottom of the list and they are not at the top of it — they are off it, with what is
                missing named below. Fill the gap and they rank next refresh.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {insufficient.map((row) => (
              <InsufficientRow key={row?.schoolId ?? row?.name} row={row} />
            ))}
          </ul>
        </section>
      )}

      {unlicensed.length > 0 && (
        <section aria-labelledby="portfolio-unlicensed" className="card-soft px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-section text-muted">
              <Lock size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2
                id="portfolio-unlicensed"
                className="font-serif text-[17px] font-semibold text-navy"
              >
                Not licensed — {unlicensed.length} {unlicensed.length === 1 ? 'school' : 'schools'}
              </h2>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                Accreditation is not licensed at these schools, so nothing about their readiness is
                shown here — not even a band. Adding the module brings them into the portfolio.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
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
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Accreditation is licensed <span className="font-semibold">per school</span>, so it has
            to be added at each school named above. The billing page for the school you are
            currently in cannot change them — the per-school module grid is the{' '}
            <span className="font-semibold">Modules</span> tab of the organization view.
          </p>
          <Link
            to="/app"
            className="mt-3 inline-flex min-h-[40px] items-center rounded-lg border-2 border-hair px-3.5 text-[13.5px] font-semibold text-navy transition hover:border-gold"
          >
            Open the organization view
          </Link>
        </section>
      )}
    </div>
  )
}
