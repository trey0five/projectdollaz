// Trial / entitlement banner (Phase 1D). During an active trial it shows
// "X days left in trial". When entitlement has lapsed (expired trial / past_due
// / canceled / none) it shows a clear gate explaining generation is paused and
// links the owner to subscribe. Hidden when active & not in trial.
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock } from 'lucide-react'
import { useBilling } from '../context/BillingContext.jsx'

export default function BillingBanner() {
  const { billing, loading, isOwner } = useBilling()
  if (loading || !billing) return null

  const { status, daysLeft, isEntitled } = billing
  const isTrial = status === 'trialing'

  // Lapsed entitlement → blocking gate banner.
  if (!isEntitled) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="no-print border-b border-red-200 bg-red-50"
        >
          <div className="mx-auto flex w-full max-w-[980px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div className="flex items-start gap-2 text-[15px] font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Generation is paused — your{' '}
                {status === 'past_due' ? 'payment is past due' : 'trial has ended'}.
                {isOwner
                  ? ' Subscribe to resume generating statements.'
                  : ' Ask an owner to subscribe.'}
              </span>
            </div>
            <Link
              to="/settings/billing"
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-[14px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-700"
            >
              {isOwner ? 'Subscribe now' : 'View billing'}
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  // Active trial → informational countdown.
  if (isTrial) {
    return (
      <div className="no-print border-b border-gold/30 bg-gold/10">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="flex items-center gap-2 text-[15px] font-medium text-navy">
            <Clock size={15} className="shrink-0 text-gold" />
            <span>
              {typeof daysLeft === 'number'
                ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial`
                : 'You are on a free trial'}
            </span>
          </div>
          {isOwner && (
            <Link
              to="/settings/billing"
              className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg border border-gold/50 px-3 py-1.5 text-[14px] font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold/20"
            >
              Subscribe
            </Link>
          )}
        </div>
      </div>
    )
  }

  return null
}
