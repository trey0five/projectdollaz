// Phase 6 — QuickBooks Online connector UI. Shows connection status; lets an
// owner/accountant connect (redirect to Intuit), sync a period's trial balance
// (which auto-scans), and disconnect. Config-gated: when the server has no QB
// credentials, the card explains it's disabled rather than offering Connect.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plug, RefreshCw, Unplug } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { qboApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

export default function IntegrationsSection() {
  const { activeId, activeSchool } = useSchools()
  const { periods } = usePersistence()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const [status, setStatus] = useState(null)
  const [periodId, setPeriodId] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async (id) => {
    try {
      const res = await qboApi.status(id)
      setStatus(res.data)
    } catch {
      setStatus({ configured: false, connected: false })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled && activeId) load(activeId)
    })
    return () => {
      cancelled = true
    }
  }, [activeId, load])

  // Effective selection without an effect: fall back to the first period.
  const selectedPeriod = periodId || (periods && periods[0]?.id) || ''

  const connect = async () => {
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const res = await qboApi.connectUrl(activeId)
      window.location.href = res.data.url
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not start the QuickBooks connection.'))
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const res = await qboApi.disconnect(activeId)
      setStatus(res.data)
      setOk('QuickBooks disconnected.')
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not disconnect.'))
    } finally {
      setBusy(false)
    }
  }

  const sync = async () => {
    if (!selectedPeriod) return
    setErr('')
    setOk('')
    setSyncing(true)
    try {
      const res = await qboApi.sync(activeId, selectedPeriod)
      const s = res.data?.scanSummary
      setOk(
        s
          ? `Synced from QuickBooks. Auto-scan: ${s.material} material, ${s.reportable} reportable.`
          : 'Synced from QuickBooks and generated statements.',
      )
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not sync from QuickBooks.'))
    } finally {
      setSyncing(false)
    }
  }

  if (!activeSchool) {
    return (
      <SettingsCard title="Integrations">
        <p className="text-[16px] text-muted">Select a school first.</p>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      title="QuickBooks Online"
      description="Pull the trial balance straight from QuickBooks instead of uploading a file."
    >
      {status == null ? (
        <p className="text-[16px] text-muted">Checking connection…</p>
      ) : !status.configured ? (
        <div className="rounded-lg border border-border bg-section px-4 py-3 text-[15px] text-muted">
          The QuickBooks connector isn’t configured on this server yet. An administrator needs to set
          the QuickBooks app credentials (<span className="font-mono">QB_OAUTH_CLIENT_ID</span> /
          <span className="font-mono"> QB_OAUTH_CLIENT_SECRET</span>) to enable it. File upload still
          works in the meantime.
        </div>
      ) : status.connected ? (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-[15px] text-navy">
            <Plug size={15} className="text-gold" />
            Connected to QuickBooks ({status.environment}) · company{' '}
            <span className="font-mono">{status.realmId}</span>
          </div>

          {canEdit && (
            <>
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
                Sync a period
              </label>
              <select
                className={inputCls}
                value={selectedPeriod}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                {(periods || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.periodEndDate}
                  </option>
                ))}
              </select>

              {err && <div className="mt-3"><FormError>{err}</FormError></div>}
              {ok && <div className="mt-3"><FormSuccess>{ok}</FormSuccess></div>}

              <div className="mt-4 flex flex-wrap gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={sync}
                  disabled={syncing || !selectedPeriod}
                  className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
                >
                  <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </motion.button>
                <button
                  onClick={disconnect}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  <Unplug size={15} /> Disconnect
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-[16px] text-muted">
            Connect your school’s QuickBooks Online company to pull the trial balance on demand. Your
            school needs an active QuickBooks Online subscription.
          </p>
          {err && <FormError>{err}</FormError>}
          {ok && <FormSuccess>{ok}</FormSuccess>}
          {canEdit && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={connect}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 sm:px-8"
            >
              <Plug size={15} /> {busy ? 'Redirecting…' : 'Connect to QuickBooks'}
            </motion.button>
          )}
        </>
      )}
    </SettingsCard>
  )
}
