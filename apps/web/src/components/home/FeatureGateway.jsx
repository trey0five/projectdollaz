// Feature-gateway tiles for the home command center — the navigation showcase.
// Premium UI P4: four `Tile`s (the one card family that stays): hairline, a 2px
// hue rule, the flood rising once on hover while the arrow slides. Each carries
// a cheap live stat in its foot. Keyboard: each tile is a real <Link>.
import { motion, useReducedMotion } from 'framer-motion'
import { FileStack, BarChart3, ShieldCheck, Settings } from 'lucide-react'
import Tile from '../ui/surface/Tile.jsx'

function GatewayTile({ to, title, description, stat, index, icon }) {
  const reduce = useReducedMotion()
  const Icon = icon
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.04, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="flex"
    >
      <Tile
        to={to}
        className="w-full"
        icon={<Icon aria-hidden="true" strokeWidth={1.6} />}
        title={title}
        body={<span className="hidden sm:inline">{description}</span>}
        foot={stat ? <span className="text-[12.5px] font-semibold tabular-nums text-ink2">{stat}</span> : null}
      />
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
