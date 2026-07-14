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
import { TILE_BY_KEY } from '../home/tileRegistry.jsx'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'
import UnlockCelebration from './UnlockCelebration.jsx'

// Page-less modules — no page of their own; their value surfaces inside
// Analytics and the briefing (mirrors tileRegistry's route:null contract).
const PAGE_LESS = new Set(['hr', 'planning'])

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
    <div ref={rootRef} id="membership-modules" className="mt-8 border-t border-border pt-6">
      <h3 className="font-serif text-[19px] font-semibold text-navy">Modules</h3>
      <p className="mt-1 text-[15px] text-muted">
        Your plan includes Core and Finance. Add the modules your school needs — they unlock
        instantly.
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SELLABLE_MODULE_KEYS.map((key) => {
          const tile = TILE_BY_KEY[key]
          if (!tile) return null
          const { hue, Art, tagline } = tile
          const label = MODULE_META[key]?.label ?? key
          const unlocked = hasModule(key)
          const busy = busyKey === key
          return (
            <li
              key={key}
              className="flex h-full flex-col gap-3 rounded-xl border border-border bg-white px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
                  style={{ background: `color-mix(in srgb, ${hue} 12%, white)`, color: hue }}
                >
                  <Art width={28} height={28} />
                </span>
                <div className="min-w-0">
                  <h4 className="font-serif text-[16px] font-semibold leading-snug text-navy">
                    {label}
                  </h4>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">{tagline}</p>
                  {PAGE_LESS.has(key) && (
                    <p className="mt-1 text-[12px] italic text-muted/80">
                      Lives inside Analytics and your briefing.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-auto">
                {unlocked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12.5px] font-semibold text-emerald-700">
                    <Check size={12} /> Unlocked
                  </span>
                ) : !entitled ? (
                  // Expired trial / canceled sub: hasModule() is false for everything,
                  // so without this branch every card (finance included) would offer
                  // "Add module" that can't take effect. Subscription comes first.
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
                    <Lock size={12} /> Subscribe to add modules
                  </span>
                ) : isOwner ? (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => add(key)}
                    disabled={!!busyKey}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border-[1.5px] px-4 py-1 text-[12.5px] font-bold uppercase tracking-[0.06em] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      borderColor: `color-mix(in srgb, ${hue} 60%, transparent)`,
                      color: hue,
                    }}
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Add module
                  </motion.button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
                    <Lock size={12} /> Owner can add
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
        <div className="flex items-center gap-2 text-[16px] text-muted">
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
          <dt className="text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
            Plan
          </dt>
          <dd className="mt-1 text-[16px] font-semibold capitalize text-navy">
            {plan || (isTrial ? 'Free trial' : '—')}
          </dd>
        </div>
        <div>
          <dt className="text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
            {isTrial ? 'Trial ends' : 'Renews / ends'}
          </dt>
          <dd className="mt-1 text-[16px] font-semibold text-navy">
            {fmtDate(isTrial ? trialEnd : currentPeriodEnd)}
            {typeof daysLeft === 'number' && (
              <span className="ml-2 text-[15px] font-normal text-muted">
                ({daysLeft} day{daysLeft === 1 ? '' : 's'} left)
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Entitlement notice */}
      {isEntitled ? (
        isTrial && (
          <div className="mb-5 flex items-start gap-2 rounded-lg bg-gold/10 px-4 py-3 text-[15px] text-navy">
            <Check size={16} className="mt-0.5 shrink-0 text-gold" />
            <span>
              Core and Finance are included during your trial
              {typeof daysLeft === 'number' ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining)` : ''}
              {' — add more modules below.'}
              {isOwner ? ' Subscribe to keep generating statements after it ends.' : ''}
            </span>
          </div>
        )
      ) : (
        <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-[15px] text-red-700">
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
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-border px-5 py-2 text-[15px] font-semibold text-navy transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
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
