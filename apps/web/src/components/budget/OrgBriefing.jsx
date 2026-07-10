// Organization Briefing tab — the org-level, multi-school ATTENTION BRIEFING for the
// caller's organization. Reads the org-briefing endpoint (one call site in
// api.js) and renders a ranked cross-school attention list (each item attributed
// to its school) + a compact per-school summary table + a not-reported callout.
// The server rolls each in-org school's latest-for-FY briefing up, ranks the items
// deterministically, and caps the list — the web just renders what it gets (never
// re-sorts, never recounts). Read-only / advisory, no-print, navy/gold theme.
//
// Pure presentation over the `briefing` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe).
import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Clock,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Building2,
  Inbox,
  Landmark,
  HeartHandshake,
  BarChart3,
  ShieldCheck,
  Database,
  ListChecks,
  BadgeCheck,
  Wrench,
  HandCoins,
} from 'lucide-react'
import { LensIndicator, LensSwitcher } from '../home/LensControls.jsx'
import { CountUp, WhyText, titleProgress } from '../ui/briefingFx.jsx'

// Per-severity theming — folder-tab language shared with HomeBriefing: the tab
// colour, a faint corner wash, the tab label, and a chip tint for the per-school
// count pills.
const SEVERITY = {
  critical: { label: 'Critical', tab: 'bg-danger', wash: 'rgb(var(--c-danger) / 0.07)', chip: 'bg-danger/10 text-danger' },
  warn: { label: 'Warning', tab: 'bg-gold', wash: 'rgb(var(--c-glow)/0.09)', chip: 'bg-gold/15 text-gold' },
  info: { label: 'Review', tab: 'bg-navy-soft', wash: 'rgb(var(--c-navy-soft) / 0.06)', chip: 'bg-navy/10 text-navy' },
}

// Triage-board lanes — one column per severity (decreasing urgency), matching
// HomeBriefing. Server order is preserved within each lane.
const LANES = [
  { key: 'critical', label: 'Critical', bar: 'from-danger to-danger/40', dot: 'bg-danger', text: 'text-danger', empty: 'Nothing critical.', Icon: AlertCircle },
  { key: 'warn', label: 'Warning', bar: 'from-gold to-gold/40', dot: 'bg-gold', text: 'text-gold-dark', empty: 'No warnings.', Icon: AlertTriangle },
  { key: 'info', label: 'To review', bar: 'from-navy-soft to-navy-soft/40', dot: 'bg-navy-soft', text: 'text-navy-soft', empty: 'Nothing to review.', Icon: Eye },
]

// The severity-tinted premium card surface (.card-attn in index.css).
const CARD_ATTN = {
  critical: 'card-attn card-attn-critical',
  warn: 'card-attn card-attn-warn',
  info: 'card-attn card-attn-info',
}

// Domain eyebrow: a label + an icon that rides inside the gold coin.
const SOURCE_META = {
  metric: { label: 'Finance', Icon: BarChart3 },
  compliance: { label: 'Readiness', Icon: ShieldCheck },
  data: { label: 'Data', Icon: Database },
  governance: { label: 'Governance', Icon: Landmark },
  workflow: { label: 'Workflow', Icon: ListChecks },
  accreditation: { label: 'Accreditation', Icon: BadgeCheck },
  facilities: { label: 'Facilities', Icon: Wrench },
  advancement: { label: 'Advancement', Icon: HeartHandshake },
  cash: { label: 'Cash', Icon: HandCoins },
}

const CTA_LABEL = {
  metric: 'Open analytics',
  compliance: 'Open readiness',
  data: 'Go to Data hub',
  cash: 'Open Cash & Collections',
}

// Voice-aware CTA: a governance (board) lens never gets an imperative "go fix".
function ctaLabel(item) {
  if (item.voice === 'governance') return 'Review with leadership'
  return CTA_LABEL[item.source] ?? 'Take a look'
}

function fmtDue(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Cross-school item card — mirrors HomeBriefing's BriefingItemCard with an added
// school-attribution chip on the title row so it reads "Sample High — Tuition
// Dependency is in the risk band". The CTA Link still targets item.link (a
// school-relative route); the school name is surfaced prominently because the link
// resolves against the viewer's active school (seamless cross-school deep-linking
// is a known integration caveat, out of this slice's scope).
// Cross-school decision card — the same flashy folder-tab idiom as HomeBriefing,
// with a school-attribution chip in the eyebrow. The whole card links to item.link.
function OrgBriefingItemCard({ item, index, reduce, active = false }) {
  const sev = SEVERITY[item.severity] ?? SEVERITY.info
  const domain = SOURCE_META[item.source] ?? { label: item.source ?? 'Signal', Icon: Sparkles }
  const DomainIcon = domain.Icon
  const progress = titleProgress(item.title)
  // When Penny narrates this cross-school item we ring it gold (below) — but we do NOT
  // scrollIntoView: during brief playback that dragged the page down past the brief the
  // user is watching. The gold ring tracks the active item without moving the scroll.
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: reduce ? 0 : index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { y: -3 }}
    >
      <Link
        to={item.link}
        className={`group relative block overflow-hidden rounded-2xl ${CARD_ATTN[item.severity] ?? CARD_ATTN.info} ${active ? 'ring-2 ring-gold shadow-glow' : ''}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(130% 95% at 0% 0%, ${sev.wash}, transparent 58%)` }}
        />
        <span
          className={`absolute left-6 top-0 z-10 rounded-b-lg px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-white ${sev.tab}`}
        >
          {item.severity === 'critical' && !reduce && (
            <span className="absolute inset-0 rounded-b-lg bg-danger motion-safe:animate-ping" style={{ opacity: 0.35 }} aria-hidden />
          )}
          <span className="relative">{sev.label}</span>
        </span>

        <div className="relative px-5 pb-4 pt-8 sm:px-6">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {/* Segmented attribution badge — school (navy) fused to domain (gold)
                so the pair reads as one unit and wraps as one. */}
            <span
              className="inline-flex max-w-full items-stretch overflow-hidden rounded-full shadow-[0_1px_5px_rgba(23,42,77,0.18)] ring-1 ring-white/40"
              title={`${item.schoolName} · ${domain.label}`}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5 bg-navy py-1 pl-2.5 pr-2.5 text-[11px] font-semibold leading-4 text-white">
                <Building2 size={11} className="shrink-0 opacity-80" />
                <span className="truncate">{item.schoolName}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 bg-gold-gradient py-1 pl-2 pr-2.5 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] text-white">
                <DomainIcon size={11} className="shrink-0 drop-shadow-sm" />
                {domain.label}
              </span>
            </span>
            {item.dueDate && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-muted">
                <Clock size={13} className="opacity-70" />
                Due {fmtDue(item.dueDate)}
              </span>
            )}
          </div>

          <h3 className="font-serif text-[19px] font-semibold leading-snug text-navy sm:text-[21px]">
            {item.title}
          </h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
            <WhyText text={item.why} />
          </p>
          {progress != null && (
            <div className="mt-3 flex items-center gap-2.5" aria-hidden="true">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy/10">
                <motion.div
                  initial={reduce ? { width: `${progress}%` } : { width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.9, delay: 0.3 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gold-gradient shadow-[0_0_8px_rgb(var(--c-glow)/0.45)]"
                />
              </div>
              <span className="text-[12px] font-bold tabular-nums text-[#7a5e00]">{progress}%</span>
            </div>
          )}
          <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-gold">
            {ctaLabel(item)}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

// A lane shows at most this many cards before collapsing the rest behind a
// "stacked" expander. Lanes with 4 or fewer items always render in full.
const LANE_COLLAPSE_AT = 4

// The "stacked" expander that stands in for a lane's hidden cards.
function StackExpander({ hidden, tab, onClick }) {
  return (
    <button type="button" onClick={onClick} className="relative mt-1 w-full text-left">
      <span aria-hidden className="absolute inset-x-4 -bottom-1.5 h-full rounded-2xl border border-rule/50 bg-white/50" />
      <span aria-hidden className="absolute inset-x-2 -bottom-[3px] h-full rounded-2xl border border-rule/60 bg-white/75" />
      <span className="relative flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gold/50 bg-white px-4 py-3.5 text-[12.5px] font-bold uppercase tracking-[0.06em] text-navy shadow-card transition-all duration-200 hover:border-gold hover:shadow-glow">
        <span className={`inline-flex h-4 w-4 items-center justify-center rounded ${tab}`}>
          <Layers size={11} className="text-white" />
        </span>
        Show {hidden} more
        <ChevronDown size={15} className="text-gold" />
      </span>
    </button>
  )
}

// One triage-board column: a colour-accented header with a live count, then the
// server-ranked cross-school cards for this severity (or a soft empty state). When
// a lane holds more than LANE_COLLAPSE_AT cards, the overflow is stacked behind an
// expander and revealed on click.
function OrgTriageLane({ lane, items, reduce, activeItemId }) {
  const count = items.length
  const [expanded, setExpanded] = useState(false)
  const collapsible = count > LANE_COLLAPSE_AT
  const shown = collapsible && !expanded ? items.slice(0, LANE_COLLAPSE_AT) : items

  return (
    <section aria-label={`${lane.label} — ${count} item${count === 1 ? '' : 's'}`} className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl border border-rule/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
        <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${lane.bar}`} />
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            {lane.key === 'critical' && count > 0 && !reduce && (
              <span className={`absolute inline-flex h-full w-full rounded-full ${lane.dot} opacity-60 motion-safe:animate-ping`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${lane.dot}`} />
          </span>
          <lane.Icon size={14} className={lane.text} aria-hidden />
          <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-navy">{lane.label}</span>
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.15 }}
            className={`ml-auto min-w-[1.75rem] rounded-full bg-section px-2 py-0.5 text-center text-[12.5px] font-extrabold tabular-nums ${lane.text}`}
          >
            <CountUp value={count} />
          </motion.span>
        </div>
      </div>
      {count === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-rule/70 bg-white/40 px-4 py-10 text-center">
          <p className="text-[13px] font-medium text-muted/70">{lane.empty}</p>
        </div>
      ) : (
        <motion.div layout className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {shown.map((item, i) => (
              <OrgBriefingItemCard
                key={item.orgItemId}
                item={item}
                index={i}
                reduce={reduce}
                active={activeItemId != null && item.orgItemId === activeItemId}
              />
            ))}
          </AnimatePresence>

          {collapsible && !expanded && (
            <StackExpander hidden={count - LANE_COLLAPSE_AT} tab={lane.dot} onClick={() => setExpanded(true)} />
          )}
          {collapsible && expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-1 inline-flex items-center justify-center gap-1.5 self-center rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <ChevronUp size={14} /> Show less
            </button>
          )}
        </motion.div>
      )}
    </section>
  )
}

export default function OrgBriefing({
  briefing,
  loading,
  error,
  lens = null,
  callerRole = null,
  availableLenses = [],
  onLensChange,
}) {
  const reduce = useReducedMotion()
  // The org item Penny is narrating (keyed by orgItemId) — gold-ring the match.
  const [activeItemId, setActiveItemId] = useState(null)
  useEffect(() => {
    const onActive = (e) => setActiveItemId(e?.detail?.itemId ?? null)
    window.addEventListener('penny:narrate-active', onActive)
    return () => window.removeEventListener('penny:narrate-active', onActive)
  }, [])

  if (loading) {
    return (
      <div className="no-print card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">
          Assembling your organization briefing…
        </p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="no-print card-soft border-dashed px-6 py-12 text-center">
        <p className="font-serif text-base italic text-muted">{error}</p>
      </div>
    )
  }
  if (!briefing) return null

  const consolidated = briefing.consolidated || {}
  const schools = briefing.schools || []
  const items = briefing.items || []
  const notReported = briefing.notReported || []
  const { critical = 0, warn = 0, info = 0, total = 0 } = consolidated
  const schoolsReporting = consolidated.schoolsReporting ?? schools.filter((s) => s.reported).length
  const schoolCount = consolidated.schoolCount ?? schools.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="no-print space-y-5"
    >
      {/* Scope × Lens chrome — active org lens + (owner-only) preview switcher. */}
      {lens && (
        <div className="flex flex-wrap items-center gap-3">
          <LensIndicator lens={lens} />
          <LensSwitcher
            lens={lens}
            callerRole={callerRole}
            availableLenses={availableLenses}
            onChange={onLensChange}
          />
        </div>
      )}

      {/* Headline — org-scoped HomeBriefing idiom. total===0 splits two ways:
          genuinely all-clear (≥1 school reported, nothing flagged) vs. nothing to
          report on yet (no school has generated statements for this period). */}
      {total === 0 && schoolsReporting === 0 ? (
        <div className="card-soft flex items-center gap-4 px-6 py-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-navy/5 text-navy">
            <Inbox size={26} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">
              No schools have reported yet.
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              None of your {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} has generated
              statements for this period — once they do, their briefings roll up here.
            </p>
          </div>
        </div>
      ) : total === 0 ? (
        <div className="card-soft flex items-center gap-4 px-6 py-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
            <Sparkles size={26} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Every reporting school is on track.
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              No metrics, readiness gaps, or data issues need attention across your{' '}
              {schoolsReporting} reporting {schoolsReporting === 1 ? 'school' : 'schools'}.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
              Across your {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} —{' '}
              <CountUp value={total} className="text-gold-dark" /> thing
              {total === 1 ? '' : 's'} need{total === 1 ? 's' : ''} attention.
            </h2>
            <span
              className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-gold/70 shadow-[0_0_8px_rgb(var(--c-glow)/0.5)]"
              aria-hidden
            />
          </div>
          <p className="text-[14px] text-muted">
            <span className="font-semibold text-danger"><CountUp value={critical} /> critical</span> ·{' '}
            <span className="font-semibold text-gold"><CountUp value={warn} /> warnings</span> ·{' '}
            <span className="font-semibold text-navy"><CountUp value={info} /> to review</span>
          </p>
        </div>
      )}

      {/* Coverage banner — OrgStatements idiom. */}
      <div className="rounded-2xl border border-gold/30 bg-gold/5 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-navy">
            {schoolsReporting} of {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} reported
          </p>
          <p className="text-[11px] italic text-muted">
            Advisory — rolled up from each school&rsquo;s latest period for this fiscal year.
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/10" aria-hidden="true">
          <motion.div
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${schoolCount > 0 ? Math.round((schoolsReporting / schoolCount) * 100) : 0}%` }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gold-gradient"
          />
        </div>
      </div>

      {/* Triage board — cross-school items bucketed into severity lanes (server
          order preserved within each lane). */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {LANES.map((lane) => (
              <OrgTriageLane
                key={lane.key}
                lane={lane}
                items={items.filter((it) => (it.severity ?? 'info') === lane.key)}
                reduce={reduce}
                activeItemId={activeItemId}
              />
            ))}
          </div>
          {briefing.capApplied && (
            <div className="rounded-2xl border border-dashed border-rule bg-cream/40 px-5 py-3 text-center">
              <p className="text-[12px] text-muted">
                <span className="font-semibold text-navy">+{briefing.cappedItemCount} more</span>{' '}
                across your schools — see the per-school summaries below for the full counts.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Per-school summary table + org KPI strip now render ABOVE this triage
          board (owned by OrgHome / OrgSchoolsTable), so the briefing headline stays
          attached to the triage. */}

      {/* Not-reported callout — never let the briefing look complete while a school is missing. */}
      {notReported.length > 0 && (
        <div className="rounded-2xl border border-dashed border-rule bg-cream/40 px-5 py-3">
          <p className="text-[12px] text-muted">
            <span className="font-semibold text-navy">Not yet reported:</span>{' '}
            {notReported.map((n) => n.name).join(', ')}. These schools are not yet included in the
            briefing.
          </p>
        </div>
      )}
    </motion.div>
  )
}
