// ─────────────────────────────────────────────────────────────────────────────
// HomeBriefing — the LEAD panel of HomeDashboard. Turns Home from a vitals
// dashboard into a prioritised, advisory briefing: "Good morning. N things need
// your attention." Renders the server-RANKED AttentionItem[] (never re-sorts) as
// severity-accented cards, each with its plain-language `why` and a react-router
// CTA to item.link. Zero items => the all-caught-up empty state. Read-only,
// no-print, navy/gold theme (flashy but on-theme). Fail-soft: on error with no
// items it renders nothing so a briefing hiccup never blocks the vitals below.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, ArrowRight, Sparkles, ListPlus } from 'lucide-react'
import { LensIndicator, LensSwitcher } from './LensControls.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// One-click "ask Penny to narrate this briefing". Dispatches the SAME
// 'penny:ai-ask' CustomEvent usePennyChat listens for — the hook opens the panel
// AND routes this canned prompt through its existing send() streaming path, so
// Penny calls get_briefing and reads back the identical ranked list shown here.
function askPennyToBrief() {
  window.dispatchEvent(
    new CustomEvent('penny:ai-ask', {
      detail: { text: 'Brief me on what needs my attention.' },
    }),
  )
}

// Gold-accent "Brief me" pill. Reduced-motion safe (plain button, no entrance
// animation) and on the navy/gold theme, matching the Sparkles bubble CTAs.
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

// Per-severity theming — navy/gold/danger, consistent with ValidationBanner and
// the DataHubBanner gold language. Each carries an accent rail + tint + icon.
const SEVERITY = {
  critical: {
    Icon: AlertTriangle,
    rail: 'bg-danger',
    tint: 'bg-[#fdeeee]',
    border: 'border-[#e0a0a0]',
    iconWrap: 'bg-danger/10 text-danger',
  },
  warn: {
    Icon: AlertCircle,
    rail: 'bg-gold',
    tint: 'bg-[#fff8e6]',
    border: 'border-[#e8c96a]',
    iconWrap: 'bg-gold/15 text-gold',
  },
  info: {
    Icon: Info,
    rail: 'bg-navy/40',
    tint: 'bg-navy/[0.04]',
    border: 'border-rule',
    iconWrap: 'bg-navy/10 text-navy',
  },
}

const CTA_LABEL = {
  metric: 'Open analytics',
  compliance: 'Open readiness',
  data: 'Go to Data hub',
}

// Map a briefing item.source (metric|compliance|data|governance|workflow) to a
// valid TASK_SOURCE_TYPE (manual|policy|metric|compliance). governance→policy,
// data/workflow→manual — otherwise the create-task DTO @IsIn would 400.
const TASK_SOURCE_MAP = {
  metric: 'metric',
  compliance: 'compliance',
  governance: 'policy',
  data: 'manual',
  workflow: 'manual',
}

// Scope × Lens: the board (governance voice) is read-only — never hand it an
// imperative "go fix" CTA. When item.voice==='governance' the CTA reads as a
// review prompt; otherwise fall back to the source-based operator label.
function ctaLabel(item) {
  if (item.voice === 'governance') return 'Review with leadership'
  return CTA_LABEL[item.source] ?? 'Take a look'
}

function fmtDue(iso) {
  // iso is yyyy-mm-dd; render as a short, locale-safe date with no tz drift.
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function BriefingItemCard({ item, index, reduce, canEdit }) {
  const theme = SEVERITY[item.severity] ?? SEVERITY.info
  const { Icon } = theme
  const navigate = useNavigate()

  // "Create task" — the actionable pairing: turn a briefing attention item into a
  // pre-filled, assignable task on /tasks (mirrors GovernancePage.createTaskFromPolicy).
  // Rendered as a sibling of the card Link (never nested inside the <a>) so it does
  // NOT trigger the card's navigation. Due date is seeded ONLY when the item's own
  // dueDate is still in the FUTURE (a fresh task's due date is a new decision, so a
  // past date would open the modal already-overdue) — otherwise blank.
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

  // Governance items address a board/read-only audience — frame the label as a
  // review prompt, not an imperative (mirrors ctaLabel's governance handling).
  const taskLabel = item.voice === 'governance' ? 'Create review task' : 'Create task'

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.05 }}
      className={`group overflow-hidden rounded-2xl border ${theme.border} ${theme.tint} shadow-card transition-all hover:shadow-glow`}
    >
      <div className="flex items-stretch gap-0">
        <span className={`w-1.5 shrink-0 ${theme.rail}`} aria-hidden />
        <div className="flex flex-1 flex-col">
          <Link to={item.link} className="flex items-start gap-4 px-5 pt-4 pb-2">
            <span
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.iconWrap}`}
            >
              <Icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-navy">{item.title}</p>
                {item.dueDate && (
                  <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[12px] font-semibold text-navy">
                    Due {fmtDue(item.dueDate)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{item.why}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-gold">
                {ctaLabel(item)}
                <ArrowRight
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </div>
          </Link>
          {/* Secondary action row — kept OUTSIDE the card Link (nested interactive in
              an <a> is invalid) so "Create task" never triggers the card nav. */}
          {canEdit && (
            <div className="flex items-center justify-end px-5 pb-3">
              <button
                type="button"
                onClick={createTaskFromItem}
                aria-label={`${taskLabel} for ${item.title}`}
                title="Turn this into an assignable task"
                className="inline-flex items-center gap-1.5 rounded-full border border-navy/15 bg-white/60 px-3 py-1 text-[12px] font-semibold text-navy/60 transition-colors hover:border-gold/50 hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <ListPlus size={13} />
                {taskLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function ItemSkeleton() {
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border border-rule bg-white shadow-card">
      <span className="w-1.5 shrink-0 shimmer-bar" aria-hidden />
      <div className="flex flex-1 items-start gap-4 px-5 py-4">
        <div className="h-10 w-10 shrink-0 rounded-xl shimmer-bar" />
        <div className="flex-1">
          <div className="shimmer-bar h-3 w-40 rounded" />
          <div className="shimmer-bar mt-3 h-3 w-full rounded" />
          <div className="shimmer-bar mt-2 h-3 w-2/3 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function HomeBriefing({
  items = [],
  summary,
  loading,
  error,
  lens = null,
  availableLenses = [],
  onLensChange,
  canEdit = false,
}) {
  const reduce = useReducedMotion()
  const total = summary?.total ?? items.length

  // Scope × Lens chrome — shown whenever the server told us the active lens.
  const lensControls = lens ? (
    <div className="flex flex-wrap items-center gap-3">
      <LensIndicator lens={lens} />
      <LensSwitcher lens={lens} availableLenses={availableLenses} onChange={onLensChange} />
    </div>
  ) : null

  // Fail-soft: a briefing error with nothing to show must never block the page.
  if (error && items.length === 0 && !loading) return null

  // Loading: light skeleton rows so the lead doesn't pop in.
  if (loading && items.length === 0) {
    return (
      <section className="no-print space-y-3">
        <div className="shimmer-bar h-5 w-72 rounded" />
        <ItemSkeleton />
        <ItemSkeleton />
      </section>
    )
  }

  // Empty: the all-caught-up state.
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
            <h2 className="font-serif text-xl font-semibold text-navy">
              You&rsquo;re all caught up.
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              No metrics, readiness gaps, or data issues need your attention for this period.
            </p>
          </div>
          <BriefMeButton />
        </motion.div>
      </section>
    )
  }

  return (
    <section className="no-print space-y-3">
      {lensControls}
      <div className="flex items-center gap-3">
        <h2 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
          {greeting()}. {total} thing{total === 1 ? '' : 's'} need{total === 1 ? 's' : ''} your
          attention.
        </h2>
        <span
          className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-gold/70 shadow-[0_0_8px_rgba(184,150,80,0.5)]"
          aria-hidden
        />
        <BriefMeButton />
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <BriefingItemCard key={item.id} item={item} index={i} reduce={reduce} canEdit={canEdit} />
        ))}
      </div>
    </section>
  )
}
