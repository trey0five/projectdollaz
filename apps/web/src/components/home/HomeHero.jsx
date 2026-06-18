// Hero / context band for the home command center. Navy-gradient card with a
// welcome line, the active school name, a period selector (saved periods), a
// one-line status/insight summary (composed from the analytics insight text with
// a compliance fallback), and a trial/subscription chip from useBilling.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Sparkles, Clock, BadgeCheck, Activity } from 'lucide-react'
import PeriodSelector from '../analytics/PeriodSelector.jsx'

// Severity-coded "signal board": each insight point is a tagged row (Risk / Watch
// / Strength) with a colored marker — a finance-cockpit readout rather than a
// paragraph. LLM output is tagged lines ("[RISK] …"); the rule-based fallback is a
// paragraph, split into neutral points.
const SIGNAL_META = {
  risk: { dot: 'bg-red-400', label: 'text-red-300', name: 'Risk' },
  watch: { dot: 'bg-gold', label: 'text-gold-light', name: 'Watch' },
  strength: { dot: 'bg-emerald-400', label: 'text-emerald-300', name: 'Strength' },
  neutral: { dot: 'bg-white/45', label: 'text-white/55', name: '•' },
}

const CAT_RE = /^[[(]?\s*(risk|watch|strength|strong|opportunity|good|ok)\b\s*[\])\-:.–—]*\s*/i

function toSignals(text) {
  if (!text) return []
  let items = text.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (items.length <= 1) {
    items = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  }
  return items
    .slice(0, 5)
    .map((raw) => {
      let t = raw.replace(/^[-•*]\s*/, '')
      const m = t.match(CAT_RE)
      let category = 'neutral'
      if (m) {
        const k = m[1].toLowerCase()
        category = k === 'risk' ? 'risk' : k === 'watch' ? 'watch' : 'strength'
        t = t.slice(m[0].length)
      }
      return { category, text: t.replace(/\s+/g, ' ').trim() }
    })
    .filter((s) => s.text)
}

function InsightBand({ statusLine, kind, reduce }) {
  // Compliance fallback / empty — a plain status row, no AI claim.
  if (!kind) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70">
          <Activity size={15} />
        </span>
        <p className="text-[14px] leading-relaxed text-white/85">{statusLine}</p>
      </div>
    )
  }
  const isAi = kind === 'llm'
  const signals = toSignals(statusLine)
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-deep/40 px-4 py-3">
      <div className="mb-2.5 flex items-center gap-2 border-b border-white/10 pb-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gold-gradient text-navy">
          <Sparkles size={13} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-light">
          {isAi ? 'AI Insight' : 'Smart Insight'}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
          {signals.length} signal{signals.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="space-y-2">
        {signals.map((s, i) => {
          const m = SIGNAL_META[s.category] ?? SIGNAL_META.neutral
          return (
            <motion.li
              key={i}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.09, duration: 0.3 }}
              className="grid grid-cols-[84px_1fr] items-start gap-x-3"
            >
              <span className="flex items-center gap-1.5 pt-[3px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                <span className={`font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${m.label}`}>
                  {m.name}
                </span>
              </span>
              <span className="text-[13.5px] leading-snug text-white/90">{s.text}</span>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}

function TrialChip({ billing, isOwner }) {
  if (!billing) return null
  const { status, daysLeft } = billing
  if (status === 'trialing') {
    return (
      <Link
        to={isOwner ? '/settings/billing' : '/settings'}
        className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light transition-colors hover:border-gold/70"
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light">
        <BadgeCheck size={12} /> Active subscription
      </span>
    )
  }
  return (
    <Link
      to={isOwner ? '/settings/billing' : '/settings'}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 transition-colors hover:border-gold/50"
    >
      {isOwner ? 'Manage billing' : 'View billing'}
    </Link>
  )
}

export default function HomeHero({
  schoolName,
  periods,
  selectedPeriodId,
  onSelectPeriod,
  statusLine,
  insightKind = null,
  billing,
  isOwner,
}) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-8"
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-gold/80">
              Command Center
            </p>
            <h1 className="mt-1 font-serif text-xl font-semibold leading-tight text-white sm:text-[28px]">
              Welcome back to{' '}
              <span className="gold-text">{schoolName || 'your school'}</span>
            </h1>
          </div>
          <TrialChip billing={billing} isOwner={isOwner} />
        </div>

        {statusLine && (
          <InsightBand statusLine={statusLine} kind={insightKind} reduce={reduce} />
        )}

        {periods && periods.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              Viewing period
            </span>
            <PeriodSelector periods={periods} activeId={selectedPeriodId} onSelect={onSelectPeriod} />
          </div>
        )}
      </div>
    </motion.section>
  )
}
