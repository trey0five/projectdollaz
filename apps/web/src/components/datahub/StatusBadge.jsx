// Data-hub status pill. Maps a source status -> a labelled pill. Text + icon +
// aria-label carry the meaning — never color alone (accessibility). Emerald
// "Done" matches the panels' save toast; gold tones match the app theme.
import { Check, CircleDashed, Sparkles, Minus } from 'lucide-react'

const MAP = {
  present: {
    label: 'Done',
    Icon: Check,
    cls: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  },
  partial: {
    label: 'In progress',
    Icon: CircleDashed,
    cls: 'border-gold/40 bg-gold/10 text-amber-700',
  },
  missing: {
    label: 'Needs you',
    Icon: Sparkles,
    cls: 'border-transparent bg-gold-gradient text-navy shadow-glow',
  },
  optional: {
    label: 'Optional',
    Icon: Minus,
    cls: 'border-rule/70 bg-navy/[0.04] text-muted',
  },
}

export default function StatusBadge({ status }) {
  const cfg = MAP[status] || MAP.optional
  const { Icon } = cfg
  return (
    <span
      aria-label={`Status: ${cfg.label}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${cfg.cls}`}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}
