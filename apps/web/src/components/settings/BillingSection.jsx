// Billing settings (Phase 1D). Owners see the current plan/status, trial days
// left, Subscribe (Monthly / Yearly) and Manage-billing controls. Accountants /
// viewers see the same status read-only. Handles the return from Checkout
// (?checkout=success|cancel) by refreshing status.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, Check, AlertTriangle, Loader2, ExternalLink } from 'lucide-react'
import { useBilling } from '../../context/BillingContext.jsx'
import { apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

const STATUS_META = {
  trialing: { label: 'Trial', cls: 'bg-gold/15 text-navy' },
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
  past_due: { label: 'Past due', cls: 'bg-amber-50 text-amber-700' },
  canceled: { label: 'Canceled', cls: 'bg-red-50 text-red-700' },
  none: { label: 'Inactive', cls: 'bg-navy/[0.06] text-muted' },
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.none
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-wide ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function BillingSection() {
  const { billing, loading, error, isOwner, startCheckout, openPortal, refresh } = useBilling()
  const [busy, setBusy] = useState('') // '' | 'monthly' | 'yearly' | 'portal'
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [params, setParams] = useSearchParams()

  // Handle the Checkout return once (render-time transition — no setState-in-effect).
  const [handledReturn, setHandledReturn] = useState(false)
  const checkoutResult = params.get('checkout')
  if (checkoutResult && !handledReturn) {
    setHandledReturn(true)
    if (checkoutResult === 'success') {
      setOk('Subscription updated — thank you! Your status will refresh shortly.')
      refresh()
    } else if (checkoutResult === 'cancel') {
      setErr('Checkout was canceled. You can subscribe any time.')
    }
    // Clear the query param so a refresh doesn't re-trigger.
    params.delete('checkout')
    setParams(params, { replace: true })
  }

  const doCheckout = async (plan) => {
    if (busy) return
    setErr('')
    setOk('')
    setBusy(plan)
    try {
      await startCheckout(plan)
      // On success the browser redirects; if it doesn't, the key is missing.
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not start checkout. A Stripe key may be required.'))
    } finally {
      setBusy('')
    }
  }

  const doPortal = async () => {
    if (busy) return
    setErr('')
    setOk('')
    setBusy('portal')
    try {
      await openPortal()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not open the billing portal.'))
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <SettingsCard title="Billing">
        <div className="flex items-center gap-2 text-[14px] text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading billing status…
        </div>
      </SettingsCard>
    )
  }

  if (error || !billing) {
    return (
      <SettingsCard title="Billing">
        <FormError>{error || 'Billing status unavailable.'}</FormError>
      </SettingsCard>
    )
  }

  const { status, plan, trialEnd, currentPeriodEnd, daysLeft, isEntitled } = billing
  const isTrial = status === 'trialing'
  const hasCustomer = status === 'active' || status === 'past_due' || status === 'canceled'

  return (
    <SettingsCard
      title="Billing & subscription"
      description={
        isOwner
          ? 'Manage your plan, trial, and payment method.'
          : 'Read-only — only an owner can change the subscription.'
      }
      action={<StatusPill status={status} />}
    >
      {/* Current state summary */}
      <dl className="mb-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
            Plan
          </dt>
          <dd className="mt-1 text-[15px] font-semibold capitalize text-navy">
            {plan || (isTrial ? 'Free trial' : '—')}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
            {isTrial ? 'Trial ends' : 'Renews / ends'}
          </dt>
          <dd className="mt-1 text-[15px] font-semibold text-navy">
            {fmtDate(isTrial ? trialEnd : currentPeriodEnd)}
            {typeof daysLeft === 'number' && (
              <span className="ml-2 text-[13px] font-normal text-muted">
                ({daysLeft} day{daysLeft === 1 ? '' : 's'} left)
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Entitlement notice */}
      {isEntitled ? (
        isTrial && (
          <div className="mb-5 flex items-start gap-2 rounded-lg bg-gold/10 px-4 py-3 text-[13px] text-navy">
            <Check size={16} className="mt-0.5 shrink-0 text-gold" />
            <span>
              You have full access during your trial
              {typeof daysLeft === 'number' ? ` — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : ''}.
              {isOwner ? ' Subscribe below to keep generating statements after it ends.' : ''}
            </span>
          </div>
        )
      ) : (
        <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Statement generation is paused.{' '}
            {isOwner
              ? 'Subscribe to resume generating and importing statements.'
              : 'Ask an owner to subscribe to resume generating statements.'}
          </span>
        </div>
      )}

      {err && <FormError>{err}</FormError>}
      {ok && <FormSuccess>{ok}</FormSuccess>}

      {/* Owner-only actions */}
      {isOwner && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => doCheckout('monthly')}
            disabled={!!busy}
            className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            {busy === 'monthly' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CreditCard size={15} />
            )}
            Subscribe — Monthly
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => doCheckout('yearly')}
            disabled={!!busy}
            className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            {busy === 'yearly' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CreditCard size={15} />
            )}
            Subscribe — Yearly
          </motion.button>
          {hasCustomer && (
            <button
              type="button"
              onClick={doPortal}
              disabled={!!busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-border px-5 py-2 text-[13px] font-semibold text-navy transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'portal' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ExternalLink size={15} />
              )}
              Manage billing
            </button>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
