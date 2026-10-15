// ─────────────────────────────────────────────────────────────────────────────
// ShortReason — a few words in the cell, the full sentence one tap away.
//
// The domain tables carried the server's whole "why this is not scored"
// sentence in every unmeasured cell, which at phone width became a wall of text
// in a narrow, sideways-scrolling column. The cell now shows a SHORT status
// (built from the row's own structured fields — counts and flags, never a
// re-wording of the server's sentence) and the server's sentence stays,
// VERBATIM, inside a native disclosure: the short text is the <summary>, so a
// tap / Enter / screen reader opens it. Same pattern as RiskChip's "Not scored".
//
// The honesty rule is unchanged: no number is invented for an unmeasured row,
// and the reason the server gave is still rendered word for word — it is only
// folded, never dropped or reworded.
// ─────────────────────────────────────────────────────────────────────────────
import { ChevronDown } from 'lucide-react'

export default function ShortReason({ short, full, className = '' }) {
  if (!full || full === short) {
    return <span className={`block whitespace-normal text-[12px] leading-snug text-ink2 ${className}`}>{short}</span>
  }
  return (
    <details className={`group block max-w-[36ch] text-left ${className}`}>
      <summary
        title={full}
        aria-label={`${short} — ${full}`}
        className="inline-flex cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-[var(--r-ctl)] text-[12px] leading-snug text-ink2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-[#2563eb]/50 [&::-webkit-details-marker]:hidden"
      >
        {short}
        <ChevronDown size={11} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-1 whitespace-normal text-[11.5px] leading-snug text-ink2">{full}</p>
    </details>
  )
}
