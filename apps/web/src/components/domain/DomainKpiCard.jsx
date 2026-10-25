// ─────────────────────────────────────────────────────────────────────────────
// DomainKpiCard — one KPI of the Domain Command Center. AURORA: worn as a
// frosted-glass card on the module band (`.au-kpi` over the `Stat` primitive):
// an optional icon well beside the label, the value (+ unit), ONE short caption
// (the `sub` line) and a verdict pill — Good / Watch / At risk as word + icon +
// colour. A neutral status (no band) shows NO pill: never invent a judgement.
//
// The prop contract is the one every domain page (Governance, Facilities,
// Advancement, Accreditation, HR, Planning, Tasks, Knowledge, Cash, Strategy)
// already passes — label · value · sub:{icon,text,tone} · status — plus two
// optional extras: `icon` and `unit`. These domains carry no time-series, so
// there is never a fake sparkline here.
//
// NO-CLIP CONTRACT (card contract §5): the label and sub line WRAP (min-w-0 +
// break-words), and `.stat-text` lets a TEXT value ("None scheduled", "3 of 5
// policies") wrap and hyphenate where a pure figure would never break —
// nothing in this tile carries `truncate`, and the value never shrinks its font.
// ─────────────────────────────────────────────────────────────────────────────
import { Stat } from '../ui/surface/index.js'
import { VerdictPill } from '../ui/aurora/index.js'

// Sub-stat tone → the mark colour beside the sub text (hidden on the glass card,
// kept so the sub line reads the same off the band).
const SUB_TONE = { bad: 'tone-risk', good: 'tone-good', neutral: 'tone-neutral' }

/**
 * `hint` (#47) is the plain-words line under the figure: what the number counts
 * and what clears it ("Policies past their review date or due within 30 days.
 * Review one to clear it."). `onClick` makes the card a way in — it opens the
 * register the number came from.
 */
export default function DomainKpiCard({ label, value, sub, status = 'neutral', icon: Icon = null, unit = null, hint = null, onClick = null }) {
  const SubIcon = sub?.icon
  const toneCls = SUB_TONE[sub?.tone] ?? SUB_TONE.neutral
  const labelNode = Icon ? (
    <>
      <i className="au-kpi-ic" aria-hidden="true">
        <Icon size={15} />
      </i>
      <span className="min-w-0">{label}</span>
    </>
  ) : (
    label
  )
  // A short pure figure ("12", "$4.2M", "87%") keeps the big glass size and
  // never breaks; anything with words stays a wrapping text value.
  const figure = typeof value === 'number' || (typeof value === 'string' && value.length <= 9 && /^[\d$€£.,%+\-−/ ]+$/.test(value))
  const card = (
    <Stat
      label={labelNode}
      value={value}
      unit={unit}
      className={`au-kpi stat-text min-w-0${figure ? ' au-kpi-num' : ''}${onClick ? ' au-kpi-link' : ''}`}
      role="listitem"
    >
      {sub ? (
        <div className="stat-foot min-w-0">
          <i className={`mark ${toneCls}`} aria-hidden="true" />
          {SubIcon ? <SubIcon size={13} className="shrink-0" aria-hidden="true" /> : null}
          <span className="min-w-0 break-words hyphens-auto">{sub.text}</span>
        </div>
      ) : null}
      {hint ? (
        <p className="au-kpi-hint mt-1 min-w-0 break-words text-[12px] leading-snug text-ink2" data-testid="kpi-hint">
          {hint}
        </p>
      ) : null}
      <VerdictPill verdict={status} reserve />
    </Stat>
  )
  if (!onClick) return card
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label} — open`}
      title={`Open ${label.toLowerCase()}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="min-w-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {card}
    </div>
  )
}
