import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useBilling } from '../../context/BillingContext.jsx'
import { MODULE_META } from '../../lib/modules.js'

/**
 * Friendly paused/subscribe state — reuses the BillingBanner red-50 gate motif.
 * Never surfaces a raw 402. Owner -> Subscribe; non-owner -> View billing.
 *
 * Optional `module` prop (e.g. from a MODULE_NOT_LICENSED 402): when set, renders
 * a DISTINCT "add this module" state instead of the "subscribe" copy. Dormant
 * today — no route emits MODULE_NOT_LICENSED for real users (everything is
 * finance and every entitled school has it).
 */
export default function EntitlementPausedPanel({ module = null }) {
  const { billing, isOwner } = useBilling()
  const status = billing?.status

  if (module) {
    const label = MODULE_META[module]?.label ?? module
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto mt-10 max-w-[640px] rounded-2xl border-2 border-gold/40 bg-amber-50 px-6 py-10 text-center shadow-card"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertTriangle size={26} />
        </span>
        <h2 className="mt-4 font-serif text-xl font-semibold text-navy">
          {label} isn&apos;t on your plan yet
        </h2>
        <p className="mt-2 text-[16px] text-amber-800">
          The {label} module isn&apos;t included on your current plan.{' '}
          {isOwner
            ? `Add the ${label} module to unlock this.`
            : `Ask an owner to add the ${label} module.`}
        </p>
        <Link
          to="/settings/billing"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-navy px-6 py-2.5 text-[15px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-navy/90"
        >
          {isOwner ? `Add ${label}` : 'View billing'}
        </Link>
      </motion.div>
    )
  }

  const reason = status === 'past_due' ? 'your payment is past due' : 'your trial has ended'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-10 max-w-[640px] rounded-2xl border-2 border-red-200 bg-red-50 px-6 py-10 text-center shadow-card"
    >
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
        <AlertTriangle size={26} />
      </span>
      <h2 className="mt-4 font-serif text-xl font-semibold text-navy">
        Insights are paused
      </h2>
      <p className="mt-2 text-[16px] text-red-700">
        Financial insights are paused because {reason}.{' '}
        {isOwner
          ? 'Subscribe to unlock your dashboard again.'
          : 'Ask an owner to subscribe to unlock the dashboard.'}
      </p>
      <Link
        to="/settings/billing"
        className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-600 px-6 py-2.5 text-[15px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-700"
      >
        {isOwner ? 'Subscribe now' : 'View billing'}
      </Link>
    </motion.div>
  )
}
