// StudioActionInbox — the "Your action inbox" panel. Reuses the server-ranked
// briefing (useBriefing) and turns each item into a decision Penny can EXECUTE:
// "Handle it" sends a domain-shaped prompt straight into the conversation; "Open"
// links to the item for do-it-myself. Server order is preserved (never re-sorted).
//
// States: loading → skeletons; empty → all-caught-up card; notEntitled (402) →
// hide the panel; error with no items → render nothing (fail-soft). Dark deck.
import { ArrowRight, Clock, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBriefing } from '../../../hooks/useBriefing.js'

const SOURCE_LABEL = {
  metric: 'Finance',
  compliance: 'Readiness',
  data: 'Data quality',
  governance: 'Governance',
  workflow: 'Workflow',
  accreditation: 'Accreditation',
  facilities: 'Facilities',
  advancement: 'Advancement',
}

// Severity → the left accent bar colour (mirrors HomeBriefing SEVERITY).
const SEV_BAR = {
  critical: 'bg-danger',
  warn: 'bg-gold',
  info: 'bg-navy-soft',
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
    <div className="flex gap-3 border-b border-[#22406e] px-[18px] py-[15px] last:border-b-0">
      <div className="w-1 shrink-0 rounded bg-[#22406e]" />
      <div className="flex-1">
        <div className="h-2.5 w-28 rounded bg-[#22406e]" />
        <div className="mt-2.5 h-3.5 w-2/3 rounded bg-[#22406e]" />
        <div className="mt-2 h-3 w-full rounded bg-[#22406e]" />
        <div className="mt-3 h-7 w-40 rounded-lg bg-[#22406e]" />
      </div>
    </div>
  )
}

export default function StudioActionInbox({ schoolId, periodId, onHandle }) {
  const { items, loading, error, notEntitled } = useBriefing(schoolId, periodId)

  // Gated → hide the panel entirely (like the rest of the gated dashboard).
  if (notEntitled) return null
  // Fail-soft: an error with nothing to show renders nothing.
  if (error && items.length === 0 && !loading) return null

  const openCount = items.length
  const anyCritical = items.some((i) => i.severity === 'critical')

  return (
    <section className="overflow-hidden rounded-2xl border border-[#22406e] bg-[#152a4d]">
      <header className="flex items-center gap-2.5 border-b border-[#22406e] px-[18px] py-4">
        <h2 className="font-serif text-[18px] font-semibold text-white">Your action inbox</h2>
        {loading ? (
          <span className="ml-auto h-5 w-14 rounded-full bg-[#22406e]" />
        ) : openCount > 0 ? (
          <span
            className={`ml-auto rounded-full px-2.5 py-[3px] text-[11px] font-bold ${
              anyCritical ? 'bg-danger text-white' : 'bg-gold text-navy-deep'
            }`}
          >
            {openCount} open
          </span>
        ) : null}
      </header>

      {loading ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : openCount === 0 ? (
        <div className="flex items-center gap-4 px-[18px] py-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
            <Sparkles size={22} aria-hidden />
          </span>
          <div>
            <p className="font-serif text-[17px] font-semibold text-white">You’re all caught up.</p>
            <p className="mt-0.5 text-[13.5px] text-[#93a6c4]">Nothing needs a decision for this period.</p>
          </div>
        </div>
      ) : (
        items.map((item) => (
          <article key={item.id} className="flex gap-3 border-b border-[#22406e] px-[18px] py-[15px] last:border-b-0">
            <span className={`w-1 shrink-0 rounded ${SEV_BAR[item.severity] ?? SEV_BAR.info}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#93a6c4]">
                  {SOURCE_LABEL[item.source] ?? item.source} · {item.severity}
                </span>
                {item.dueDate && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-[#93a6c4]">
                    <Clock size={12} className="opacity-70" aria-hidden />
                    Due {fmtDue(item.dueDate)}
                  </span>
                )}
              </div>
              <h3 className="mt-0.5 text-[14.5px] font-semibold text-white">{item.title}</h3>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#c2d0e6]">{item.why}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onHandle(handlePrompt(item))}
                  className="rounded-lg bg-gold-gradient px-3 py-1.5 text-[12.5px] font-bold text-navy shadow-sm transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 motion-reduce:hover:translate-y-0"
                >
                  Handle it
                </button>
                {item.link && (
                  <Link
                    to={item.link}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#22406e] px-3 py-1.5 text-[12.5px] font-semibold text-[#c2d0e6] transition-colors hover:border-gold/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  >
                    Open
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))
      )}
    </section>
  )
}
