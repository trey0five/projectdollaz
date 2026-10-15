// Saved-periods rail for the merged Statements & Periods page. Lists the school's
// saved periods (newest-first). The NEWEST/active period is the live editable
// workspace; selecting any OTHER saved period opens its stored snapshot read-only.
// Mirrors the prior HistoryPanel selection model exactly — no new hydration path.
//
// Premium UI P4: a RULED LIST on the ground (no card per period) — each row is a
// button with the period label, its end date and import roles; the selected row
// carries a 2px primary rule on the left and the ink weight; state is a status
// Pill (Live / Saved / No snapshot). Hover = a quiet wash.
import { ChevronRight, Loader2 } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'
import { Pill } from '../ui/surface/index.js'

const ROLE_LABEL = { cy: 'CY', py: 'PY', audit: 'Audit' }

export default function SavedPeriodsRail({
  periods,
  activePeriodId,
  selectedId,
  loadingId,
  onSelect,
}) {
  if (!periods || periods.length === 0) return null

  return (
    <ul className="border-t border-hair">
      {periods.map((p) => {
        const isLive = p.id === activePeriodId
        const isSelected = p.id === selectedId
        const enabled = isLive || p.hasSnapshot
        const roles = ['cy', 'py', 'audit'].filter((r) => p.roles?.[r])
        return (
          <li key={p.id} className="border-b border-hair">
            <button
              type="button"
              onClick={() => onSelect(p)}
              disabled={!enabled}
              aria-current={isSelected ? 'true' : undefined}
              className={`relative flex w-full items-center justify-between gap-3 py-2.5 pl-3 pr-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]/50 ${
                enabled ? 'cursor-pointer hover:bg-ink/[0.03]' : 'cursor-not-allowed opacity-60'
              }`}
            >
              {isSelected && <span className="absolute inset-y-1 left-0 w-0.5 bg-[#2563EB]" aria-hidden="true" />}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[14px] ${isSelected ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                    {p.label}
                  </span>
                  {isLive ? (
                    <Pill variant="status" tone="good">Live</Pill>
                  ) : p.hasSnapshot ? (
                    <Pill variant="status" tone="neutral">Saved</Pill>
                  ) : (
                    <Pill>No snapshot</Pill>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-ink2">
                  Ends {formatShortDate(p.periodEndDate)}
                  {' · '}
                  {roles.length === 0 ? <span className="italic">no imports</span> : roles.map((r) => ROLE_LABEL[r]).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {loadingId === p.id ? (
                  <Loader2 size={15} aria-hidden="true" className="animate-spin text-ink2" />
                ) : (
                  enabled && <ChevronRight size={15} aria-hidden="true" className={isSelected ? 'text-ink' : 'text-ink2'} />
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
