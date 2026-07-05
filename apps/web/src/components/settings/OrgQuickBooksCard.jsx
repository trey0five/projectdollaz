// Org-level QuickBooks console — one place to connect + sync EVERY school in a
// multi-school organization instead of swapping the active school N times.
// Self-contained: fetches /organizations/me, renders NOTHING for single-school
// orgs, otherwise lists each school with its live QBO status and per-school
// Connect / Sync actions plus a master "Sync all connected". Two topologies:
// each school its own QuickBooks company (Intuit OAuth per school), OR — the
// diocesan shape — ONE QuickBooks company for the whole organization split by
// Location/Class (OrgQboCompanyPanel). A fresh org with neither gets a chooser.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Landmark,
  Loader2,
  Plug,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { orgsApi, qboApi, qboOrgApi, qboCompanyApi, apiErrorMessage } from '../../lib/api.js'
import { formatRelative } from '../../lib/format.js'
import { FormError } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'
import OrgQboCompanyPanel from './OrgQboCompanyPanel.jsx'

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

  // Diocesan (Topology B) state: the org-level company connection, the mapping
  // payload lifted from the panel (drives the per-school "Fed by…" rows), and
  // the transient topology-chooser selections (NOT persisted).
  const [company, setCompany] = useState(null)
  const [companyErr, setCompanyErr] = useState('')
  const [mappingData, setMappingData] = useState(null)
  const [showCompanyPanel, setShowCompanyPanel] = useState(false)
  const [perSchoolChosen, setPerSchoolChosen] = useState(false)

  const load = useCallback(async () => {
    setErr('')
    try {
      const me = (await orgsApi.me()).data
      setOrg(me)
      if ((me?.schools?.length ?? 0) > 1) {
        setOverview((await qboOrgApi.overview(me.id)).data)
        // Company status is a separate, cheap DB read — its failure must not
        // blank the per-school console.
        try {
          setCompany((await qboCompanyApi.status(me.id)).data)
          setCompanyErr('')
        } catch (e) {
          setCompany(null)
          setCompanyErr(apiErrorMessage(e, 'Could not check the organization-level QuickBooks connection.'))
        }
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

  // schoolId -> the QBO Location/Class names feeding it, per the SAVED mapping
  // on the ACTIVE dimension (lifted from the company panel's mapping GET).
  const fedByOrg = useMemo(() => {
    if (!mappingData || !company?.connected) return {}
    const d = mappingData.dimension === 'class' ? 'class' : 'department'
    const out = {}
    for (const v of mappingData.values?.[d] ?? []) {
      if (v.schoolId) (out[v.schoolId] ??= []).push(v.name)
    }
    const ns = mappingData.notSpecified?.[d]
    if (ns?.schoolId) (out[ns.schoolId] ??= []).push('Not Specified')
    return out
  }, [mappingData, company?.connected])

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
  const anyConnected = schools.some((s) => s.connected)
  // A sync in flight OR a connect redirect being fetched: block every action so a
  // sync can't fire mid-navigation to Intuit (its result would never be seen).
  const busy = syncingId != null || connectingId != null
  const resultFor = (schoolId) => result?.results?.find((r) => r.schoolId === schoolId) ?? null

  const companyConnected = !!company?.connected
  // The topology chooser: a truly fresh multi-school org — no company connection,
  // zero per-school connections, and no transient pick yet. (When the company
  // status read failed we fall back to today's per-school console.)
  const chooserVisible =
    !!overview?.configured &&
    !!company &&
    !companyConnected &&
    !anyConnected &&
    !showCompanyPanel &&
    !perSchoolChosen
  const panelMounted = !!company && (companyConnected || showCompanyPanel)
  // Hide the (all-unconnected) per-school list while the org-company connect
  // state is the chosen path; every other state keeps the list visible.
  const listVisible = !chooserVisible && !(panelMounted && !companyConnected && !anyConnected)

  return (
    <div id="org-quickbooks">
    <SettingsCard
      title="Organization QuickBooks"
      description="Connect and sync QuickBooks for every school from one place — either one QuickBooks company for the whole organization, split by location or class, or a separate QuickBooks per school."
    >
      {err && <div className="mb-3"><FormError>{err}</FormError></div>}
      {companyErr && <div className="mb-3"><FormError>{companyErr}</FormError></div>}

      {!overview ? (
        // While loading show progress; on a load failure the FormError above is
        // the whole story (no perpetual "Checking…" under it).
        err ? null : <p className="text-[16px] text-muted">Checking connections…</p>
      ) : !overview.configured ? (
        <p className="rounded-lg border border-border bg-section px-4 py-3 text-[15px] text-muted">
          The QuickBooks connector isn’t configured on this server yet.
        </p>
      ) : chooserVisible ? (
        // ── Topology chooser (transient UI state — nothing persisted) ──────────
        <>
          <p className="mb-3 text-[15px] text-navy">How does your organization keep its books?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPerSchoolChosen(true)}
              className="rounded-xl border-2 border-border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold hover:bg-gold/[0.04]"
            >
              <p className="flex items-center gap-2 text-[15.5px] font-semibold text-navy">
                <Building2 size={16} className="shrink-0 text-gold" />
                Each school has its own QuickBooks
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                Every school keeps a separate QuickBooks company. Connect and sync each one from the
                list here — no switching schools.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setShowCompanyPanel(true)}
              className="rounded-xl border-2 border-border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold hover:bg-gold/[0.04]"
            >
              <p className="flex items-center gap-2 text-[15.5px] font-semibold text-navy">
                <Landmark size={16} className="shrink-0 text-gold" />
                One QuickBooks for the whole organization
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                A single QuickBooks company split by Location or Class (the diocesan shape). Connect it
                once, map each location to a school, and import everyone together.
              </p>
            </button>
          </div>
          <p className="mt-2.5 text-[13px] text-muted">You can switch approaches at any time.</p>
        </>
      ) : (
        <>
          {/* Org-company panel (Topology B) — on top when connected, or as the
              connect state once that path is chosen. */}
          {panelMounted && (
            <div className={listVisible ? 'mb-5' : ''}>
              <OrgQboCompanyPanel
                orgId={org.id}
                company={company}
                canManage={anyManageable}
                onChanged={load}
                onDisconnected={() => setShowCompanyPanel(true)}
                onMappingData={setMappingData}
              />
              {!companyConnected && !anyConnected && (
                <p className="mt-3 text-[13.5px] text-muted">
                  Prefer separate QuickBooks companies per school?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCompanyPanel(false)
                      setPerSchoolChosen(true)
                    }}
                    className="font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
                  >
                    Set up per-school connections
                  </button>
                </p>
              )}
            </div>
          )}

          {listVisible && (
            <>
              {companyConnected && (
                <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Per-school status
                </p>
              )}
              <ul className="divide-y divide-border/70 rounded-xl border border-border">
                {schools.map((s) => {
                  const r = resultFor(s.schoolId)
                  const fedNames = !s.connected ? fedByOrg[s.schoolId] : null
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
                          ) : fedNames ? (
                            <>Fed by the organization&apos;s QuickBooks · {fedNames.join(', ')}</>
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
                            {fedNames ? 'Connect directly' : 'Connect'}
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

              {/* No company connection: a quiet path into Topology B. Shown even
                  with zero per-school connections so a fresh org that picked
                  "each school has its own" in the chooser isn't dead-ended. */}
              {!companyConnected && !panelMounted && company && (
                <p className="mt-4 text-[13.5px] text-muted">
                  Using one QuickBooks for the whole organization instead?{' '}
                  <button
                    type="button"
                    onClick={() => setShowCompanyPanel(true)}
                    className="font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
                  >
                    Connect it here
                  </button>
                </p>
              )}
            </>
          )}
        </>
      )}
    </SettingsCard>
    </div>
  )
}
