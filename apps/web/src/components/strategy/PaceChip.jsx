// ─────────────────────────────────────────────────────────────────────────────
// PaceChip + PACE tokens — the shared verdict language for Strategic Planning.
// A goal/pillar/plan pace status (on_track | at_risk | behind | achieved |
// no_data) rendered as a small severity chip on the LIGHT command-center surface:
// green (on_track/achieved), amber-gold (at_risk), red (behind), neutral (no_data).
// PACE also maps each status to a StatusDot token (good/watch/risk/neutral) and an
// arc/node color so the hero, cards and chips all speak the same colour.
// ─────────────────────────────────────────────────────────────────────────────

// status → { label, chip classes (light surface), StatusDot token, hex (arc/nodes) }
export const PACE = {
  on_track: {
    label: 'On track',
    chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    dot: 'good',
    hex: '#059669', // emerald-600
  },
  achieved: {
    label: 'Achieved',
    chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    dot: 'good',
    hex: '#059669',
  },
  at_risk: {
    label: 'At risk',
    chip: 'border-gold/40 bg-gold/10 text-[#7a5e00]',
    dot: 'watch',
    hex: '#b89650', // gold
  },
  behind: {
    label: 'Behind',
    chip: 'border-danger/30 bg-danger/10 text-danger',
    dot: 'risk',
    hex: '#8b1a1a', // danger
  },
  no_data: {
    label: 'No data',
    chip: 'border-rule/60 bg-section text-muted',
    dot: 'neutral',
    hex: '#8a8272',
  },
}

export function paceMeta(status) {
  return PACE[status] ?? PACE.no_data
}

export default function PaceChip({ status, className = '' }) {
  const meta = paceMeta(status)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${meta.chip} ${className}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.hex }}
      />
      {meta.label}
    </span>
  )
}
