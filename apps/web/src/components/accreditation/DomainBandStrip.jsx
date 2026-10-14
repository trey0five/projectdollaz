// ─────────────────────────────────────────────────────────────────────────────
// DomainBandStrip — Phase E: ten ORDINAL early-warning bands, above the Phase-B
// rubric table it must never be confused with.
//
// PREMIUM UI P4: a `DataTable` (Domain · Band · Facts · Signals read · action)
// under its own `Section` label, on the ground. One row per domain, the band as
// a 2px mark + the WORD, the counted facts as text — no cards, no percentages.
//
// TWO TABLES, TWO QUESTIONS, DELIBERATELY STACKED AND NEVER BLENDED:
//   · this strip — what the OPERATING DATA is warning about in each domain, as an
//     ordinal band counted over DISTINCT FACTS (not findings: one plan end date
//     that fires two rules darkens one domain once);
//   · DomainGrid below — what your accreditor's standards say, from your own
//     rubric scoring and evidence.
// A single merged score would erase exactly the distinction a head of school
// needs: "we are well scored here and the numbers underneath are moving against
// us" is a real, common and important state.
//
// THE HONESTY RULE, ENFORCED HERE:
//   · `band === null` means NOT MEASURED. The row renders NO band word, NO
//     colour, NO zero and NO empty figure — it renders the server's `reason`
//     verbatim. Grey with a reason, never grey with a number.
//   · No percentage appears anywhere in this component. There is no external band
//     for a domain risk percentage, and inventing one would be the same error the
//     Phase-B table refuses to make.
//   · Fact counts ARE rendered, because they are counted facts rather than a
//     derived score, and they are the only way a reader can tell an 'elevated'
//     built from four warnings from one built from a single critical.
//
// LABELS COME FROM THE SERVER. `labels` is built by the page from the readiness
// payload's `domains[].label` — the same vocabulary DomainGrid prints — so this
// strip can never drift into a second set of domain names. An unknown key falls
// back to the key itself rather than a guessed English word.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { ShieldQuestion, ArrowRight } from 'lucide-react'
import { domainIcon } from './domainMeta.js'
import { riskBandMeta } from './RiskChip.jsx'
import { DemoChip } from './ReadinessTrendStrip.jsx'
import { DataTable, Section } from '../ui/surface/index.js'

/** The glyph, read off props (the house workaround for the render-resolved-component lint). */
function DomainGlyph(props) {
  const Icon = props.icon
  return <Icon size={14} className={props.className} aria-hidden />
}

/** The band word → the 2px mark's tone. Ordinal, never a number. */
const BAND_TONE = { clear: 'good', watch: 'watch', elevated: 'watch', high: 'risk', critical: 'risk' }

/** "1 critical · 2 warnings" — counted facts, never a score. */
function factSummary(facts) {
  if (!facts) return null
  const parts = []
  if (facts.critical > 0) parts.push(`${facts.critical} critical`)
  if (facts.warn > 0) parts.push(`${facts.warn} warning${facts.warn === 1 ? '' : 's'}`)
  if (facts.info > 0) parts.push(`${facts.info} note${facts.info === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : null
}

const measuredOf = (band) => band.band !== null && band.band !== undefined

export default function DomainBandStrip({
  domainBands = [],
  labels = null,
  loading = false,
  error = '',
  notLicensed = false,
  /** The twin payload's own provenance flag — same chip the readiness strip uses. */
  demoData = false,
  /** (band) => void — opens the resolution panel for that domain. Optional. */
  onOpenDomain = null,
}) {
  const onOpen = onOpenDomain
  const columns = useMemo(
    () => [
      {
        key: 'domainKey',
        header: 'Domain',
        // The domain name WRAPS and hyphenates — a cell, never a stub.
        render: (band) => (
          <span className="flex min-w-0 items-start gap-2">
            <span className="mt-[2px] shrink-0 text-ink2">
              <DomainGlyph icon={domainIcon(band.domainKey)} />
            </span>
            <span className="min-w-0 hyphens-auto whitespace-normal break-words font-semibold text-ink">
              {labels?.[band.domainKey] ?? band.domainKey}
            </span>
          </span>
        ),
      },
      {
        key: 'band',
        header: 'Band',
        render: (band) =>
          measuredOf(band) ? (
            <span className="text-ink">{riskBandMeta(band.band).label}</span>
          ) : (
            // NOT MEASURED. No band word, no colour, no number — the server's reason
            // and nothing else. This is the whole point of the null case.
            <span className="block max-w-[32ch] whitespace-normal text-[12px] leading-snug text-ink2">{band.reason}</span>
          ),
      },
      {
        key: 'facts',
        header: 'Facts',
        // Counted facts, so a reader can see what the band is made of. A green
        // 'Clear' resting on two readable signals and one resting on nine are
        // different claims, and the reader is entitled to tell them apart.
        render: (band) =>
          measuredOf(band) ? <span className="text-ink2">{factSummary(band.facts) ?? 'No open fact in this domain.'}</span> : null,
      },
      {
        key: 'availableSignalCount',
        header: 'Signals read',
        num: true,
        render: (band) =>
          measuredOf(band) && typeof band.availableSignalCount === 'number' ? (
            <span className="text-ink2">{band.availableSignalCount}</span>
          ) : null,
      },
      {
        key: 'action',
        header: '',
        num: true,
        render: (band) => {
          const measured = measuredOf(band)
          // CLICKABLE ONLY WHERE THERE IS SOMETHING TO OPEN. A domain with no open fact
          // has nothing to resolve, and an unmeasured one has nothing to show at all —
          // making those look interactive would teach the reader that the affordance
          // means nothing.
          const openable = !!onOpen && measured && (band.facts?.critical > 0 || band.facts?.warn > 0)
          return openable ? (
            <button type="button" onClick={() => onOpen(band)} className="dt-link dt-actions">
              What to do <ArrowRight size={12} aria-hidden />
            </button>
          ) : null
        },
      },
    ],
    [labels, onOpen],
  )

  // Degraded states never blank the rubric table below — one honest line and move on.
  if (loading && domainBands.length === 0) {
    return (
      <Section label="Early-warning bands by domain">
        <div className="h-[76px] rounded bg-ink/[.04] motion-safe:animate-pulse" aria-hidden />
      </Section>
    )
  }

  if (notLicensed || (domainBands.length === 0 && (error || !loading))) {
    return (
      <Section label="Early-warning bands by domain">
        <p className="flex items-center gap-2 border-y border-hair py-3 text-small text-ink2">
          <ShieldQuestion size={14} aria-hidden />
          {error || 'No early-warning bands have been computed for this school yet.'}
        </p>
      </Section>
    )
  }

  return (
    <Section
      label={
        <span className="inline-flex items-center gap-2">
          Early-warning bands by domain
          {demoData ? <DemoChip /> : null}
        </span>
      }
      aside="Ordinal, counted over distinct facts — never a score, never a percentage."
    >
      <DataTable
        columns={columns}
        rows={domainBands}
        rowKey="domainKey"
        // The band's tone as the 2px mark; the WORD is in the Band cell.
        markOf={(band) => (measuredOf(band) ? (BAND_TONE[band.band] ?? 'neutral') : null)}
        rowClassName={(band) => (measuredOf(band) ? '' : 'opacity-70')}
        caption="Early-warning bands by domain"
        // A phone scrolls the table inside its wrap (with the fade) rather than
        // shattering the reason sentences into one-word lines.
        style={{ minWidth: 640 }}
      />
      <p className="sec-note">
        These bands answer &ldquo;what are the operating numbers warning about here?&rdquo;. The
        rubric table below answers &ldquo;what do your accreditor&apos;s standards say?&rdquo;. They
        are different questions and are never blended into one figure.
      </p>
    </Section>
  )
}
