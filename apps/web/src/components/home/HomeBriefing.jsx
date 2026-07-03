// ─────────────────────────────────────────────────────────────────────────────
// HomeBriefing — the LEAD panel of HomeDashboard. Turns Home from a vitals
// dashboard into a prioritised, advisory briefing: "Good morning. N things need
// your attention." Renders the server-RANKED AttentionItem[] (never re-sorts) as
// flashy folder-tab DECISION CARDS: a severity tab, a domain eyebrow with a gold
// coin, a due indicator, the serif headline, the plain-language `why`, and inline
// actions. Zero items => the all-caught-up empty state. Read-only, no-print,
// navy/gold theme. Fail-soft: an error with no items renders nothing so a briefing
// hiccup never blocks the vitals below. Dismiss is client-only (session-scoped).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  Clock,
  ArrowRight,
  ListPlus,
  X,
  Sparkles,
  Landmark,
  HeartHandshake,
  BarChart3,
  ShieldCheck,
  Database,
  ListChecks,
  BadgeCheck,
  Wrench,
} from 'lucide-react'
import { LensIndicator, LensSwitcher } from './LensControls.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function askPennyToBrief() {
  window.dispatchEvent(
    new CustomEvent('penny:ai-ask', {
      detail: { text: 'Brief me on what needs my attention.' },
    }),
  )
}

function BriefMeButton() {
  return (
    <button
      type="button"
      onClick={askPennyToBrief}
      aria-label="Ask Penny to brief me on what needs my attention"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold-gradient px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-glow transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <Sparkles size={14} />
      Brief me
    </button>
  )
}

// Per-severity theming: the folder tab colour, the faint corner wash, and the tab
// label. critical→Critical, warn→Warning, info→Review.
const SEVERITY = {
  critical: { label: 'Critical', tab: 'bg-danger', wash: 'rgba(139,26,26,0.07)' },
  warn: { label: 'Warning', tab: 'bg-gold', wash: 'rgba(184,150,80,0.09)' },
  info: { label: 'Review', tab: 'bg-navy-soft', wash: 'rgba(46,80,143,0.06)' },
}

// Domain eyebrow: a label + a small icon that rides inside the gold coin.
const SOURCE_META = {
  metric: { label: 'Finance', Icon: BarChart3 },
  compliance: { label: 'Readiness', Icon: ShieldCheck },
  data: { label: 'Data', Icon: Database },
  governance: { label: 'Governance', Icon: Landmark },
  workflow: { label: 'Workflow', Icon: ListChecks },
  accreditation: { label: 'Accreditation', Icon: BadgeCheck },
  facilities: { label: 'Facilities', Icon: Wrench },
  advancement: { label: 'Advancement', Icon: HeartHandshake },
}

const CTA_LABEL = {
  metric: 'Open analytics',
  compliance: 'Open readiness',
  data: 'Go to Data hub',
}

// Map a briefing item.source to a valid TASK_SOURCE_TYPE (manual|policy|metric|
// compliance) so the create-task DTO @IsIn never 400s.
const TASK_SOURCE_MAP = {
  metric: 'metric',
  compliance: 'compliance',
  governance: 'policy',
  data: 'manual',
  workflow: 'manual',
}

function ctaLabel(item) {
  if (item.voice === 'governance') return 'Review with leadership'
  return CTA_LABEL[item.source] ?? 'Take a look'
}

function fmtDue(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function BriefingItemCard({ item, index, reduce, canEdit, onDismiss }) {
  const sev = SEVERITY[item.severity] ?? SEVERITY.info
  const domain = SOURCE_META[item.source] ?? { label: item.source ?? 'Signal', Icon: Sparkles }
  const DomainIcon = domain.Icon
  const navigate = useNavigate()

  const createTaskFromItem = () => {
    const today = new Date().toISOString().slice(0, 10)
    const futureDue = item.dueDate && item.dueDate > today ? item.dueDate : ''
    navigate('/tasks', {
      state: {
        prefill: {
          title: `Follow up: ${item.title}`,
          sourceType: TASK_SOURCE_MAP[item.source] ?? 'manual',
          sourceRef: item.id ?? '',
          dueDate: futureDue,
        },
      },
    })
  }
  const taskLabel = item.voice === 'governance' ? 'Create review task' : 'Create task'

  return (
    <motion.article
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.98 }}
      transition={{ duration: 0.38, delay: reduce ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-rule/70 bg-white shadow-card transition-shadow duration-300 hover:shadow-glow"
    >
      {/* Faint severity corner wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(130% 95% at 0% 0%, ${sev.wash}, transparent 58%)` }}
      />
      {/* Folder tab — severity label overlapping the top edge; the critical tab pulses. */}
      <span
        className={`absolute left-6 top-0 z-10 rounded-b-lg px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-white ${sev.tab}`}
      >
        {item.severity === 'critical' && !reduce && (
          <span className="absolute inset-0 rounded-b-lg bg-danger motion-safe:animate-ping" style={{ opacity: 0.35 }} aria-hidden />
        )}
        <span className="relative">{sev.label}</span>
      </span>

      <div className="relative px-5 pb-4 pt-8 sm:px-6">
        {/* Eyebrow: domain coin + label, and a due indicator on the right */}
        <div className="mb-2 flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gold-gradient text-white shadow-[0_1px_4px_rgba(184,150,80,0.4)]">
              <DomainIcon size={11} />
            </span>
            {domain.label}
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
        <p className="mt-1.5 max-w-[64ch] text-[14.5px] leading-relaxed text-muted">{item.why}</p>

        {/* Inline actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            to={item.link}
            className="group/cta inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 motion-reduce:hover:translate-y-0"
          >
            {ctaLabel(item)}
            <ArrowRight size={14} className="transition-transform group-hover/cta:translate-x-0.5" />
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={createTaskFromItem}
              aria-label={`${taskLabel} for ${item.title}`}
              title="Turn this into an assignable task"
              className="inline-flex items-center gap-1.5 rounded-xl border border-navy/15 bg-white px-3.5 py-2 text-[13px] font-semibold text-navy/70 transition-colors hover:border-navy/40 hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              <ListPlus size={14} />
              {taskLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss?.(item.id)}
            aria-label={`Dismiss ${item.title}`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-muted/70 transition-colors hover:bg-section hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <X size={13} />
            Dismiss
          </button>
        </div>
      </div>
    </motion.article>
  )
}

function ItemSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-white shadow-card">
      <div className="px-6 pb-5 pt-8">
        <div className="shimmer-bar h-3 w-28 rounded" />
        <div className="shimmer-bar mt-3 h-4 w-2/3 rounded" />
        <div className="shimmer-bar mt-3 h-3 w-full rounded" />
        <div className="shimmer-bar mt-4 h-8 w-40 rounded-xl" />
      </div>
    </div>
  )
}

export default function HomeBriefing({
  items = [],
  loading,
  error,
  lens = null,
  availableLenses = [],
  onLensChange,
  canEdit = false,
}) {
  const reduce = useReducedMotion()
  const [dismissed, setDismissed] = useState(() => new Set())
  const visible = useMemo(() => items.filter((i) => !dismissed.has(i.id)), [items, dismissed])
  const total = visible.length
  const dismiss = (id) => setDismissed((prev) => new Set(prev).add(id))

  const lensControls = lens ? (
    <div className="flex flex-wrap items-center gap-3">
      <LensIndicator lens={lens} />
      <LensSwitcher lens={lens} availableLenses={availableLenses} onChange={onLensChange} />
    </div>
  ) : null

  if (error && items.length === 0 && !loading) return null

  if (loading && items.length === 0) {
    return (
      <section className="no-print space-y-3">
        <div className="shimmer-bar h-5 w-72 rounded" />
        <ItemSkeleton />
        <ItemSkeleton />
      </section>
    )
  }

  if (total === 0) {
    return (
      <section className="no-print space-y-3">
        {lensControls}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card-soft flex items-center gap-4 px-6 py-6"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
            <Sparkles size={26} />
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-xl font-semibold text-navy">You&rsquo;re all caught up.</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              Nothing needs a decision for this period.
            </p>
          </div>
          <BriefMeButton />
        </motion.div>
      </section>
    )
  }

  const crit = visible.filter((i) => i.severity === 'critical').length
  const warn = visible.filter((i) => i.severity === 'warn').length
  const rev = total - crit - warn

  return (
    <section className="no-print space-y-4">
      {lensControls}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
          {greeting()}. {total} thing{total === 1 ? '' : 's'} need{total === 1 ? 's' : ''} your attention.
        </h2>
        <BriefMeButton />
        {/* Severity summary pips */}
        <div className="ml-auto flex items-center gap-3 text-[12.5px] font-semibold">
          {crit > 0 && (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <span className="h-2 w-2 rounded-full bg-danger" /> {crit} critical
            </span>
          )}
          {warn > 0 && (
            <span className="inline-flex items-center gap-1.5 text-gold">
              <span className="h-2 w-2 rounded-full bg-gold" /> {warn} warning{warn === 1 ? '' : 's'}
            </span>
          )}
          {rev > 0 && (
            <span className="inline-flex items-center gap-1.5 text-navy-soft">
              <span className="h-2 w-2 rounded-full bg-navy-soft" /> {rev} to review
            </span>
          )}
        </div>
      </div>
      <motion.div layout className="space-y-4">
        <AnimatePresence initial={false}>
          {visible.map((item, i) => (
            <BriefingItemCard
              key={item.id}
              item={item}
              index={i}
              reduce={reduce}
              canEdit={canEdit}
              onDismiss={dismiss}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  )
}
