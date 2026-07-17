// ─────────────────────────────────────────────────────────────────────────────
// QboConnectPanel — a REAL, self-contained QuickBooks connector for the Trial
// balance "QuickBooks" tab. Unlike the Data-hub QuickBooksCard (which only LINKS
// to Settings), this connects right here: it reads the SCHOOL-level QBO status
// (qboApi.status — no period needed, so it always renders) and its Connect button
// starts the Intuit OAuth redirect (qboApi.connectUrl → window.location). Honest
// states: not-configured / connected / org-federated / connect.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Plug, ArrowRight, CheckCircle2, Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { qboApi, apiErrorMessage } from '../../lib/api.js'

export default function QboConnectPanel({ schoolId, canEdit = true }) {
  const reduce = useReducedMotion()
  const [status, setStatus] = useState(null) // null = loading
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!schoolId) return undefined
    setStatus(null)
    qboApi
      .status(schoolId)
      .then((res) => {
        if (!cancelled) setStatus(res?.data ?? { configured: false, connected: false })
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, connected: false })
      })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const connect = async () => {
    setErr('')
    setBusy(true)
    try {
      const res = await qboApi.connectUrl(schoolId)
      window.location.href = res.data.url
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not start the QuickBooks connection.'))
      setBusy(false)
    }
  }

  if (status === null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border-2 border-rule/50 bg-white/60 px-5 py-8 text-[14px] text-muted">
        <Loader2 size={16} className="animate-spin" /> Checking your QuickBooks connection…
      </div>
    )
  }

  const connected = !!status.connected
  const configured = !!status.configured
  const orgFed = !connected && !!status.orgFed

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border-2 border-[#2563eb]/30 bg-white p-5 shadow-card sm:p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#2563eb]/10 blur-2xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              connected || orgFed ? 'bg-emerald-100 text-emerald-700' : 'bg-[#2563eb]/12 text-[#2563eb]'
            }`}
          >
            {connected || orgFed ? <CheckCircle2 size={24} /> : <Plug size={22} />}
          </span>
          <div className="min-w-0">
            {!configured ? (
              <>
                <h3 className="font-serif text-lg font-semibold text-navy">
                  QuickBooks isn&apos;t enabled on this server yet.
                </h3>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  Once QuickBooks is turned on you&apos;ll connect it right here and pull your trial
                  balance automatically — no spreadsheet exports.
                </p>
              </>
            ) : connected ? (
              <>
                <h3 className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold text-navy">
                  QuickBooks connected
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                    <CheckCircle2 size={12} /> Live
                  </span>
                </h3>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  We can pull your current trial balance straight from QuickBooks.
                  {status.realmId ? (
                    <>
                      {' '}
                      Connected to realm <span className="font-semibold text-navy">{status.realmId}</span>
                      {status.environment ? ` · ${status.environment}` : ''}.
                    </>
                  ) : null}
                </p>
              </>
            ) : orgFed ? (
              <>
                <h3 className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold text-navy">
                  QuickBooks connected — through your organization
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                    <CheckCircle2 size={12} /> Via organization
                  </span>
                </h3>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  Your numbers flow in from{' '}
                  <span className="font-semibold text-navy">
                    {status.orgFed.companyName || 'your organization’s QuickBooks company'}
                  </span>
                  . Imports run from the organization’s QuickBooks in Settings.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-serif text-lg font-semibold text-navy">
                  The fast way: connect QuickBooks.
                </h3>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  Connect QuickBooks once and we&apos;ll pull your trial balance for you — no
                  spreadsheet exports, no manual entry.
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[14px] italic text-muted/80">
                  <Sparkles size={12} className="text-[#2563eb]" aria-hidden="true" />
                  Today this brings in your trial balance; pulling every year and month automatically is
                  coming soon.
                </p>
                {err && (
                  <p className="mt-2 flex items-center gap-1.5 text-[13.5px] font-medium text-rose-600">
                    <AlertTriangle size={14} /> {err}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {configured && connected ? (
            <Link
              to="/settings/integrations"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-white shadow-glow transition-transform hover:-translate-y-0.5"
            >
              Sync &amp; manage <ArrowRight size={15} />
            </Link>
          ) : configured && orgFed ? (
            <Link
              to="/settings/integrations"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-white shadow-glow transition-transform hover:-translate-y-0.5"
            >
              Manage in Settings <ArrowRight size={15} />
            </Link>
          ) : configured && canEdit ? (
            <motion.button
              type="button"
              whileTap={reduce ? undefined : { scale: 0.97 }}
              onClick={connect}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2563eb] px-5 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-white shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Starting…
                </>
              ) : (
                <>
                  Connect QuickBooks <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          ) : configured && !canEdit ? (
            <span className="text-[13px] italic text-muted">Owner/accountant can connect.</span>
          ) : null}
        </div>
      </div>
    </motion.section>
  )
}
