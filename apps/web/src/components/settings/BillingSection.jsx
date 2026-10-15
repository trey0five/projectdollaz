// Billing settings (Phase 1D). Owners see the current plan/status, trial days
// left, Subscribe (Monthly / Yearly) and Manage-billing controls. Accountants /
// viewers see the same status read-only. Handles the return from Checkout
// (?checkout=success|cancel) by refreshing status. The Membership Modules
// manager below lets owners unlock sellable modules instantly (pre-Stripe stub).
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useSearchParams } from 'react-router-dom'
import { CreditCard, Check, AlertTriangle, Loader2, ExternalLink, Lock, Plus } from 'lucide-react'
import { useBilling } from '../../context/BillingContext.jsx'
import { apiErrorMessage } from '../../lib/api.js'
import { SELLABLE_MODULE_KEYS, MODULE_META } from '../../lib/modules.js'
import { Pill } from '../ui/surface/index.js'
import { TILE_BY_KEY } from '../home/tileRegistry.jsx'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'
import UnlockCelebration from './UnlockCelebration.jsx'

const STATUS_META = {
  trialing: { label: 'Trial', cls: 'bg-ink/[0.04] text-ink' },
  active: { label: 'Active', cls: 'bg-white text-ink' },
  past_due: { label: 'Past due', cls: 'bg-white text-ink' },
  canceled: { label: 'Canceled', cls: 'bg-white text-ink' },
  none: { label: 'Inactive', cls: 'bg-ink/[0.06] text-ink2' },
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.none
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold uppercase tracking-wide ${meta.cls}`}
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

// Membership Modules manager — one card per sellable module: art/hue from the
// HOME tile registry, serif label from MODULE_META, the tile tagline as the
// one-line benefit. Owners get an instant "Add module" button; everyone else
// sees the same state read-only ("Owner can add").
//
// PRE-STRIPE STUB — "Add module" calls the free unlock endpoint
// (POST /billing/modules); when per-module Stripe billing ships this handler
// becomes startModuleCheckout([key]) and unlock happens on the webhook; the
// card UI stays identical.
function ModulesManager({ onUnlocked }) {
  const { hasModule, unlockModule, isOwner, entitled } = useBilling()
  const [busyKey, setBusyKey] = useState('') // '' | ModuleKey being unlocked
  const [err, setErr] = useState('')
  const rootRef = useRef(null)
  const { hash } = useLocation()

  // Deep link: /settings/billing#modules scrolls the section into view.
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (hash === '#modules' && !scrolledRef.current) {
      scrolledRef.current = true
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hash])

  const add = async (key) => {
    if (busyKey) return
    setErr('')
    setBusyKey(key)
    try {
      await unlockModule(key)
      onUnlocked(key)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not add the module.'))
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div ref={rootRef} id="membership-modules" className="mt-8 border-t border-hair/[0.18] pt-6">
      <h3 className="text-heading font-semibold text-ink">Modules</h3>
      <p className="mt-1 text-small text-ink2">
        Your plan includes Core and Finance. Add the modules your school needs — they unlock
        instantly.
      </p>

      {/* Premium UI P4: a ruled list (one row per module — its art, its name
          and benefit, then the state), not a wall of tinted cards. The module
          hue lives only in the art and a 2px rule on the left of the row. */}
      <ul className="mt-4 border-t border-hair">
        {SELLABLE_MODULE_KEYS.map((key) => {
          const tile = TILE_BY_KEY[key]
          if (!tile) return null
          const { hue, Art, tagline } = tile
          const label = MODULE_META[key]?.label ?? key
          const unlocked = hasModule(key)
          const busy = busyKey === key
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair py-3 pl-3" style={{ boxShadow: `inset 2px 0 0 ${hue}` }}>
              <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center">
                <Art width={26} height={26} />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-[14px] font-semibold leading-snug text-ink">{label}</h4>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink2">{tagline}</p>
              </div>
              <div className="shrink-0">
                {unlocked ? (
                  <Pill variant="status" tone="good">
                    Unlocked
                  </Pill>
                ) : !entitled ? (
                  // Expired trial / canceled sub: hasModule() is false for everything,
                  // so without this branch every row (finance included) would offer
                  // "Add module" that can't take effect. Subscription comes first.
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink2">
                    <Lock size={12} aria-hidden="true" /> Subscribe to add modules
                  </span>
                ) : isOwner ? (
                  <button type="button" onClick={() => add(key)} disabled={!!busyKey} className="btn btn-secondary btn-sm">
                    {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                    Add module
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink2">
                    <Lock size={12} aria-hidden="true" /> Owner can add
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {err && (
        <div className="mt-4">
          <FormError>{err}</FormError>
        </div>
      )}
    </div>
  )
}

export default function BillingSection() {
  const { billing, loading, error, isOwner, startCheckout, openPortal, refresh } = useBilling()
  const [busy, setBusy] = useState('') // '' | 'monthly' | 'yearly' | 'portal'
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [celebrateKey, setCelebrateKey] = useState('') // module just unlocked → celebration
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
        <div className="flex items-center gap-2 text-[16px] text-ink2">
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
          <dt className="text-[14px] font-semibold uppercase tracking-[0.14em] text-ink2">
            Plan
          </dt>
          <dd className="mt-1 text-[16px] font-semibold capitalize text-ink">
            {plan || (isTrial ? 'Free trial' : '—')}
          </dd>
        </div>
        <div>
          <dt className="text-[14px] font-semibold uppercase tracking-[0.14em] text-ink2">
            {isTrial ? 'Trial ends' : 'Renews / ends'}
          </dt>
          <dd className="mt-1 text-[16px] font-semibold text-ink">
            {fmtDate(isTrial ? trialEnd : currentPeriodEnd)}
            {typeof daysLeft === 'number' && (
              <span className="ml-2 text-[15px] font-normal text-ink2">
                ({daysLeft} day{daysLeft === 1 ? '' : 's'} left)
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Entitlement notice */}
      {isEntitled ? (
        isTrial && (
          <div className="mb-5 flex items-start gap-2 rounded-lg bg-ink/[0.04] px-4 py-3 text-[15px] text-ink">
            <Check size={16} className="mt-0.5 shrink-0 text-ink2" />
            <span>
              Core and Finance are included during your trial
              {typeof daysLeft === 'number' ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining)` : ''}
              {' — add more modules below.'}
              {isOwner ? ' Subscribe to keep generating statements after it ends.' : ''}
            </span>
          </div>
        )
      ) : (
        <div className="b2-callout b2-risk mb-5">
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
            className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
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
            className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
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
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[8px] border border-hair/[0.18] px-5 py-2 text-[15px] font-semibold text-ink transition-colors hover:border-hair/[0.3] disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Membership Modules manager — ALL roles see module state; only owners
          get the Add button. Unlocking fires the celebration below. */}
      <ModulesManager onUnlocked={setCelebrateKey} />
      <UnlockCelebration moduleKey={celebrateKey} onClose={() => setCelebrateKey('')} />
    </SettingsCard>
  )
}
