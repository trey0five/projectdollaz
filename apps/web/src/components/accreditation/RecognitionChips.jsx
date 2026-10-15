// ─────────────────────────────────────────────────────────────────────────────
// RecognitionChips — accreditor-recognition badges (NCPSA / ICAISA), from
// `FrameworkPublic.recognitions: {code,name,line}[]`. Small, quiet chips near
// the accreditor line: the NAME is the chip, the server's `line` sentence is
// the tooltip/aria-label. Empty or absent → NOTHING renders (most frameworks,
// Cognia included, carry no recognition rows — an empty badge would be an
// invented endorsement).
// One variant: the ledger `pill` (Premium UI P4 — the navy adopt modal that
// needed a dark chip is light now; callers still passing `light` are harmless).
// ─────────────────────────────────────────────────────────────────────────────
import { BadgeCheck } from 'lucide-react'

export default function RecognitionChips({ recognitions }) {
  const rows = recognitions ?? []
  if (!rows.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="recognition-chips">
      {rows.map((r) => (
        <span
          key={r.code}
          title={r.line ?? r.name}
          aria-label={r.line ?? r.name}
          className="pill"
        >
          <BadgeCheck size={10.5} aria-hidden />
          {r.name}
        </span>
      ))}
    </span>
  )
}
