// Feature-gateway tiles for the home command center — the navigation showcase.
// Four large, animated, keyboard-accessible Link cards to the app's areas, each
// with an icon, title, short description, and a cheap live stat. Strictly
// navy/gold (card-soft + gold accents), framer-motion staggered entrance + hover
// lift, all reduced-motion gated.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { FileStack, BarChart3, ShieldCheck, Settings, ArrowRight } from 'lucide-react'

function GatewayTile({ to, title, description, stat, index, icon }) {
  const reduce = useReducedMotion()
  const Icon = icon
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 240, damping: 22 }}
      whileHover={reduce ? undefined : { y: -4 }}
    >
      <Link
        to={to}
        className="card-flashy group flex h-full flex-col p-4 outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:p-5"
      >
        <div className="flex items-center justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold transition-colors group-hover:bg-gold-gradient group-hover:text-white sm:h-11 sm:w-11">
            <Icon size={20} />
          </span>
          <ArrowRight
            size={18}
            className="text-muted/50 transition-all group-hover:translate-x-0.5 group-hover:text-gold"
          />
        </div>
        <h3 className="mt-2.5 font-serif text-[15px] font-semibold leading-tight text-navy sm:mt-4 sm:text-lg">{title}</h3>
        <p className="mt-1 hidden flex-1 text-[13px] leading-relaxed text-muted sm:block">{description}</p>
        {stat && (
          <p className="mt-2 border-t border-rule/50 pt-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-gold sm:mt-3 sm:pt-3 sm:text-[12px] sm:tracking-[0.06em]">
            {stat}
          </p>
        )}
      </Link>
    </motion.div>
  )
}

export default function FeatureGateway({
  savedPeriodCount,
  metricCount,
  complianceSummary,
  billing,
}) {
  const complianceStat = complianceSummary
    ? complianceSummary.requiresAup
      ? 'AUP required'
      : `${complianceSummary.counts?.material ?? 0} material · ${
          complianceSummary.counts?.reportable ?? 0
        } reportable`
    : null

  const billingStat = billing
    ? billing.status === 'trialing'
      ? typeof billing.daysLeft === 'number'
        ? `${billing.daysLeft} days left in trial`
        : 'Free trial'
      : billing.status === 'active'
        ? 'Active subscription'
        : `Status: ${billing.status}`
    : null

  const tiles = [
    {
      to: '/statements',
      icon: FileStack,
      title: 'Statements & Periods',
      description: 'Upload a trial balance, generate the four financial statements, and reopen any saved period.',
      stat:
        savedPeriodCount != null
          ? `${savedPeriodCount} saved period${savedPeriodCount === 1 ? '' : 's'}`
          : null,
    },
    {
      to: '/analytics',
      icon: BarChart3,
      title: 'Analytics',
      description: 'Financial-health metrics, trends, revenue/expense mix, and AI insights at a glance.',
      stat: metricCount != null && metricCount > 0 ? `${metricCount} metrics tracked` : null,
    },
    {
      to: '/readiness',
      icon: ShieldCheck,
      title: 'Review Readiness',
      description: 'AUP checks, reconciliation, corrective action plan, and workpapers for review.',
      stat: complianceStat,
    },
    {
      to: '/settings',
      icon: Settings,
      title: 'Settings',
      description: 'Manage your team, school profile, organization, and subscription billing.',
      stat: billingStat,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <GatewayTile key={t.to} index={i} {...t} />
      ))}
    </div>
  )
}
