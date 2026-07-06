// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentConnectCard — the SIS/roster connector, mirroring the QuickBooks card
// (IntegrationsSection). Handles the same shape of states:
//   • the CSV/ZIP roster upload is ALWAYS available (RosterUpload, embedded);
//   • Blackbaud connects via OAuth (window.location.assign to the returned url);
//   • FACTS / Veracross / OneRoster API are key/basic providers — the key form
//     shows only when the server has that connector configured (status.configured);
//   • a connected school shows last-synced + Sync + Disconnect (±purge, keep-data
//     the default).
// Non-fetching beyond its own actions; the parent owns status + reload. React 19
// idioms: window.location.assign for OAuth, loading/error on every action.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plug, Unplug, RefreshCw, CheckCircle2, AlertTriangle, GraduationCap } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from '../settings/SettingsCard.jsx'
import RosterUpload from './RosterUpload.jsx'

const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

// The live-connection providers offered in the picker (CSV/manual are handled by the
// dropzone / manual entry, not here). Blackbaud = OAuth; the rest = key/basic.
const LIVE_PROVIDERS = [
  { key: 'blackbaud', label: 'Blackbaud SKY', oauth: true },
  { key: 'oneroster_api', label: 'OneRoster API', oauth: false },
  { key: 'facts', label: 'FACTS SIS', oauth: false },
  { key: 'veracross', label: 'Veracross', oauth: false },
]

const PROVIDER_LABEL = {
  blackbaud: 'Blackbaud SKY',
  oneroster_api: 'OneRoster API',
  oneroster_csv: 'OneRoster file',
  facts: 'FACTS SIS',
  veracross: 'Veracross',
  manual: 'Manual entry',
}

function syncRelative(iso) {
  if (!iso) return 'Never synced.'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function EnrollmentConnectCard({ schoolId, canEdit, status, onChanged }) {
  const [provider, setProvider] = useState('blackbaud')
  const [keyForm, setKeyForm] = useState({
    apiKeyId: '',
    apiKeySecret: '',
    baseUrl: '',
    externalOrgId: '',
    subscriptionKey: '',
  })
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [pendingDisconnect, setPendingDisconnect] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const setKey = (k) => (e) => setKeyForm((f) => ({ ...f, [k]: e.target.value }))
  const selected = LIVE_PROVIDERS.find((p) => p.key === provider) ?? LIVE_PROVIDERS[0]

  const connectOAuth = async () => {
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const res = await enrollmentApi.connectUrl(schoolId)
      // React 19 idiom: full-page nav to the provider's consent screen.
      window.location.assign(res.data.url)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not start the connection.'))
      setBusy(false)
    }
  }

  const connectKey = async () => {
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const body = { provider }
      for (const [k, v] of Object.entries(keyForm)) if (v.trim()) body[k] = v.trim()
      await enrollmentApi.connectKey(schoolId, body)
      setOk(`Connected to ${PROVIDER_LABEL[provider] ?? provider}.`)
      onChanged?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not save those connection details.'))
    } finally {
      setBusy(false)
    }
  }

  const doSync = async () => {
    setErr('')
    setOk('')
    setSyncing(true)
    try {
      const res = await enrollmentApi.sync(schoolId, {})
      const snap = (res.data ?? res)?.snapshot
      setOk(
        snap
          ? `Synced ${snap.totalEnrolled?.toLocaleString('en-US')} students${snap.observedOn ? ` as of ${snap.observedOn}` : ''}.`
          : 'Sync complete.',
      )
      onChanged?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not sync from the provider.'))
    } finally {
      setSyncing(false)
    }
  }

  const doDisconnect = async (removeData) => {
    setPendingDisconnect(false)
    setErr('')
    setOk('')
    setBusy(true)
    try {
      await enrollmentApi.disconnect(schoolId, removeData)
      setOk(
        removeData
          ? 'Disconnected and roster data removed.'
          : 'Disconnected. Your imported rosters were kept.',
      )
      onChanged?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not disconnect.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="Student information system"
      description="Connect your SIS to pull enrollment automatically, or upload a roster file anytime."
    >
      {status == null ? (
        <p className="text-[16px] text-muted">Checking connection…</p>
      ) : (
        <>
          {status.connected ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-[15px] text-navy">
                <Plug size={15} className="text-gold" />
                Connected to {PROVIDER_LABEL[status.provider] ?? status.provider}
                {status.environment ? ` (${status.environment})` : ''}
              </div>
              <p className="mb-4 text-[14px] tracking-[0.01em] text-muted">
                {status.lastSyncedAt ? (
                  <>Last synced <span className="font-semibold text-navy">{syncRelative(status.lastSyncedAt)}</span></>
                ) : (
                  'Never synced.'
                )}
                {status.latest?.totalEnrolled != null && (
                  <> · {status.latest.totalEnrolled.toLocaleString('en-US')} students</>
                )}
              </p>

              {err && <div className="mb-3"><FormError>{err}</FormError></div>}
              {ok && <div className="mb-3"><FormSuccess>{ok}</FormSuccess></div>}

              {canEdit && (
                <div className="mb-5 flex flex-wrap gap-3">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={doSync}
                    disabled={syncing || busy}
                    className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </motion.button>
                  <button
                    onClick={() => setPendingDisconnect(true)}
                    disabled={busy || syncing || pendingDisconnect}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-danger/40 hover:text-danger disabled:opacity-50"
                  >
                    <Unplug size={15} /> Disconnect
                  </button>
                </div>
              )}

              {pendingDisconnect && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-lg border-2 border-gold/40 bg-gold/[0.06] px-4 py-3.5"
                >
                  <p className="flex items-start gap-2 text-[15px] font-semibold text-navy">
                    <Unplug size={16} className="mt-0.5 shrink-0 text-gold" /> Disconnect this SIS?
                  </p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                    By default we <span className="font-medium text-navy">keep every roster already
                    imported</span> — you just stop syncing. You can also permanently delete the
                    imported roster snapshots.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => doDisconnect(false)}
                      disabled={busy}
                      className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      <Unplug size={15} /> Disconnect (keep data)
                    </button>
                    <button
                      onClick={() => setPendingDisconnect(false)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-colors hover:border-navy disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => doDisconnect(true)}
                      disabled={busy}
                      className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-danger/80 underline-offset-2 transition-colors hover:text-danger hover:underline disabled:opacity-50"
                    >
                      <AlertTriangle size={14} /> Disconnect &amp; delete roster data
                    </button>
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            <>
              <p className="mb-4 text-[15px] text-muted">
                Connect a live student information system to pull enrollment on demand, or just upload
                a roster file below — no connection required.
              </p>

              {canEdit && (
                <div className="mb-5 rounded-lg border border-border bg-section/40 p-4">
                  <label className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Live connection
                  </label>
                  <select
                    className={inputCls}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {LIVE_PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>

                  {err && <div className="mt-3"><FormError>{err}</FormError></div>}
                  {ok && <div className="mt-3"><FormSuccess>{ok}</FormSuccess></div>}

                  {selected.oauth ? (
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={connectOAuth}
                      disabled={busy || !status.configured}
                      className="btn-primary mt-4 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
                    >
                      <Plug size={15} /> {busy ? 'Redirecting…' : `Connect ${selected.label}`}
                    </motion.button>
                  ) : status.configured ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input className={inputCls} placeholder="API key / client id" value={keyForm.apiKeyId} onChange={setKey('apiKeyId')} />
                        <input className={inputCls} placeholder="API secret" type="password" value={keyForm.apiKeySecret} onChange={setKey('apiKeySecret')} />
                        <input className={inputCls} placeholder="Base URL (optional)" value={keyForm.baseUrl} onChange={setKey('baseUrl')} />
                        <input className={inputCls} placeholder="School / org id (optional)" value={keyForm.externalOrgId} onChange={setKey('externalOrgId')} />
                        <input className={inputCls} placeholder="Subscription key (optional)" value={keyForm.subscriptionKey} onChange={setKey('subscriptionKey')} />
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={connectKey}
                        disabled={busy}
                        className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        <Plug size={15} /> {busy ? 'Saving…' : `Connect ${selected.label}`}
                      </motion.button>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-border bg-white px-4 py-3 text-[14px] text-muted">
                      The {selected.label} connector isn&apos;t configured on this server yet. You can
                      still upload a roster file below.
                    </div>
                  )}
                </div>
              )}

              {!status.configured && (
                <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-section px-4 py-3 text-[14px] text-muted">
                  <GraduationCap size={15} className="shrink-0 text-gold" />
                  No live SIS configured on this server — roster file upload always works.
                </div>
              )}
            </>
          )}

          {/* CSV/ZIP roster upload — ALWAYS available (connected or not). */}
          <div className="border-t border-border pt-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
              <GraduationCap size={14} className="text-gold" /> Roster file
            </h3>
            <RosterUpload schoolId={schoolId} canEdit={canEdit} onApplied={onChanged} />
          </div>
        </>
      )}
    </SettingsCard>
  )
}
