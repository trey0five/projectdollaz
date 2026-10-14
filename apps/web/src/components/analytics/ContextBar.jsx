import { CalendarDays, Clock, SlidersHorizontal } from 'lucide-react'
import PeriodSelector from './PeriodSelector.jsx'
import { Toolbar, Pill, Button } from '../ui/surface/index.js'
import { formatShortDate, formatRelative } from '../../lib/format.js'

/**
 * Sticky context / freshness bar (Phase 4D). Period switching + "Data as of
 * [snapshot date]" + "Updated N ago" + a live mark, with the owner-only
 * customize entry so the page header stays slim.
 *
 * PREMIUM UI P2: it is a `Toolbar` on the ground (hairline below) in the page
 * header grammar — no card, no glass (that belongs to the sticky top strip
 * alone), no gold. It stays sticky so the period control is always in reach;
 * the ground colour keeps it legible over what scrolls beneath.
 * formatRelative reads Date.now() once per render (no clock loop).
 */
export default function ContextBar({
  periods,
  activePeriodId,
  onSelectPeriod,
  freshness,
  canCustomize,
  customizing,
  onCustomize,
}) {
  const dataAsOf = freshness?.dataAsOf
  const relative = formatRelative(dataAsOf)

  return (
    <Toolbar
      className="sticky top-0 z-20 mb-5 bg-ground"
      aside={
        <>
          {dataAsOf && (
            <span className="inline-flex items-center gap-1.5 text-small text-ink2">
              <CalendarDays size={13} aria-hidden="true" />
              Data as of <span className="font-semibold text-ink">{formatShortDate(dataAsOf.slice(0, 10))}</span>
            </span>
          )}
          {relative && (
            <span className="inline-flex items-center gap-1.5 text-small text-ink2">
              <Clock size={13} aria-hidden="true" />
              Updated <span className="font-semibold text-ink">{relative}</span>
            </span>
          )}
          <Pill variant="status" tone="good">
            Live
          </Pill>
          {canCustomize && !customizing && (
            <Button size="sm" variant="quiet" onClick={onCustomize} icon={<SlidersHorizontal size={13} />}>
              Customize
            </Button>
          )}
        </>
      }
    >
      <PeriodSelector periods={periods} activeId={activePeriodId} onSelect={onSelectPeriod} light />
    </Toolbar>
  )
}
