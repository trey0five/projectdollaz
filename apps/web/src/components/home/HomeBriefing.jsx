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
import { Link } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, ArrowRight, Sparkles } from 'lucide-react'
import { LensIndicator, LensSwitcher } from './LensControls.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
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

function BriefingItemCard({ item, index, reduce }) {
  const theme = SEVERITY[item.severity] ?? SEVERITY.info
  const { Icon } = theme
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.05 }}
    >
      <Link
        to={item.link}
        className={`group flex items-stretch gap-0 overflow-hidden rounded-2xl border ${theme.border} ${theme.tint} shadow-card transition-all hover:shadow-glow`}
      >
        <span className={`w-1.5 shrink-0 ${theme.rail}`} aria-hidden />
        <div className="flex flex-1 items-start gap-4 px-5 py-4">
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
        </div>
      </Link>
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
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">
              You&rsquo;re all caught up.
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              No metrics, readiness gaps, or data issues need your attention for this period.
            </p>
          </div>
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
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <BriefingItemCard key={item.id} item={item} index={i} reduce={reduce} />
        ))}
      </div>
    </section>
  )
}
