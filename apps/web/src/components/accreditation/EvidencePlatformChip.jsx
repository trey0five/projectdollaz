// ─────────────────────────────────────────────────────────────────────────────
// EvidencePlatformChip — "where do I actually file this?" for accreditors that
// run their cycle through a third-party portal (FCC → Accreditrac), from
// `FrameworkPublic.evidencePlatform: {name, line} | null`. Sibling of
// RecognitionChips: one quiet chip, the server's `line` sentence as the
// tooltip/aria-label, NOTHING when the framework has no platform (most — an
// invented portal would be an invented workflow). It is metadata, not a
// connector: the line itself says KYRO does not submit on the school's behalf.
// ─────────────────────────────────────────────────────────────────────────────
import { ExternalLink } from 'lucide-react'

export default function EvidencePlatformChip({ platform, light = false }) {
  if (!platform?.name) return null
  return (
    <span
      data-testid="evidence-platform-chip"
      title={platform.line ?? platform.name}
      aria-label={platform.line ?? `Filed in ${platform.name}`}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold ${
        light ? 'border-rule/70 bg-section text-muted' : 'border-white/20 bg-white/5 text-white/60'
      }`}
    >
      <ExternalLink size={10.5} aria-hidden />
      Filed in {platform.name}
    </span>
  )
}
