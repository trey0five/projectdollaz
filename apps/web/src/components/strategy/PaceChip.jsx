// ─────────────────────────────────────────────────────────────────────────────
// PaceChip + PACE tokens — the shared verdict language for Strategic Planning.
// A goal/pillar/plan pace status (on_track | at_risk | behind | achieved |
// no_data) rendered as a status Pill (Premium UI: a 2px semantic mark + ink
// text, one shape for every meaning). PACE also maps each status to the mark
// tone (good/watch/risk/neutral) and a semantic hex for the horizon arc nodes so
// the hero, rows and chips all speak the same colour.
// ─────────────────────────────────────────────────────────────────────────────
import { Pill } from '../ui/surface/index.js'

// status → { label, tone (Pill / Stat / DataTable mark), dot (Sparkline status), hex (arc nodes) }
export const PACE = {
  on_track: { label: 'On track', tone: 'good', dot: 'good', hex: '#15803D' },
  achieved: { label: 'Achieved', tone: 'good', dot: 'good', hex: '#15803D' },
  at_risk: { label: 'At risk', tone: 'watch', dot: 'watch', hex: '#B45309' },
  behind: { label: 'Behind', tone: 'risk', dot: 'risk', hex: '#B91C1C' },
  no_data: { label: 'No data', tone: 'neutral', dot: 'neutral', hex: '#44506E' },
}

export function paceMeta(status) {
  return PACE[status] ?? PACE.no_data
}

export default function PaceChip({ status, className = '' }) {
  const meta = paceMeta(status)
  return (
    <Pill variant="status" tone={meta.tone} className={className}>
      {meta.label}
    </Pill>
  )
}
