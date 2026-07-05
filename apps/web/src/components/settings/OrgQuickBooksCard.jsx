// Org-level QuickBooks console — one place to connect + sync EVERY school in a
// multi-school organization instead of swapping the active school N times.
// Self-contained: fetches /organizations/me, renders NOTHING for single-school
// orgs, otherwise lists each school with its live QBO status and per-school
// Connect / Sync actions plus a master "Sync all connected". Intuit's OAuth is
// strictly one authorization per company, so Connect still walks through Intuit
// per school — but from here, without ever changing the active school.
import { useCallback, useEffect, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { orgsApi, qboApi, qboOrgApi, apiErrorMessage } from '../../lib/api.js'
import { formatRelative } from '../../lib/format.js'
import { FormError } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

// One-line human summary of a school's QbOrgSync scope result. A prior-year
// failure is only "none" when QuickBooks genuinely had no data — a real error
// (auth, network) must not be masked as an empty year.
function scopeSummary(scope) {
  if (!scope) return null
  const bits = []
  if (scope.currentYear) bits.push(scope.currentYear.ok ? `current year (${scope.currentYear.rowCount} rows)` : 'current year failed')
  if (scope.priorYear) {
    bits.push(
      scope.priorYear.ok
        ? 'prior year'
        : /no prior-year/i.test(scope.priorYear.error || '')
          ? 'prior year: none'
          : 'prior year failed',
    )
  }
  if (scope.monthly) {
    const errored = scope.monthly.errors?.length ?? 0
    bits.push(
      `${scope.monthly.imported} month${scope.monthly.imported === 1 ? '' : 's'}${errored ? ` (${errored} errored)` : ''}`,
    )
  }
  if (scope.history) {
    const ok = scope.history.filter((h) => h.ok).length
    if (ok > 0) bits.push(`${ok} prior year${ok === 1 ? '' : 's'} of history`)
  }
  return bits.join(' · ')
}

export default function OrgQuickBooksCard() {
  const [org, setOrg] = useState(null)
  const [overview, setOverview] = useState(null)
  const [err, setErr] = useState('')
  const [connectingId, setConnectingId] = useState(null)
  const [syncingId, setSyncingId] = useState(null) // schoolId | 'all' | null
  const [result, setResult] = useState(null) // last QbOrgSyncResult
  const [scope, setScope] = useState({ priorYear: true, monthly: true, allHistory: false })

  const load = useCallback(async () => {
    setErr('')
    try {
      const me = (await orgsApi.me()).data
      setOrg(me)
      if ((me?.schools?.length ?? 0) > 1) {
        setOverview((await qboOrgApi.overview(me.id)).data)
      }
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load the organization QuickBooks overview.'))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Single-school org (or nothing loaded yet): the per-school card below covers it.
  if (!org || (org.schools?.length ?? 0) <= 1) return null

  const connect = async (schoolId) => {
    setErr('')
    setConnectingId(schoolId)
    try {
      const res = await qboApi.connectUrl(schoolId)
      window.location.assign(res.data.url)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not start the QuickBooks connection.'))
      setConnectingId(null)
    }
  }

  const runSync = async (schoolIds) => {
    setErr('')
    setResult(null)
    setSyncingId(schoolIds ? schoolIds[0] : 'all')
    try {
      const res = await qboOrgApi.sync(org.id, {
        ...(schoolIds ? { schoolIds } : {}),
        priorYear: scope.priorYear,
        monthly: scope.monthly,
        allHistory: scope.allHistory,
      })
      setResult(res.data)
      await load()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not sync from QuickBooks.'))
    } finally {
      setSyncingId(null)
    }
  }

  const schools = overview?.schools ?? []
  const connectedManageable = schools.filter((s) => s.connected && s.canManage)
  const anyManageable = schools.some((s) => s.canManage)
  // A sync in flight OR a connect redirect being fetched: block every action so a
  // sync can't fire mid-navigation to Intuit (its result would never be seen).
  const busy = syncingId != null || connectingId != null
  const resultFor = (schoolId) => result?.results?.find((r) => r.schoolId === schoolId) ?? null

  return (
    <SettingsCard
      title="Organization QuickBooks"
      description="Connect and sync QuickBooks for every school from one place — no switching schools. Each school authorizes its own QuickBooks company once."
    >
      {err && <div className="mb-3"><FormError>{err}</FormError></div>}

      {!overview ? (
        // While loading show progress; on a load failure the FormError above is
        // the whole story (no perpetual "Checking…" under it).
        err ? null : <p className="text-[16px] text-muted">Checking connections…</p>
      ) : !overview.configured ? (
        <p className="rounded-lg border border-border bg-section px-4 py-3 text-[15px] text-muted">
          The QuickBooks connector isn’t configured on this server yet.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border/70 rounded-xl border border-border">
            {schools.map((s) => {
              const r = resultFor(s.schoolId)
              return (
                <li key={s.schoolId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Building2 size={16} className="shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-semibold text-navy">{s.name}</p>
                    <p className="truncate text-[13.5px] text-muted">
                      {s.connected ? (
                        <>
                          Connected{s.companyName ? ` · ${s.companyName}` : ''}
                          {s.lastSyncedAt ? ` · synced ${formatRelative(s.lastSyncedAt)}` : ' · never synced'}
                        </>
                      ) : (
                        'Not connected'
                      )}
                    </p>
                    {r && (
                      <p className={`mt-0.5 flex items-start gap-1.5 text-[13.5px] ${r.status === 'failed' ? 'text-danger' : 'text-muted'}`}>
                        {r.status === 'synced' ? (
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-gold" />
                        ) : (
                          <XCircle size={14} className="mt-0.5 shrink-0" />
                        )}
                        <span>
                          {r.status === 'synced'
                            ? `Imported${r.periodLabel ? ` into ${r.periodLabel}` : ''} — ${scopeSummary(r.scope) || 'done'}`
                            : r.reason}
                        </span>
                      </p>
                    )}
                  </div>
                  {s.canManage &&
                    (s.connected ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runSync([s.schoolId])}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-[14px] font-semibold text-navy transition-all hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {syncingId === s.schoolId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        Sync
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || connectingId != null}
                        onClick={() => connect(s.schoolId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-[14px] font-bold text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connectingId === s.schoolId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Plug size={14} />
                        )}
                        Connect
                      </button>
                    ))}
                </li>
              )
            })}
          </ul>

          {/* Batch scope + master action (hidden for members who can't manage any
              school — a read-only viewer gets the status list without dead
              controls). currentYear is always the base; the checkboxes govern
              BOTH each row's Sync and Sync all, so say so. */}
          {anyManageable && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-[13.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                Also import (each Sync):
              </span>
              {[
                ['priorYear', 'Prior year'],
                ['monthly', 'Monthly'],
                ['allHistory', 'All prior years'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-[14.5px] text-navy">
                  <input
                    type="checkbox"
                    checked={scope[key]}
                    disabled={busy}
                    onChange={(e) => setScope((s) => ({ ...s, [key]: e.target.checked }))}
                    className="h-4 w-4 accent-gold"
                  />
                  {label}
                </label>
              ))}
              <button
                type="button"
                disabled={busy || connectedManageable.length === 0}
                onClick={() => runSync(null)}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-4 py-2 text-[14.5px] font-bold text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingId === 'all' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Sync all connected ({connectedManageable.length})
              </button>
            </div>
          )}

          {result && syncingId == null && (
            <p className="mt-3 text-[14px] text-muted">
              {result.synced} synced · {result.failed} failed · {result.skipped} skipped
            </p>
          )}
        </>
      )}
    </SettingsCard>
  )
}
