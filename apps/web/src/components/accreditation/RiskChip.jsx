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
// ─────────────────────────────────────────────────────────────────────────────
import { ShieldAlert } from 'lucide-react'

/**
 * The five ordinal bands, plus the "not scored" case. One vocabulary, shared with
 * DomainBandStrip so a domain and a standard can never speak two dialects of the
 * same word.
 */
export const RISK_BAND_META = Object.freeze({
  clear: {
    label: 'Clear',
    chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    dot: '#059669',
  },
  watch: {
    label: 'Watch',
    chip: 'border-[#F59E0B]/40 bg-amber-50 text-amber-700',
    dot: '#F59E0B',
  },
  elevated: {
    label: 'Elevated',
    chip: 'border-orange-300/70 bg-orange-50 text-orange-700',
    dot: '#EA580C',
  },
  high: {
    label: 'High',
    chip: 'border-danger/30 bg-danger/10 text-danger',
    dot: '#DC2626',
  },
  critical: {
    label: 'Critical',
    chip: 'border-danger/50 bg-danger/15 text-danger',
    dot: '#B91C1C',
  },
})

/** The band's tokens, or the neutral "not scored" tokens for a null band. */
export function riskBandMeta(band) {
  return (
    RISK_BAND_META[band] ?? {
      label: 'Not scored',
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
export default function RiskChip({ entry = null, size = 'md' }) {
  if (!entry) return null
  const small = size === 'sm'
  const pad = small ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-1 text-[12px]'
  const title = driverTitle(entry)

  // The assurance bypass — a standing critical, with its own glyph so it never
  // reads as "the formula said 100".
  if (entry.bypass === 'unmet_assurance') {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1.5 rounded-md border border-danger/50 bg-danger/15 font-semibold text-danger ${pad}`}
      >
        <ShieldAlert size={12} aria-hidden />
        Assurance unmet
      </span>
    )
  }

  // Not scored — and the reason REACHES A READER WITHOUT A HOVER. `title` is a
  // mouse affordance: on a touch device, and for anyone on a keyboard or a screen
  // reader, a tooltip-only reason is no reason at all — and "not scored" vs
  // "scored zero" is precisely the distinction this chip exists to make. So the
  // reason is also the accessible name, and it is printed beside the chip.
  if (entry.risk === null || entry.risk === undefined) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span
          title={title}
          aria-label={entry.reason ? `Not scored — ${entry.reason}` : 'Not scored'}
          className={`inline-flex items-center rounded-md border border-rule/60 bg-section font-semibold text-muted ${pad}`}
        >
          Not scored
        </span>
        {entry.reason ? (
          <span className="max-w-[22rem] text-[11.5px] leading-snug text-muted">{entry.reason}</span>
        ) : null}
      </span>
    )
  }

  const meta = riskBandMeta(entry.band)
  return (
    <span
      title={title}
      // The drivers are the basis of the band. Tooltip for the mouse, accessible
      // name for everyone else — never mouse-only.
      aria-label={title ? `${meta.label} — ${title.replace(/\n/g, ' ')}` : meta.label}
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold ${meta.chip} ${pad}`}
    >
      <span
        aria-hidden
        className="inline-block h-[6px] w-[6px] rounded-full"
        style={{ backgroundColor: meta.dot }}
      />
      {meta.label}
    </span>
  )
}
