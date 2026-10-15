// StudioActionInbox — the "Your action inbox" section. Reuses the server-ranked
// briefing (useBriefing) and turns each item into a decision Penny can EXECUTE:
// "Handle it" sends a domain-shaped prompt straight into the conversation; "Open"
// links to the item for do-it-myself. Server order is preserved (never re-sorted).
//
// States: loading → skeleton rows; empty → an all-caught-up row; notEntitled
// (402) → hide the section; error with no items → render nothing (fail-soft).
import { useState } from 'react'
import { ArrowRight, Clock } from 'lucide-react'
import { useBriefing } from '../../../hooks/useBriefing.js'
import { Button, Pill, Section } from '../../ui/surface/index.js'
import '../../../styles/pending/c1-flows.css'

// How many items to show before the "Show all" affordance kicks in — keeps the
// landing calm (the mockup showed a short inbox) without hiding anything.
const COLLAPSED_COUNT = 5

const SOURCE_LABEL = {
  metric: 'Finance',
  compliance: 'Readiness',
  data: 'Data quality',
  governance: 'Governance',
  workflow: 'Workflow',
  accreditation: 'Accreditation',
  facilities: 'Facilities',
  advancement: 'Advancement',
  strategy: 'Strategy',
  enrollment: 'Enrollment',
  cash: 'Cash',
  hr: 'People',
  planning: 'Planning',
  earlywarning: 'Early warning',
  academics: 'Academics',
}

// Severity → the word a reader sees (never the raw enum).
const SEV_LABEL = {
  critical: 'Critical',
  warn: 'Watch',
  warning: 'Watch',
  info: 'FYI',
}

// Severity → the 2px status mark tone (statusStyle grammar: mark + ink text).
const SEV_TONE = {
  critical: 'risk',
  warn: 'watch',
  info: 'neutral',
}

function fmtDue(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Domain-shaped executive prompt for "Handle it".
function handlePrompt(item) {
  const base = `Handle this for me: "${item.title}". ${item.why}`
  switch (item.source) {
    case 'metric':
      return `${base} Pull the numbers, explain the driver, and chart it.`
    case 'compliance':
      return `${base} Walk me through what to fix and draft the correction.`
    case 'data':
      return `${base} If it needs a file, tell me exactly what to drop; otherwise resolve it.`
    case 'governance':
      return `${base} Draft it and show me before saving.`
    default:
      return `${base} Do what's needed and show me before saving.`
  }
}

function RowSkeleton() {
  return (
    <li className="ruled-row">
      <span className="ruled-mark text-hair" aria-hidden />
      <div className="flex-1">
        <div className="shimmer-bar h-2.5 w-28 rounded" />
        <div className="shimmer-bar mt-2.5 h-3.5 w-2/3 rounded" />
        <div className="shimmer-bar mt-2 h-3 w-full rounded" />
      </div>
    </li>
  )
}

export default function StudioActionInbox({ schoolId, periodId, onHandle }) {
  const { items, loading, error, notEntitled } = useBriefing(schoolId, periodId)
  const [expanded, setExpanded] = useState(false)

  // Gated → hide the section entirely (like the rest of the gated dashboard).
  if (notEntitled) return null
  // Fail-soft: an error with nothing to show renders nothing.
  if (error && items.length === 0 && !loading) return null

  const openCount = items.length
  const anyCritical = items.some((i) => i.severity === 'critical')
  const hasOverflow = openCount > COLLAPSED_COUNT
  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_COUNT)

  // Premium UI P4: ruled rows on the ground under a Section label — no card
  // shell; each decision leads with its 2px severity mark.
  return (
    <Section
      label="Your action inbox"
      aside={
        !loading && openCount > 0 ? (
          <Pill variant="status" tone={anyCritical ? 'risk' : 'neutral'}>
            {openCount} open
          </Pill>
        ) : null
      }
    >
      <ul className="ruled border-b border-hair">
        {loading ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : openCount === 0 ? (
          <li className="ruled-row items-center">
            <span className="ruled-mark text-[rgb(var(--c-good))]" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold text-ink">You’re all caught up.</p>
              <p className="mt-0.5 text-[13px] text-ink2">Nothing needs a decision for this period.</p>
            </div>
          </li>
        ) : (
          visibleItems.map((item) => (
            <li key={item.id} className="ruled-row">
              <span className={`ruled-mark tone-${SEV_TONE[item.severity] ?? 'neutral'}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                    {SOURCE_LABEL[item.source] ?? item.source} · {SEV_LABEL[item.severity] ?? item.severity}
                  </span>
                  {item.dueDate && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[12px] tabular-nums text-ink2">
                      <Clock size={12} className="opacity-70" aria-hidden />
                      Due {fmtDue(item.dueDate)}
                    </span>
                  )}
                </div>
                <h3 className="mt-0.5 text-[14.5px] font-semibold leading-[20px] text-ink">{item.title}</h3>
                <p className="mt-0.5 text-[13px] leading-[19px] text-ink2">{item.why}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" className="btn-kyro" onClick={() => onHandle(handlePrompt(item))}>
                    Handle it
                  </Button>
                  {item.link && (
                    <Button size="sm" variant="secondary" to={item.link}>
                      Open
                      <ArrowRight size={13} aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {!loading && hasOverflow && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="sec-more mt-2">
          {expanded ? 'Show less' : `Show all ${openCount}`}
        </button>
      )}
    </Section>
  )
}
