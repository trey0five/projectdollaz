// Billing settings (Phase 1D). Owners see the current plan/status, trial days
// left, Subscribe (Monthly / Yearly) and Manage-billing controls. Accountants /
// viewers see the same status read-only. Handles the return from Checkout
// (?checkout=success|cancel) by refreshing status.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, Check, AlertTriangle, Loader2, ExternalLink, Lock } from 'lucide-react'
import { useBilling } from '../../context/BillingContext.jsx'
import { useSchools } from '../../context/SchoolContext.jsx'
import { billingApi, apiErrorMessage } from '../../lib/api.js'
import { SELLABLE_MODULE_KEYS, MODULE_META } from '../../lib/modules.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

// Fallback catalog derived from the web module mirror when the server catalog
// field is unavailable (keyless dev still returns it, so this is a safety net).
const FALLBACK_CATALOG = SELLABLE_MODULE_KEYS.map((key) => ({
  key,
  label: MODULE_META[key].label,
  description: MODULE_META[key].description,
  purchasable: false,
}))

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

// Owner-only per-module picker. Pure UI from the catalog + the licensed set; the
// Subscribe button hits the modular checkout (503 STRIPE_NOT_CONFIGURED in keyless
// dev is caught and shown gracefully — the picker itself stays rendered).
function ModulePicker() {
  const { billing, hasModule, startModuleCheckout } = useBilling()
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null

  const [catalog, setCatalog] = useState(FALLBACK_CATALOG)
  const [coreConfigured, setCoreConfigured] = useState(false)
  const [selected, setSelected] = useState(null) // null = not yet seeded
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isTrial = billing?.status === 'trialing'

  // Load the server catalog once (works keyless — pure config/meta).
  useEffect(() => {
    if (!schoolId) return
    let cancelled = false
    billingApi
      .catalog(schoolId)
      .then((res) => {
        if (cancelled) return
        if (Array.isArray(res.data?.modules)) setCatalog(res.data.modules)
        setCoreConfigured(Boolean(res.data?.coreConfigured))
      })
      .catch(() => {
        /* keep fallback catalog; picker still renders */
      })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  // Seed the selection from the currently-licensed set at render time (repo
  // convention: no setState-in-effect). Not during a trial (all-access, nothing
  // "purchased" yet). Runs once (selected stays null until seeded).
  if (selected === null && billing && !isTrial) {
    const licensed = (billing.licensedModules ?? []).map((m) => m.key)
    setSelected(new Set(licensed))
  }
  const chosen = selected ?? new Set()

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const subscribe = async () => {
    if (busy) return
    // Guard the empty selection: an empty modules[] would otherwise fall back to a
    // legacy base-plan checkout — surprising. Require ≥1 module (core is implicit).
    if (chosen.size === 0) {
      setErr('Choose at least one module to subscribe (Core is always included).')
      return
    }
    setErr('')
    setBusy(true)
    try {
      await startModuleCheckout(Array.from(chosen))
      // On success the browser redirects; keyless dev throws (caught below).
    } catch (e) {
      setErr(apiErrorMessage(e, 'Billing is not configured on this server yet.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 border-t border-border pt-6">
      <h3 className="text-[17px] font-semibold text-navy">Modules</h3>
      <p className="mt-1 text-[15px] text-muted">
        {isTrial
          ? 'All modules are included during your trial. Choose the modules to keep when you subscribe.'
          : 'Choose the modules your school is licensed for. Core is always included.'}
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {catalog.map((m) => {
          const licensed = hasModule(m.key)
          const checked = chosen.has(m.key)
          const disabled = !m.purchasable
          return (
            <li key={m.key}>
              <label
                className={`flex h-full cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 transition-colors ${
                  checked ? 'border-gold bg-gold/[0.06]' : 'border-border hover:border-gold/60'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-gold"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(m.key)}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-navy">{m.label}</span>
                    {licensed && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[12px] font-semibold text-navy">
                        <Check size={11} className="text-gold" /> Licensed
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                    {m.description}
                  </span>
                  {disabled && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-muted">
                      <Lock size={11} /> Not available yet
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {err && (
        <div className="mt-4">
          <FormError>{err}</FormError>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={subscribe}
        disabled={busy || chosen.size === 0}
        className="btn-primary mt-5 inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
        Subscribe / update plan
      </motion.button>
      {!coreConfigured && (
        <p className="mt-2 text-[13px] text-muted">
          Modular checkout is not configured on this server yet.
        </p>
      )}
    </div>
  )
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
              You have full access during your trial
              {typeof daysLeft === 'number' ? ` — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : ''}.
              {isOwner ? ' Subscribe below to keep generating statements after it ends.' : ''}
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

      {/* Owner-only per-module picker (additive; legacy buttons above unchanged). */}
      {isOwner && <ModulePicker />}
    </SettingsCard>
  )
}
