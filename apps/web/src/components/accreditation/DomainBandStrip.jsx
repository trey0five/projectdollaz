// ─────────────────────────────────────────────────────────────────────────────
// DomainBandStrip — Phase E: ten ORDINAL early-warning bands, above the Phase-B
// rubric grid it must never be confused with.
//
// TWO GRIDS, TWO QUESTIONS, DELIBERATELY STACKED AND NEVER BLENDED:
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
//   · `band === null` means NOT MEASURED. The card renders NO band word, NO
//     colour, NO zero and NO empty meter — it renders the server's `reason`
//     verbatim. Grey with a reason, never grey with a number.
//   · No percentage appears anywhere in this component. There is no external band
//     for a domain risk percentage, and inventing one would be the same error the
//     Phase-B grid refuses to make.
//   · Fact counts ARE rendered, because they are counted facts rather than a
//     derived score, and they are the only way a reader can tell an 'elevated'
//     built from four warnings from one built from a single critical.
//
// LABELS COME FROM THE SERVER. `labels` is built by the page from the readiness
// payload's `domains[].label` — the same vocabulary DomainGrid prints — so this
// strip can never drift into a second set of domain names. An unknown key falls
// back to the key itself rather than a guessed English word.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldQuestion, ArrowRight } from 'lucide-react'
import { domainIcon, domainHue } from './domainMeta.js'
import { riskBandMeta } from './RiskChip.jsx'
import { DemoChip } from './ReadinessTrendStrip.jsx'

const AMBER = '#F59E0B'

/** The glyph, read off props (the house workaround for the render-resolved-component lint). */
function DomainGlyph(props) {
  const Icon = props.icon
  return <Icon size={14} className={props.className} style={props.style} aria-hidden />
}

/** "1 critical · 2 warnings" — counted facts, never a score. */
function factSummary(facts) {
  if (!facts) return null
  const parts = []
  if (facts.critical > 0) parts.push(`${facts.critical} critical`)
  if (facts.warn > 0) parts.push(`${facts.warn} warning${facts.warn === 1 ? '' : 's'}`)
  if (facts.info > 0) parts.push(`${facts.info} note${facts.info === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : null
}

function BandCard({ band, label, index, reduce, onOpen }) {
  const measured = band.band !== null && band.band !== undefined
  const meta = riskBandMeta(band.band)
  const Icon = domainIcon(band.domainKey)
  const hue = domainHue(band.domainKey)
  const summary = measured ? factSummary(band.facts) : null
  // CLICKABLE ONLY WHERE THERE IS SOMETHING TO OPEN. A domain with no open fact
  // has nothing to resolve, and an unmeasured one has nothing to show at all —
  // making those look interactive would teach the reader that the affordance
  // means nothing.
  const openable = !!onOpen && measured && (band.facts?.critical > 0 || band.facts?.warn > 0)

  const body = (
    <>
      {/* The band strip is a 5-up grid: at 1280 each cell gave the label ~53px,
          so every domain rendered as a stub ("MISSI…", "GOVE…", "ACAD…") and the
          strip named nothing. The label WRAPS instead (card contract §5.3 — a
          card title is never truncated; prefer wrapping over shrinking). */}
      <p className="flex items-start gap-1.5 text-[11.5px] font-semibold uppercase leading-snug tracking-[0.08em] text-muted">
        <DomainGlyph icon={Icon} className="mt-px shrink-0" style={{ color: hue }} />
        <span className="min-w-0 hyphens-auto break-words">{label}</span>
      </p>

      {measured ? (
        <>
          <span
            className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${meta.chip}`}
          >
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: meta.dot }}
            />
            {meta.label}
          </span>
          {/* Counted facts, so a reader can see what the band is made of — and
              how many signals the engine actually read to get there. A green
              'Clear' resting on two readable signals and one resting on nine are
              different claims, and the reader is entitled to tell them apart. */}
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {summary ?? 'No open fact in this domain.'}
            {typeof band.availableSignalCount === 'number'
              ? ` · ${band.availableSignalCount} signal${band.availableSignalCount === 1 ? '' : 's'} read`
              : ''}
          </p>
        </>
      ) : (
        // NOT MEASURED. No band word, no colour, no number — the server's reason
        // and nothing else. This is the whole point of the null case.
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{band.reason}</p>
      )}
      {openable ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy">
          What to do <ArrowRight size={11} aria-hidden />
        </span>
      ) : null}
    </>
  )

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : Math.min(index, 9) * 0.025 }}
      // The domain's own hue as a left rail — identity, not status. See
      // DOMAIN_HUE's note on why the two colour languages stay apart.
      style={measured ? { borderLeftColor: hue, borderLeftWidth: 3 } : undefined}
      className={`overflow-hidden rounded-xl border p-3 ${
        measured ? 'border-rule/60 bg-white' : 'border-dashed border-rule/60 bg-cream/50'
      }`}
    >
      {openable ? (
        <button
          type="button"
          onClick={() => onOpen(band)}
          className="w-full rounded-lg text-left transition hover:opacity-80"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </motion.li>
  )
}

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
  const reduce = useReducedMotion()

  // Degraded states never blank the rubric grid below — one honest line and move on.
  if (loading && domainBands.length === 0) {
    return (
      <div className="mb-5 rounded-2xl border border-rule/50 bg-cream/40 p-4">
        <div className="h-[76px] rounded-xl bg-white/70 motion-safe:animate-pulse" aria-hidden />
      </div>
    )
  }

  if (notLicensed || (domainBands.length === 0 && (error || !loading))) {
    return (
      <div className="mb-5 rounded-2xl border border-dashed border-rule/60 bg-cream/40 px-4 py-3">
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <ShieldQuestion size={14} style={{ color: AMBER }} aria-hidden />
          {error || 'No early-warning bands have been computed for this school yet.'}
        </p>
      </div>
    )
  }

  return (
    <section className="mb-5 rounded-2xl border border-rule/50 bg-cream/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 font-serif text-[16px] font-semibold text-navy">
          Early-warning bands by domain
          {demoData ? <DemoChip /> : null}
        </h3>
        <p className="text-[12px] text-muted">
          Ordinal, counted over distinct facts — never a score, never a percentage.
        </p>
      </div>
      {/* 5-up only once there is room for it — at 1280 a 5-up cell left the
          domain name ~53px and the whole strip read as stubs. */}
      {/* THIS STRIP SITS IN THE PAGE'S NARROW COLUMN, not the full width — at
          1280 the section is ~571px, so lg:4 gave each cell ~127px and
          `break-words` shattered "GOVERNANCE" into "GOVERNA/NCE". Stepping the
          density down keeps whole words: 3-up until 2xl, where there is room
          for 4. Fewer, readable cards beat more, broken ones. */}
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4">
        {domainBands.map((b, i) => (
          <BandCard
            key={b.domainKey}
            band={b}
            index={i}
            reduce={reduce}
            label={labels?.[b.domainKey] ?? b.domainKey}
            onOpen={onOpenDomain}
          />
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        These bands answer &ldquo;what are the operating numbers warning about here?&rdquo;. The
        rubric grid below answers &ldquo;what do your accreditor&apos;s standards say?&rdquo;. They
        are different questions and are never blended into one figure.
      </p>
    </section>
  )
}
