// Data-hub status pill. Maps a source status -> a labelled pill. Text + icon +
// aria-label carry the meaning — never color alone (accessibility). Emerald
// "Done" matches the panels' save toast; gold tones match the app theme.
import { Check, CircleDashed, Sparkles, Minus } from 'lucide-react'
import { Pill } from '../ui/surface/index.js'

// Premium UI P4: the ONE Pill shape — a 2px status mark + ink text.
const MAP = {
  present: { label: 'Done', Icon: Check, tone: 'good' },
  partial: { label: 'In progress', Icon: CircleDashed, tone: 'watch' },
  missing: { label: 'Needs you', Icon: Sparkles, tone: 'risk' },
  optional: { label: 'Optional', Icon: Minus, tone: 'neutral' },
}

export default function StatusBadge({ status }) {
  const cfg = MAP[status] || MAP.optional
  const { Icon } = cfg
  return (
    <Pill variant="status" tone={cfg.tone} aria-label={`Status: ${cfg.label}`} className="shrink-0">
      <Icon size={11} strokeWidth={2.5} aria-hidden="true" className="hidden sm:block" />
      {cfg.label}
    </Pill>
  )
}
