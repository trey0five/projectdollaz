// Phase 6 — QuickBooks Online connector UI. Shows connection status; lets an
// owner/accountant connect (redirect to Intuit), sync a period's trial balance
// (which auto-scans), and disconnect. Config-gated: when the server has no QB
// credentials, the card explains it's disabled rather than offering Connect.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, History, Plug, RefreshCw, Unplug, XCircle } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { qboApi, apiErrorMessage } from '../../lib/api.js'
import { formatRelative } from '../../lib/format.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

// Finer-grained than the day-level formatRelative for a just-completed sync:
// "just now / 5m ago / 3h ago", then defer to formatRelative for ≥1 day.
function syncRelativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const secs = Math.floor((Date.now() - then) / 1000)
  if (secs < 45) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return formatRelative(iso)
}

export default function IntegrationsSection() {
  const { activeId, activeSchool } = useSchools()
  const { periods } = usePersistence()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const [status, setStatus] = useState(null)
  const [periodId, setPeriodId] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncAllResult, setSyncAllResult] = useState(null)
  const [history, setHistory] = useState([])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async (id) => {
    try {
      const res = await qboApi.status(id)
      setStatus(res.data)
      if (res.data?.connected) {
        // Best-effort: a history failure shouldn't blank the card.
        try {
          const h = await qboApi.syncHistory(id)
          setHistory(Array.isArray(h.data) ? h.data : [])
        } catch {
          setHistory([])
        }
      } else {
        setHistory([])
      }
    } catch {
      setStatus({ configured: false, connected: false })
      setHistory([])
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

  // Map a synced fiscalPeriodId to its period label when we have it loaded.
  const periodLabel = (id) => {
    if (!id) return 'period'
    const p = (periods || []).find((x) => x.id === id)
    return p?.label || p?.periodEndDate || 'period'
  }

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

  const syncAll = async () => {
    setErr('')
    setOk('')
    setSyncAllResult(null)
    setSyncingAll(true)
    try {
      const res = await qboApi.syncAll(activeId)
      setSyncAllResult(res.data)
      // Refresh last-synced + history after the batch.
      await load(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not sync all periods from QuickBooks.'))
    } finally {
      setSyncingAll(false)
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

          {/* Last synced — visible to all roles (not gated by canEdit). */}
          <p className="mb-4 text-[14px] tracking-[0.01em] text-muted">
            {status.lastSyncedAt ? (
              <>
                Last synced{' '}
                <span className="font-semibold text-navy">
                  {syncRelativeTime(status.lastSyncedAt)}
                </span>
                {status.lastSyncRowCount != null && <> · {status.lastSyncRowCount} rows</>}
              </>
            ) : (
              'Never synced.'
            )}
          </p>

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
                  disabled={syncing || syncingAll || !selectedPeriod}
                  className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
                >
                  <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={syncAll}
                  disabled={syncing || syncingAll}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/50 bg-gold/10 px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={15} className={syncingAll ? 'animate-spin' : ''} />
                  {syncingAll ? 'Syncing all…' : 'Sync all periods'}
                </motion.button>
                <button
                  onClick={disconnect}
                  disabled={busy || syncingAll}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  <Unplug size={15} /> Disconnect
                </button>
              </div>

              {syncAllResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 rounded-lg border px-4 py-3 ${
                    syncAllResult.failed > 0
                      ? 'border-danger/30 bg-danger/[0.06]'
                      : 'border-gold/40 bg-gold/10'
                  }`}
                >
                  <p className="text-[15px] font-semibold text-navy">
                    Synced {syncAllResult.succeeded} of {syncAllResult.total} periods
                    {syncAllResult.failed > 0 && (
                      <span className="text-danger"> · {syncAllResult.failed} skipped</span>
                    )}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {syncAllResult.results.map((r) => (
                      <li
                        key={r.periodId}
                        className="flex items-start gap-2 text-[14px] text-muted"
                      >
                        {r.ok ? (
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold" />
                        ) : (
                          <XCircle size={15} className="mt-0.5 shrink-0 text-danger" />
                        )}
                        <span>
                          <span className="font-medium text-navy">{r.label}</span>
                          {r.ok
                            ? ` · ${r.rowCount} rows`
                            : ` · ${r.error || 'No QuickBooks data for this period.'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </>
          )}

          {history.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
                <History size={13} /> Recent syncs
              </p>
              <ul className="space-y-1">
                {history.slice(0, 8).map((h, i) => (
                  <li
                    key={`${h.syncedAt}-${i}`}
                    className="flex items-center justify-between text-[14px] text-muted"
                  >
                    <span className="text-navy">{syncRelativeTime(h.syncedAt)}</span>
                    <span>{periodLabel(h.fiscalPeriodId)} · {h.rowCount ?? '—'} rows</span>
                  </li>
                ))}
              </ul>
            </div>
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
