// ─────────────────────────────────────────────────────────────────────────────
// RecognitionChips — accreditor-recognition badges (NCPSA / ICAISA), from
// `FrameworkPublic.recognitions: {code,name,line}[]`. Small, quiet chips near
// the accreditor line: the NAME is the chip, the server's `line` sentence is
// the tooltip/aria-label. Empty or absent → NOTHING renders (most frameworks,
// Cognia included, carry no recognition rows — an empty badge would be an
// invented endorsement).
// ─────────────────────────────────────────────────────────────────────────────
import { BadgeCheck } from 'lucide-react'

export default function RecognitionChips({ recognitions, light = false }) {
  const rows = recognitions ?? []
  if (!rows.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="recognition-chips">
      {rows.map((r) => (
        <span
          key={r.code}
          title={r.line ?? r.name}
          aria-label={r.line ?? r.name}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold ${
            light
              ? 'border-rule/70 bg-section text-muted'
              : 'border-white/20 bg-white/5 text-white/60'
          }`}
        >
          <BadgeCheck size={10.5} aria-hidden />
          {r.name}
        </span>
      ))}
    </span>
  )
}
