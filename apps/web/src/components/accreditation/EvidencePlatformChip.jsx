// ─────────────────────────────────────────────────────────────────────────────
// EvidencePlatformChip — "where do I actually file this?" for accreditors that
// run their cycle through a third-party portal (FCC → Accreditrac), from
// `FrameworkPublic.evidencePlatform: {name, line} | null`. Sibling of
// RecognitionChips: one quiet chip, the server's `line` sentence as the
// tooltip/aria-label, NOTHING when the framework has no platform (most — an
// invented portal would be an invented workflow). It is metadata, not a
// connector: the line itself says KYRO does not submit on the school's behalf.
// One variant: the ledger `pill` (Premium UI P4 — the navy adopt modal that
// needed a dark chip is light now; callers still passing `light` are harmless).
// ─────────────────────────────────────────────────────────────────────────────
import { ExternalLink } from 'lucide-react'

export default function EvidencePlatformChip({ platform }) {
  if (!platform?.name) return null
  return (
    <span
      data-testid="evidence-platform-chip"
      title={platform.line ?? platform.name}
      aria-label={platform.line ?? `Filed in ${platform.name}`}
      className="pill"
    >
      <ExternalLink size={10.5} aria-hidden />
      Filed in {platform.name}
    </span>
  )
}
