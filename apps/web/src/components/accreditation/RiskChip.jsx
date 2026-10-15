// ─────────────────────────────────────────────────────────────────────────────
// RiskChip — Phase E: per-standard risk as an ORDINAL BAND WORD, never a number.
//
// The engine computes `40·C + 40·T + 20·E` and returns both the number and the
// band. THIS COMPONENT RENDERS THE WORD AND NEVER THE NUMBER, on purpose: a
// two-decimal risk percentage on a standard invites a school to argue the
// decimal instead of reading the drivers, and no accreditor has ever written a
// recommendation because a number was 62.5 rather than 58. The drivers — which
// are mandatory and non-empty on EVERY entry, including the two null-risk exits —
// are what the tooltip carries, verbatim as the server composed them.
//
// THE TWO EXITS FROM THE FORMULA, both of which must read as themselves:
//   · `bypass === 'unmet_assurance'` → the standing critical chip. An assurance is
//     a binary gate; softening it into a percentage would be the exact category
//     error this phase exists to avoid.
//   · `risk === null` with no bypass → "not scored", with the server's reason.
//     A STANDARD WITH NO EVIDENCE IS NEVER RENDERED AS A ZERO. Zero reads as
//     "excellent here" on precisely the standards where we know least.
//
// A standard the engine did not score at all (absent from perStandardRisk)
// renders NOTHING — sparseness holds and the row looks exactly as it did before.
//
// PREMIUM UI P4 (a2): one shape for every band — the ledger Pill, ink text and a
// 2px semantic mark (clear → good · watch/elevated → watch · high/critical →
// risk). The tinted chip vocabulary stays on RISK_BAND_META (`chip`/`dot`) only
// for the consumers outside this slice that still read it.
// ─────────────────────────────────────────────────────────────────────────────
import { ChevronDown, ShieldAlert } from 'lucide-react'
import Pill from '../ui/surface/Pill.jsx'

/**
 * The five ordinal bands, plus the "not scored" case. One vocabulary, shared with
 * DomainBandStrip so a domain and a standard can never speak two dialects of the
 * same word. `tone` is the ledger Pill / mark tone; `chip`/`dot` are the legacy
 * tinted tokens a few out-of-slice consumers still read.
 */
export const RISK_BAND_META = Object.freeze({
  clear: {
    label: 'Clear',
    tone: 'good',
    chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    dot: '#059669',
  },
  watch: {
    label: 'Watch',
    tone: 'watch',
    chip: 'border-[#F59E0B]/40 bg-amber-50 text-amber-700',
    dot: '#F59E0B',
  },
  elevated: {
    label: 'Elevated',
    tone: 'watch',
    chip: 'border-orange-300/70 bg-orange-50 text-orange-700',
    dot: '#EA580C',
  },
  high: {
    label: 'High',
    tone: 'risk',
    chip: 'border-danger/30 bg-danger/10 text-danger',
    dot: '#DC2626',
  },
  critical: {
    label: 'Critical',
    tone: 'risk',
    chip: 'border-danger/50 bg-danger/15 text-danger',
    dot: '#B91C1C',
  },
})

/** The band's tokens, or the neutral "not scored" tokens for a null band. */
export function riskBandMeta(band) {
  return (
    RISK_BAND_META[band] ?? {
      label: 'Not scored',
      tone: 'neutral',
      chip: 'border-rule/60 bg-section text-muted',
      dot: '#94a3b8',
    }
  )
}

/** Every driver detail, joined into one tooltip. Server strings only. */
function driverTitle(entry) {
  const details = (entry?.drivers ?? []).map((d) => d.detail).filter(Boolean)
  const reason = entry?.reason ? [entry.reason] : []
  return [...reason, ...details].join('\n') || undefined
}

/**
 * @param {object|null} entry — the TwinStandardRisk row for this standard, or null
 *                              when the engine returned none (renders nothing).
 */
export default function RiskChip({ entry = null }) {
  if (!entry) return null
  const title = driverTitle(entry)

  // The assurance bypass — a standing critical, with its own glyph so it never
  // reads as "the formula said 100".
  if (entry.bypass === 'unmet_assurance') {
    return (
      <Pill variant="status" tone="risk" title={title}>
        <ShieldAlert size={11} aria-hidden />
        Assurance unmet
      </Pill>
    )
  }

  // Not scored — and the reason STILL REACHES A READER WITHOUT A HOVER, but no
  // longer as a paragraph printed into the register (it made every row of the
  // eight-column standards table ~230px tall). It is the chip's accessible name
  // and tooltip, AND a native disclosure: the Pill is the <summary>, so a tap or
  // Enter opens the server's reason under it. "Not scored" vs "scored zero" is
  // precisely the distinction this chip exists to make, and it stays one
  // keystroke away for touch, keyboard and screen reader alike.
  if (entry.risk === null || entry.risk === undefined) {
    const label = entry.reason ? `Not scored — ${entry.reason}` : 'Not scored'
    if (!entry.reason) {
      return (
        <Pill variant="status" tone="neutral" title={title} aria-label={label}>
          Not scored
        </Pill>
      )
    }
    return (
      <details className="group inline-block max-w-[16rem] align-middle">
        <summary
          title={title}
          aria-label={label}
          className="inline-flex cursor-pointer list-none items-center rounded-[var(--r-ctl)] outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/50 [&::-webkit-details-marker]:hidden"
        >
          <Pill variant="status" tone="neutral">
            Not scored
            <ChevronDown
              size={10}
              aria-hidden
              className="text-ink2 transition-transform group-open:rotate-180"
            />
          </Pill>
        </summary>
        <p className="mt-1 text-[11.5px] leading-snug text-ink2">{entry.reason}</p>
      </details>
    )
  }

  const meta = riskBandMeta(entry.band)
  return (
    <Pill
      variant="status"
      tone={meta.tone}
      title={title}
      // The drivers are the basis of the band. Tooltip for the mouse, accessible
      // name for everyone else — never mouse-only.
      aria-label={title ? `${meta.label} — ${title.replace(/\n/g, ' ')}` : meta.label}
    >
      {meta.label}
    </Pill>
  )
}
