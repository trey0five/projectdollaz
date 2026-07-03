// ─────────────────────────────────────────────────────────────────────────────
// HomeCommandCenter — the school-scope Home hero. DISTINCT from the Finance-home
// hero (HomeHero, a finance AI-insight signal board): this is a CROSS-MODULE daily
// briefing that summarises attention across EVERY module on the page (finance,
// governance, facilities, advancement, accreditation, tasks, data) and is LENS-
// aware (the greeting/voice + the lens badge shift with Leadership / Finance /
// Board). Different look, too: a domain-breakdown chip strip + a featured top-
// priority callout, rather than the finance signal list. Derives everything from
// the already-fetched briefing (items/summary/lens) — no new endpoints.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Clock,
  BadgeCheck,
  Sparkles,
  ArrowRight,
  Crown,
  Calculator,
  Users,
  CircleDollarSign,
  Database,
  ListChecks,
  Landmark,
  Wrench,
  HeartHandshake,
} from 'lucide-react'
import PeriodSelector from '../analytics/PeriodSelector.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Lens → badge (dark-friendly) + the verb the cross-module summary uses. The lens
// is server-authoritative; this only shapes the presentation.
const LENS_BADGE = {
  owner: { label: 'Leadership view', Icon: Crown, verb: 'need a decision' },
  accountant: { label: 'Finance view', Icon: Calculator, verb: 'need action' },
  viewer: { label: 'Board view', Icon: Users, verb: 'to review' },
}

// briefing item.source → the top-level module it rolls up to (for the chip strip).
const SOURCE_TO_MODULE = {
  metric: 'finance',
  compliance: 'finance',
  data: 'data',
  workflow: 'workflow',
  governance: 'governance',
  accreditation: 'accreditation',
  facilities: 'facilities',
  advancement: 'advancement',
}

const MODULE_META = {
  finance: { label: 'Finance', Icon: CircleDollarSign, to: '/finance' },
  data: { label: 'Data', Icon: Database, to: '/data' },
  workflow: { label: 'Tasks', Icon: ListChecks, to: '/tasks' },
  governance: { label: 'Governance', Icon: Landmark, to: '/governance' },
  accreditation: { label: 'Accreditation', Icon: BadgeCheck, to: '/accreditation' },
  facilities: { label: 'Facilities', Icon: Wrench, to: '/facilities' },
  advancement: { label: 'Advancement', Icon: HeartHandshake, to: '/advancement' },
}

// Fixed display order for the chips (mirrors the nav order).
const MODULE_ORDER = [
  'finance',
  'governance',
  'accreditation',
  'facilities',
  'advancement',
  'workflow',
  'data',
]

function LensBadge({ lens }) {
  const meta = LENS_BADGE[lens]
  if (!meta) return null
  const { label, Icon } = meta
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.1em] text-gold-light"
      title={`This briefing is shaped for the ${label}.`}
    >
      <Icon size={12} />
      {label}
    </span>
  )
}

function TrialChip({ billing, isOwner }) {
  if (!billing) return null
  const { status, daysLeft } = billing
  if (status === 'trialing') {
    return (
      <Link
        to={isOwner ? '/settings/billing' : '/settings'}
        className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-gold-light transition-colors hover:border-gold/70"
      >
        <Clock size={12} />
        {typeof daysLeft === 'number'
          ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in trial`
          : 'Free trial'}
      </Link>
    )
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-gold-light">
        <BadgeCheck size={12} /> Active subscription
      </span>
    )
  }
  return (
    <Link
      to={isOwner ? '/settings/billing' : '/settings'}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/80 transition-colors hover:border-gold/50"
    >
      {isOwner ? 'Manage billing' : 'View billing'}
    </Link>
  )
}

function askPennyToBrief() {
  window.dispatchEvent(
    new CustomEvent('penny:ai-ask', {
      detail: { text: 'Brief me on what needs my attention across every area today.' },
    }),
  )
}

export default function HomeCommandCenter({
  schoolName,
  periods,
  selectedPeriodId,
  onSelectPeriod,
  items = [],
  summary,
  lens = null,
  billing,
  isOwner,
}) {
  const reduce = useReducedMotion()
  const total = summary?.total ?? items.length
  const critical = summary?.critical ?? items.filter((i) => i.severity === 'critical').length
  const verb = LENS_BADGE[lens]?.verb ?? 'need attention'

  // Roll items up to modules, tracking a per-module count + whether any is critical.
  const modules = []
  const byModule = {}
  for (const it of items) {
    const key = SOURCE_TO_MODULE[it.source] ?? 'finance'
    if (!byModule[key]) {
      byModule[key] = { key, count: 0, critical: false }
      modules.push(key)
    }
    byModule[key].count += 1
    if (it.severity === 'critical') byModule[key].critical = true
  }
  const chips = MODULE_ORDER.filter((k) => byModule[k]).map((k) => byModule[k])
  const areaCount = chips.length
  const top = items[0] || null

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-7"
    >
      {/* Decorative gold glow + a faint corner grid to differ from the finance band. */}
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-navy-soft/20 blur-3xl" />

      <div className="relative flex flex-col gap-5">
        {/* Eyebrow: daily-briefing label + lens badge, trial chip on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 font-sans text-[12.5px] font-bold uppercase tracking-[0.18em] text-gold/80">
              <Sparkles size={13} className="text-gold" /> Daily briefing
            </span>
            <LensBadge lens={lens} />
          </div>
          <TrialChip billing={billing} isOwner={isOwner} />
        </div>

        {/* Headline: greeting + the cross-module summary. */}
        <div>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-white sm:text-[30px]">
            {greeting()} — {total === 0 ? 'you’re all caught up.' : (
              <>
                <span className="gold-text">
                  {total} thing{total === 1 ? '' : 's'}
                </span>{' '}
                {verb}.
              </>
            )}
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-white/70">
            {total === 0 ? (
              <>Nothing needs a decision across {schoolName || 'your school'} right now.</>
            ) : (
              <>
                Across{' '}
                <span className="font-semibold text-white/90">
                  {areaCount} area{areaCount === 1 ? '' : 's'}
                </span>{' '}
                at {schoolName || 'your school'}
                {critical > 0 && (
                  <>
                    {' '}
                    · <span className="font-semibold text-red-300">{critical} critical</span>
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>

        {/* Cross-module chip strip — the "everything on the page" breakdown. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c, i) => {
              const meta = MODULE_META[c.key]
              const Icon = meta.Icon
              return (
                <motion.div
                  key={c.key}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + i * 0.05, duration: 0.3 }}
                >
                  <Link
                    to={meta.to}
                    className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      c.critical
                        ? 'border-red-400/40 bg-red-500/10 text-red-200 hover:border-red-400/70'
                        : 'border-white/15 bg-white/[0.06] text-white/85 hover:border-gold/50 hover:text-white'
                    }`}
                  >
                    <Icon size={14} className={c.critical ? 'text-red-300' : 'text-gold-light'} />
                    {meta.label}
                    <span
                      className={`ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums ${
                        c.critical ? 'bg-red-500/25 text-red-100' : 'bg-white/10 text-white/80'
                      }`}
                    >
                      {c.count}
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Featured top priority — the single most-urgent item, distinct from the
            triage board below (which lists them all). */}
        {top && (
          <Link
            to={top.link || '/'}
            className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-white/12 bg-navy-deep/40 px-4 py-3 transition-colors hover:border-gold/40"
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                top.severity === 'critical'
                  ? 'bg-red-500/20 text-red-300'
                  : top.severity === 'warn'
                    ? 'bg-gold/20 text-gold-light'
                    : 'bg-white/10 text-white/70'
              }`}
            >
              {top.severity === 'critical' && !reduce && (
                <span className="absolute left-4 top-3.5 h-7 w-7 rounded-lg bg-red-500/30 motion-safe:animate-ping" aria-hidden />
              )}
              <Sparkles size={14} className="relative" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold/70">
                Top priority
              </p>
              <p className="truncate font-serif text-[16px] font-semibold text-white">{top.title}</p>
            </div>
            <ArrowRight
              size={16}
              className="mt-1 shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
            />
          </Link>
        )}

        {/* Actions + viewing period. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <button
            type="button"
            onClick={askPennyToBrief}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-2 text-[13px] font-semibold text-navy shadow-glow transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 motion-reduce:hover:translate-y-0"
          >
            <Sparkles size={14} /> Brief me
          </button>
          {periods && periods.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Viewing period
              </span>
              <PeriodSelector periods={periods} activeId={selectedPeriodId} onSelect={onSelectPeriod} />
            </div>
          )}
        </div>
      </div>
    </motion.section>
  )
}
