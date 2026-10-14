// ─────────────────────────────────────────────────────────────────────────────
// DomainKpiCard — one KPI of the Domain Command Center, as a `Stat` (Premium UI
// P3). Presentational and domain-agnostic: a label, the value, a 2px status mark
// and a one-line sub-stat whose tone colours ONLY the mark beside it. No box,
// no wash, no gradient: the StatStrip draws the vertical rules between KPIs.
//
// The prop contract is the one every domain page (Governance, Facilities,
// Advancement, Accreditation, HR, Planning, Tasks, Knowledge, Cash, Strategy)
// already passes — label · value · sub:{icon,text,tone} · status — so the
// callers are untouched. These domains carry no time-series, so there is never
// a fake sparkline here.
//
// NO-CLIP CONTRACT (card contract §5): the label and sub line WRAP (min-w-0 +
// break-words), and `.stat-text` lets a TEXT value ("None scheduled", "3 of 5
// policies") wrap and hyphenate where a pure figure would never break —
// nothing in this tile carries `truncate`, and the value never shrinks its font.
// ─────────────────────────────────────────────────────────────────────────────
import { Stat } from '../ui/surface/index.js'
import { MARK } from '../analytics/v2/statusStyle.js'

// Sub-stat tone → the mark colour beside the sub text (the text stays ink-2).
const SUB_TONE = { bad: 'tone-risk', good: 'tone-good', neutral: 'tone-neutral' }

export default function DomainKpiCard({ label, value, sub, status = 'neutral' }) {
  const SubIcon = sub?.icon
  const toneCls = SUB_TONE[sub?.tone] ?? SUB_TONE.neutral
  return (
    <Stat label={label} value={value} status={MARK[status]} className="stat-text min-w-0">
      {sub ? (
        <div className="stat-foot min-w-0">
          <i className={`mark ${toneCls}`} aria-hidden="true" />
          {SubIcon ? <SubIcon size={13} className="shrink-0 text-ink2" aria-hidden="true" /> : null}
          <span className="min-w-0 break-words hyphens-auto">{sub.text}</span>
        </div>
      ) : null}
    </Stat>
  )
}
