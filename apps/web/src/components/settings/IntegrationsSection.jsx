// Phase 6 — QuickBooks Online connector UI. Shows connection status; lets an
// owner/accountant connect (redirect to Intuit), sync a period's trial balance
// (which auto-scans), and disconnect. Config-gated: when the server has no QB
// credentials, the card explains it's disabled rather than offering Connect.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CheckCircle2, History, Plug, RefreshCw, Unplug, XCircle } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { qboApi, qboCompanyApi, importsApi, periodsApi, apiErrorMessage } from '../../lib/api.js'
import { formatRelative } from '../../lib/format.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'
import QboCategoryReviewCard from './QboCategoryReviewCard.jsx'
import OrgQuickBooksCard from './OrgQuickBooksCard.jsx'

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

// One line in the scoped-import result (a scope's ok/failed outcome).
function ScopeRow({ ok, label, detail }) {
  return (
    <li className="flex items-start gap-2 text-muted">
      {ok ? (
        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold" />
      ) : (
        <XCircle size={15} className="mt-0.5 shrink-0 text-danger" />
      )}
      <span>
        <span className="font-medium text-navy">{label}</span>
        {detail ? ` — ${detail}` : ''}
      </span>
    </li>
  )
}

// `embedded` = mounted OUTSIDE the Settings page (e.g. the Finance "Add data →
// Trial balance → QuickBooks" tab), so the multi-school org console is hidden —
// that belongs in Settings. The per-school connect + sync/import panel is the
// point of embedding: connecting alone imports nothing, so a connected user can
// pull their trial balance right where they added it, without leaving Finance.
export default function IntegrationsSection({ embedded = false }) {
  const { activeId, activeSchool } = useSchools()
  const { periods, refresh: refreshPeriods } = usePersistence()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const [status, setStatus] = useState(null)
  const [periodId, setPeriodId] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  // Bootstrapping a reporting period when a fresh school has none — a QBO import
  // pulls a trial balance INTO a period, so one must exist first. Default to the
  // most recently completed fiscal year-end (FY runs Jul–Jun → Jun 30).
  const [newPeriodDate, setNewPeriodDate] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    return d.getMonth() >= 6 ? `${y}-06-30` : `${y - 1}-06-30`
  })
  const [creatingPeriod, setCreatingPeriod] = useState(false)
  // What to pull from QuickBooks (current year is always the base). historyYears =
  // additional prior fiscal-years, each imported as its own period; allHistory =
  // every prior year with data (overrides the count).
  const [scope, setScope] = useState({
    priorYear: false,
    monthly: false,
    historyYears: 0,
    allHistory: false,
  })
  const [scopeResult, setScopeResult] = useState(null)
  const [syncAllResult, setSyncAllResult] = useState(null)
  // Disconnect asks first (and offers to purge QuickBooks-imported data).
  const [pendingDisconnect, setPendingDisconnect] = useState(false)
  const [history, setHistory] = useState([])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  // The active current-year import for the selected period (drives the "active
  // source" line + the supersede confirm). `pendingSync` gates a sync that would
  // supersede an uploaded file: 'one' | 'all' | null.
  const [activeCy, setActiveCy] = useState(null)
  const [pendingSync, setPendingSync] = useState(null)
  // QuickBooks P&L category review (GET /review-accounts). Owned here so the
  // "N accounts to review" pill and the review card never disagree.
  const [review, setReview] = useState(null)
  // Diocesan QuickBooks: this school is fed by the ORG-level company (status.orgFed
  // non-null, no direct connection). "Import now" runs the org import scoped to
  // just this school.
  const [orgImporting, setOrgImporting] = useState(false)
  // Automatic nightly sync: toggling the per-connection flag + a force "run now"
  // hook (the underlying scheduled path — confidence/testing).
  const [autoSyncBusy, setAutoSyncBusy] = useState(false)
  const [runningNow, setRunningNow] = useState(false)

  // Best-effort like syncHistory: a review failure never blanks the card.
  const loadReview = useCallback(async (id) => {
    try {
      const res = await qboApi.reviewAccounts(id)
      setReview(res.data ?? res)
    } catch {
      setReview(null)
    }
  }, [])

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
      if (!cancelled && activeId) {
        load(activeId)
        loadReview(activeId)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeId, load, loadReview])

  // Effective selection without an effect: fall back to the first period.
  const selectedPeriod = periodId || (periods && periods[0]?.id) || ''

  // Map a synced fiscalPeriodId to its period label when we have it loaded.
  const periodLabel = (id) => {
    if (!id) return 'period'
    const p = (periods || []).find((x) => x.id === id)
    return p?.label || p?.periodEndDate || 'period'
  }

  // The active (newest) current-year import for the selected period — so we can
  // show which source drives the statements and warn before a sync supersedes an
  // uploaded file.
  const loadActiveCy = useCallback(async (id, pid) => {
    if (!id || !pid) {
      setActiveCy(null)
      return
    }
    try {
      const res = await importsApi.listForPeriod(id, pid)
      const list = Array.isArray(res.data) ? res.data : []
      setActiveCy(list.find((i) => i.role === 'cy' && i.active) || null)
    } catch {
      setActiveCy(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (status?.connected) loadActiveCy(activeId, selectedPeriod)
      else setActiveCy(null)
    })
    return () => {
      cancelled = true
    }
  }, [status?.connected, activeId, selectedPeriod, loadActiveCy])

  // Hydrate the "What to import" checkboxes from what QuickBooks data ALREADY
  // exists for the period — otherwise this transient form state resets to
  // defaults on every reload and looks like the selection was lost. (Current
  // year is always the base; historyYears reflects prior-year periods pulled.)
  const loadScope = useCallback(async (id, pid) => {
    if (!id || !pid) return
    try {
      const res = await qboApi.importScope(id, pid)
      const s = res.data ?? res
      setScope({
        priorYear: !!s.priorYear,
        monthly: !!s.monthly,
        historyYears: Math.min(Number(s.historyYears) || 0, 25),
        // Reality gives a count, not the "all" intent; leave allHistory off.
        allHistory: false,
      })
    } catch {
      /* leave the current selection alone on a read failure */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled && status?.connected) loadScope(activeId, selectedPeriod)
    })
    return () => {
      cancelled = true
    }
  }, [status?.connected, activeId, selectedPeriod, loadScope])

  // A sync would supersede an uploaded file when the active CY is a non-QBO source.
  const wouldSupersedeFile = activeCy && activeCy.sourceType !== 'quickbooks'

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

  const doDisconnect = async (removeData) => {
    setPendingDisconnect(false)
    setErr('')
    setOk('')
    setScopeResult(null)
    setSyncAllResult(null)
    setBusy(true)
    try {
      const res = await qboApi.disconnect(activeId, removeData)
      setStatus(res.data)
      const r = res.data?.removed
      if (r) {
        const parts = [
          `${r.imports} trial-balance import${r.imports === 1 ? '' : 's'}`,
          `${r.monthly} monthly snapshot${r.monthly === 1 ? '' : 's'}`,
        ]
        if (r.periods) parts.push(`${r.periods} period${r.periods === 1 ? '' : 's'} QuickBooks created`)
        setOk(
          `QuickBooks disconnected and its data removed — ${parts.join(', ')}. Your statements and dashboard now reflect your uploaded files again.`,
        )
      } else {
        setOk('QuickBooks disconnected. Your imported data was kept — statements and dashboard are unchanged.')
      }
      // Keep-data leaves the category review alive; delete-data empties it.
      await loadReview(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not disconnect.'))
    } finally {
      setBusy(false)
    }
  }

  // Org-fed import: POST the org-level company import scoped to just this school.
  // orgId comes from status.orgFed itself — no extra org lookup needed.
  const importFromOrg = async () => {
    const orgId = status?.orgFed?.orgId
    if (!orgId) return
    setErr('')
    setOk('')
    setOrgImporting(true)
    try {
      const res = await qboCompanyApi.import(orgId, { schoolIds: [activeId] })
      const r =
        res.data?.results?.find((x) => x.schoolId === activeId) ?? res.data?.results?.[0] ?? null
      if (r?.status === 'synced') {
        const rows = r.scope?.currentYear?.rowCount
        setOk(
          `Imported from the organization's QuickBooks${r.periodLabel ? ` into ${r.periodLabel}` : ''}${rows != null ? ` — ${rows} accounts` : ''}. Statements rebuilt.`,
        )
      } else {
        setErr(r?.reason || 'The import did not complete for this school.')
      }
      await load(activeId)
      await loadReview(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, "Could not import from the organization's QuickBooks."))
    } finally {
      setOrgImporting(false)
    }
  }

  // Import entry points gate on the supersede confirm when an uploaded file is the
  // active current-year source; otherwise they run straight away.
  // Create the reporting period a QBO import needs (fresh school → empty dropdown).
  const createPeriod = async () => {
    if (!newPeriodDate || creatingPeriod) return
    setErr('')
    setOk('')
    setCreatingPeriod(true)
    try {
      const endYear = Number(newPeriodDate.slice(0, 4))
      const res = await periodsApi.createOrGet(activeId, {
        periodEndDate: newPeriodDate,
        periodType: 'fy',
        label: `FY ${endYear}`,
      })
      await refreshPeriods()
      if (res?.data?.id) setPeriodId(res.data.id)
      setOk('Reporting period created — now choose what to pull and import from QuickBooks.')
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not create the reporting period.'))
    } finally {
      setCreatingPeriod(false)
    }
  }

  const requestImport = () => {
    if (!selectedPeriod) return
    if (wouldSupersedeFile) setPendingSync('scoped')
    else importScoped()
  }
  const requestSyncAll = () => {
    if (wouldSupersedeFile) setPendingSync('all')
    else syncAll()
  }

  // The scoped import: current year (base) + whatever else is checked, in one call.
  const importScoped = async () => {
    if (!selectedPeriod) return
    setPendingSync(null)
    setErr('')
    setOk('')
    setScopeResult(null)
    setSyncAllResult(null)
    setSyncing(true)
    const label = periodLabel(selectedPeriod)
    try {
      const res = await qboApi.syncScope(activeId, {
        periodId: selectedPeriod,
        currentYear: true,
        priorYear: scope.priorYear,
        monthly: scope.monthly,
        historyYears: scope.historyYears,
        allHistory: scope.allHistory,
      })
      // Refresh last-synced + history + active source + what's imported + review,
      // then show a per-scope card. (loadScope re-derives the checkboxes from the
      // data that actually landed — a scope with no data unchecks itself.)
      await load(activeId)
      await loadActiveCy(activeId, selectedPeriod)
      await loadScope(activeId, selectedPeriod)
      await loadReview(activeId)
      // A sync creates/updates the period + statements — refresh the shared period
      // list so the surrounding app (Finance wizard, dashboard) shows the new data
      // instead of "no reporting period yet".
      await refreshPeriods()
      setScopeResult({ label, ...res.data })
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not import from QuickBooks.'))
    } finally {
      setSyncing(false)
    }
  }

  const syncAll = async () => {
    setPendingSync(null)
    setErr('')
    setOk('')
    setScopeResult(null)
    setSyncAllResult(null)
    setSyncingAll(true)
    try {
      const res = await qboApi.syncAll(activeId)
      setSyncAllResult(res.data)
      // Refresh last-synced + history + active source after the batch.
      await load(activeId)
      await loadActiveCy(activeId, selectedPeriod)
      await loadReview(activeId)
      await refreshPeriods()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not sync all periods from QuickBooks.'))
    } finally {
      setSyncingAll(false)
    }
  }

  // Flip the per-connection auto-sync flag, then refetch status so the toggle +
  // chip reflect the server's re-armed truth (enabling also clears needsReauth).
  const toggleAutoSync = async (enabled) => {
    setErr('')
    setOk('')
    setAutoSyncBusy(true)
    try {
      await qboApi.setAutoSync(activeId, enabled)
      await load(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not update automatic sync.'))
    } finally {
      setAutoSyncBusy(false)
    }
  }

  // Force the scheduled sync on demand (bypasses the freshness/overnight gate but
  // still honours dead-token/entitlement) — surfaces the outcome inline.
  const runAutoSyncNow = async () => {
    setErr('')
    setOk('')
    setScopeResult(null)
    setSyncAllResult(null)
    setRunningNow(true)
    try {
      const res = await qboApi.runAutoSync(activeId)
      const r = res.data ?? {}
      if (r.status === 'synced') {
        setOk(`Auto-sync ran — ${r.rowCount ?? 0} account${r.rowCount === 1 ? '' : 's'} refreshed from QuickBooks.`)
      } else if (r.status === 'no_data') {
        // Informational, not a failure — the run completed, QBO just had no data.
        setOk('Auto-sync ran — QuickBooks returned no trial-balance data for the current period.')
      } else if (r.status === 'not_entitled') {
        // Informational — the keepalive refresh succeeded; only the data pull was skipped.
        setOk('Auto-sync kept the QuickBooks connection alive; the data pull was skipped while this subscription is inactive.')
      } else if (r.status === 'reauth') {
        setErr('QuickBooks needs to be reconnected — automatic sync has been paused.')
      } else if (r.status === 'no_actor') {
        setErr('Auto-sync could not run — no owner is attached to this connection.')
      } else {
        setErr(r.error || 'Automatic sync could not complete.')
      }
      // Refetch so the chip's "last run" + status icon reflect this run.
      await load(activeId)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not run automatic sync.'))
    } finally {
      setRunningNow(false)
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
    <>
      {/* Multi-school orgs get the org-wide console on top (hides itself for
          single-school orgs): connect + sync every school without swapping.
          Suppressed when embedded outside Settings — the org console lives there. */}
      {!embedded && <OrgQuickBooksCard />}
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
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-[15px] text-navy">
            <Plug size={15} className="text-gold" />
            Connected to QuickBooks ({status.environment})
            {status.companyName ? (
              <>
                {' '}· <span className="font-semibold">{status.companyName}</span>
                <span className="font-mono text-[13px] text-muted">#{status.realmId}</span>
              </>
            ) : (
              <>
                {' '}· company <span className="font-mono">{status.realmId}</span>
              </>
            )}
          </div>

          {/* What a sync actually does + where the data lands. */}
          <p className="mb-3 text-[13.5px] leading-relaxed text-muted">
            A sync pulls the selected period&apos;s{' '}
            <span className="font-medium text-navy">trial balance</span> from QuickBooks and rebuilds
            your statements — the result lands in{' '}
            <Link
              to="/statements"
              className="font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
            >
              Statements &amp; Periods
            </Link>{' '}
            and flows into your dashboard and briefing.
          </p>

          {/* Last synced — visible to all roles (not gated by canEdit). */}
          <p className="mb-4 text-[14px] tracking-[0.01em] text-muted">
            {status.lastSyncedAt ? (
              <>
                Last synced{' '}
                <span className="font-semibold text-navy">
                  {syncRelativeTime(status.lastSyncedAt)}
                </span>
                {status.lastSyncRowCount != null && <> · {status.lastSyncRowCount} accounts</>}
              </>
            ) : (
              'Never synced.'
            )}
          </p>

          {/* Which source currently drives this period's statements. */}
          {activeCy && (
            <p className="mb-4 flex flex-wrap items-center gap-x-1.5 text-[14px] text-muted">
              <span>Active current-year trial balance:</span>
              <span className="font-semibold text-navy">
                {activeCy.sourceType === 'quickbooks' ? 'QuickBooks Online' : activeCy.sourceName}
              </span>
              <span>· {activeCy.rowCount} accounts</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                  activeCy.sourceType === 'quickbooks'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-navy/[0.06] text-navy/70'
                }`}
              >
                {activeCy.sourceType === 'quickbooks' ? 'Synced' : 'Uploaded file'}
              </span>
            </p>
          )}

          {/* Entry point into the category review card below. */}
          {canEdit && review?.summary?.needsReview > 0 && (
            <button
              onClick={() =>
                document.getElementById('qb-review')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-gold/60 bg-gold/10 px-4 py-1.5 text-[13.5px] font-semibold text-navy transition-colors hover:border-gold hover:bg-gold/20"
            >
              <AlertTriangle size={14} className="shrink-0 text-gold" />
              {review.summary.needsReview} account{review.summary.needsReview === 1 ? '' : 's'} to
              review — refine categories
            </button>
          )}

          {/* Automatic nightly sync — a toggle + status chip + a force "run now"
              hook. Gated by canEdit (owner/accountant); only shown once the API
              reports the autoSync block so an older server degrades gracefully. */}
          {canEdit && status.autoSync && (
            <div className="mb-5 rounded-lg border border-border bg-section/40 px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[15px] font-semibold text-navy">Automatic nightly sync</p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                    Refreshes this school&apos;s trial balance and AR/AP aging every night — no
                    clicks — and keeps your QuickBooks connection from expiring.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!status.autoSync.enabled}
                  aria-label="Automatic nightly sync"
                  onClick={() => toggleAutoSync(!status.autoSync.enabled)}
                  disabled={autoSyncBusy}
                  className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
                    status.autoSync.enabled ? 'border-gold bg-gold' : 'border-border bg-navy/10'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${
                      status.autoSync.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Status chip: reauth (amber, with reconnect) → on (nightly + last run
                  + ✓/⚠) → off. Reuses syncRelativeTime + the shared status icons. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {status.autoSync.needsReauth ? (
                  <span className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[13.5px] font-medium text-amber-800">
                    <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                    Reconnect QuickBooks to resume auto-sync
                    <button
                      type="button"
                      onClick={connect}
                      disabled={busy}
                      className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 disabled:opacity-50"
                    >
                      {busy ? 'Redirecting…' : 'Reconnect'}
                    </button>
                  </span>
                ) : status.autoSync.enabled ? (
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted">
                    Auto-syncs nightly · last run{' '}
                    <span className="font-semibold text-navy">
                      {syncRelativeTime(status.autoSync.lastRunAt) || 'not yet'}
                    </span>
                    {status.autoSync.lastStatus === 'synced' ? (
                      <CheckCircle2 size={14} className="shrink-0 text-gold" />
                    ) : status.autoSync.lastStatus ? (
                      <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                    ) : null}
                  </span>
                ) : (
                  <span className="text-[13.5px] text-muted">Automatic sync off</span>
                )}
                <button
                  type="button"
                  onClick={runAutoSyncNow}
                  disabled={runningNow || autoSyncBusy}
                  className="text-[13px] font-semibold text-navy underline-offset-2 transition-colors hover:text-gold hover:underline disabled:opacity-50"
                >
                  {runningNow ? 'Running…' : 'Run now'}
                </button>
              </div>
            </div>
          )}

          {canEdit && (
            <>
              {!status.lastSyncedAt && (
                <p className="mb-3 text-[15px] font-semibold text-navy">
                  You’re connected — choose what to pull from QuickBooks:
                </p>
              )}

              {/* Fresh school with no reporting period yet: a QBO import pulls a
                  trial balance INTO a period, so create one first. Otherwise the
                  dropdown is empty and there's nothing to import into ("0 of 0"). */}
              {(periods || []).length === 0 ? (
                <div className="mb-4 rounded-lg border-2 border-gold/40 bg-gold/[0.06] p-4">
                  <p className="text-[15px] font-semibold text-navy">
                    First, add the reporting period to import into.
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                    QuickBooks pulls your trial balance as of a fiscal year-end. Pick your year-end
                    and we’ll create the period — then you can import.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                      Fiscal year-end
                      <input
                        type="date"
                        value={newPeriodDate}
                        onChange={(e) => setNewPeriodDate(e.target.value)}
                        className={`${inputCls} max-w-[220px]`}
                      />
                    </label>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={createPeriod}
                      disabled={creatingPeriod || !newPeriodDate}
                      className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingPeriod ? 'Creating…' : 'Create period'}
                    </motion.button>
                  </div>
                </div>
              ) : (
                <>
                  <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Import into period
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
                </>
              )}

              {/* Import-scope chooser: current year is the base; the rest are opt-in. */}
              <fieldset className="mt-4 rounded-lg border border-border bg-section/40 p-4">
                <legend className="px-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
                  What to import
                </legend>
                <div className="space-y-2.5">
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked disabled className="mt-1 h-4 w-4 accent-gold" />
                    <span className="text-[15px]">
                      <span className="font-semibold text-navy">Current year</span>{' '}
                      <span className="text-muted">— this year’s trial balance (the base; always included)</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={scope.priorYear}
                      onChange={(e) => setScope((s) => ({ ...s, priorYear: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-gold"
                    />
                    <span className="text-[15px]">
                      <span className="font-semibold text-navy">Prior year</span>{' '}
                      <span className="text-muted">— last year’s TB for the comparative columns</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={scope.monthly}
                      onChange={(e) => setScope((s) => ({ ...s, monthly: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-gold"
                    />
                    <span className="text-[15px]">
                      <span className="font-semibold text-navy">Monthly actuals</span>{' '}
                      <span className="text-muted">— a TB as of each month-end (powers the Monthly numbers card)</span>
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-[15px]">
                      <span className="font-semibold text-navy">Prior years of history</span>{' '}
                      <span className="text-muted">— each older year as its own period (multi-year trend)</span>
                    </span>
                    <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[14px] font-semibold text-navy">
                      <input
                        type="checkbox"
                        checked={scope.allHistory}
                        onChange={(e) => setScope((s) => ({ ...s, allHistory: e.target.checked }))}
                        className="h-4 w-4 accent-gold"
                      />
                      All prior years
                    </label>
                    <select
                      value={scope.historyYears}
                      disabled={scope.allHistory}
                      onChange={(e) => setScope((s) => ({ ...s, historyYears: Number(e.target.value) }))}
                      title={scope.allHistory ? 'Using every prior year with data' : undefined}
                      className="rounded-lg border-2 border-border bg-white px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.05] disabled:text-muted"
                    >
                      {Array.from({ length: 26 }, (_, n) => n).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>

              {err && <div className="mt-3"><FormError>{err}</FormError></div>}
              {ok && <div className="mt-3"><FormSuccess>{ok}</FormSuccess></div>}

              <div className="mt-4 flex flex-wrap gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={requestImport}
                  disabled={syncing || syncingAll || !selectedPeriod || !!pendingSync}
                  className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
                >
                  <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Importing…' : 'Import from QuickBooks'}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={requestSyncAll}
                  disabled={syncing || syncingAll || !!pendingSync}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/50 bg-gold/10 px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={15} className={syncingAll ? 'animate-spin' : ''} />
                  {syncingAll ? 'Re-syncing…' : 'Re-sync all periods'}
                </motion.button>
                <button
                  onClick={() => setPendingDisconnect(true)}
                  disabled={busy || syncingAll || !!pendingSync || pendingDisconnect}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  <Unplug size={15} /> Disconnect
                </button>
              </div>

              {/* Disconnect confirm — offers to also purge QuickBooks-imported data. */}
              {pendingDisconnect && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-lg border-2 border-gold/40 bg-gold/[0.06] px-4 py-3.5"
                >
                  <p className="flex items-start gap-2 text-[15px] font-semibold text-navy">
                    <Unplug size={16} className="mt-0.5 shrink-0 text-gold" />
                    Disconnect QuickBooks?
                  </p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                    By default we <span className="font-medium text-navy">keep everything already
                    imported</span> — your statements and dashboard stay exactly as they are; you just
                    stop syncing. You can also permanently delete the QuickBooks data, which rebuilds
                    your statements from any uploaded files (so the dashboard reverts to those).
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
                      <AlertTriangle size={14} /> Disconnect &amp; delete QuickBooks data
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Supersede confirm — a QBO sync makes QuickBooks the active source,
                  displacing an uploaded current-year file (kept, but no longer live). */}
              {pendingSync && wouldSupersedeFile && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-lg border-2 border-gold/50 bg-gold/[0.07] px-4 py-3.5"
                >
                  <p className="flex items-start gap-2 text-[15px] font-semibold text-navy">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-gold" />
                    This will make QuickBooks your active current-year trial balance
                    {pendingSync === 'all' ? ' for every period' : ` for ${periodLabel(selectedPeriod)}`}.
                  </p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                    Your uploaded file{' '}
                    <span className="font-medium text-navy">{activeCy.sourceName}</span> (
                    {activeCy.rowCount} accounts) is kept, but QuickBooks will drive your statements
                    from now on. You can switch back by re-adding the file.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={pendingSync === 'all' ? syncAll : importScoped}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      <RefreshCw size={15} /> Import from QuickBooks
                    </motion.button>
                    <button
                      onClick={() => setPendingSync(null)}
                      className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-colors hover:border-navy"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Scoped import outcome — a line per scope, explicit + linked. */}
              {scopeResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3"
                >
                  <p className="flex items-center gap-2 text-[15px] font-semibold text-navy">
                    <CheckCircle2 size={16} className="shrink-0 text-gold" />
                    Imported from QuickBooks · {scopeResult.label}
                  </p>
                  <ul className="mt-2 space-y-1 text-[14px]">
                    {scopeResult.currentYear && (
                      <ScopeRow
                        ok={scopeResult.currentYear.ok}
                        label="Current year"
                        detail={
                          scopeResult.currentYear.ok
                            ? `${scopeResult.currentYear.rowCount} accounts · statements rebuilt`
                            : scopeResult.currentYear.error
                        }
                      />
                    )}
                    {scopeResult.priorYear && (
                      <ScopeRow
                        ok={scopeResult.priorYear.ok}
                        label="Prior year"
                        detail={
                          scopeResult.priorYear.ok
                            ? `${scopeResult.priorYear.rowCount} accounts · comparative columns`
                            : scopeResult.priorYear.error
                        }
                      />
                    )}
                    {scopeResult.monthly && (
                      <ScopeRow
                        ok={scopeResult.monthly.imported > 0}
                        label="Monthly actuals"
                        detail={
                          `${scopeResult.monthly.imported} month${scopeResult.monthly.imported === 1 ? '' : 's'} imported` +
                          (scopeResult.monthly.skipped ? ` · ${scopeResult.monthly.skipped} skipped (no data)` : '') +
                          (scopeResult.monthly.errors?.length ? ` · ${scopeResult.monthly.errors.length} errored` : '')
                        }
                      />
                    )}
                    {(scopeResult.history || []).map((h) => (
                      <ScopeRow
                        key={h.year}
                        ok={h.ok}
                        label={`FY ${h.year}`}
                        detail={h.ok ? `${h.rowCount} accounts · new period` : h.error}
                      />
                    ))}
                  </ul>
                  {/* Post-import funnel: the imported accounts land on default
                      categories — send the user straight to the review step. */}
                  {review?.summary?.needsReview > 0 && (
                    <button
                      onClick={() =>
                        document.getElementById('qb-review')?.scrollIntoView({ behavior: 'smooth' })
                      }
                      className="mt-2.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
                    >
                      Next step: review {review.summary.needsReview} imported categories{' '}
                      <ArrowRight size={14} />
                    </button>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-4">
                    <Link
                      to="/statements"
                      className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
                    >
                      View statements <ArrowRight size={14} />
                    </Link>
                    <Link
                      to="/finance"
                      className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
                    >
                      Open finance dashboard <ArrowRight size={14} />
                    </Link>
                  </div>
                </motion.div>
              )}

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
                  <p className="mt-1 text-[13.5px] text-muted">
                    Each pulled that period&apos;s trial balance and rebuilt its statements.
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
                            ? ` · ${r.rowCount} accounts`
                            : ` · ${r.error || 'No QuickBooks data for this period.'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/statements"
                    className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
                  >
                    View statements <ArrowRight size={14} />
                  </Link>
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
      ) : status.orgFed ? (
        // Diocesan QuickBooks: no direct connection, but this school is mapped in
        // the ORGANIZATION's QuickBooks company — numbers flow from there.
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] text-navy">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            Fed by your organization&apos;s QuickBooks
            {status.orgFed.companyName && (
              <>
                {' '}· <span className="font-semibold">{status.orgFed.companyName}</span>
              </>
            )}
          </div>
          <p className="mb-3 text-[14.5px] leading-relaxed text-muted">
            This school&apos;s numbers come from the organization&apos;s QuickBooks company
            {(status.orgFed.valueNames?.length ?? 0) > 0 && (
              <>
                {' '}—{' '}
                {status.orgFed.dimension === 'class'
                  ? status.orgFed.valueNames.length === 1
                    ? 'class'
                    : 'classes'
                  : status.orgFed.valueNames.length === 1
                    ? 'location'
                    : 'locations'}{' '}
                <span className="font-semibold text-navy">{status.orgFed.valueNames.join(', ')}</span>
              </>
            )}
            . An import pulls only this school&apos;s share of the books.
          </p>
          <p className="mb-4 text-[14px] tracking-[0.01em] text-muted">
            {status.orgFed.lastImportedAt ? (
              <>
                Last imported{' '}
                <span className="font-semibold text-navy">
                  {syncRelativeTime(status.orgFed.lastImportedAt)}
                </span>
              </>
            ) : (
              'Never imported yet.'
            )}
          </p>

          {err && <div className="mb-3"><FormError>{err}</FormError></div>}
          {ok && <div className="mb-3"><FormSuccess>{ok}</FormSuccess></div>}

          <div className="flex flex-wrap items-center gap-3">
            {canEdit && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={importFromOrg}
                disabled={orgImporting}
                className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={15} className={orgImporting ? 'animate-spin' : ''} />
                {orgImporting ? 'Importing…' : 'Import now'}
              </motion.button>
            )}
            <button
              type="button"
              onClick={() =>
                document.getElementById('org-quickbooks')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-colors hover:border-gold disabled:opacity-50"
            >
              Manage in Organization QuickBooks <ArrowRight size={15} />
            </button>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={connect}
              disabled={busy || orgImporting}
              className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted underline-offset-2 transition-colors hover:text-gold hover:underline disabled:opacity-50"
            >
              <Plug size={13} /> {busy ? 'Redirecting…' : "Connect this school's own QuickBooks instead"}
            </button>
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

      {/* Guided category review — reads the SAME `review` as the pill above.
          Renders nothing for viewers or schools with no QuickBooks P&L accounts.
          Survives disconnect-keep-data (it reads local imports/mapping only). */}
      <QboCategoryReviewCard
        key={activeId}
        schoolId={activeId}
        review={review}
        canEdit={canEdit}
        onSaved={() => loadReview(activeId)}
      />
    </>
  )
}
