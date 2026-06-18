import { formatShortDate } from '../../lib/format.js'

/**
 * Pill/segmented control of the school's saved periods (newest-first, snapshot
 * only). Two variants: the default dark pill (navy masthead) and a `light` pill
 * for the Phase-4D cream context bar (gold-on-cream when active, hairline border).
 */
export default function PeriodSelector({ periods, activeId, onSelect, light = false }) {
  if (!periods || periods.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((p) => {
        const active = p.id === activeId
        const cls = light
          ? active
            ? 'border-gold/60 bg-gold/10 text-navy shadow-card'
            : 'border-rule/60 text-muted hover:border-gold/50 hover:text-navy'
          : active
            ? 'border-gold/60 bg-white/10 text-gold-light'
            : 'border-white/20 text-white/70 hover:border-gold/40 hover:text-white'
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`flex min-h-[36px] items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] transition-all ${cls}`}
            title={`Period end ${formatShortDate(p.periodEndDate)}`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
