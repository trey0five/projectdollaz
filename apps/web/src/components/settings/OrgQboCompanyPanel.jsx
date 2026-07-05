// Diocesan QuickBooks (Topology B) — the organization-level "one QuickBooks
// company for every school" panel. Rendered by OrgQuickBooksCard inside its
// SettingsCard: connect state, connected status header, inline Location/Class →
// school mapping editor, batch import of every mapped school, and a disconnect
// confirm whose SAFE default keeps imported data. Talks to
// /organizations/:orgId/integrations/qb/company via qboCompanyApi and lifts the
// mapping payload to the parent (onMappingData) so per-school rows can show
// "Fed by the organization's QuickBooks".
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Loader2,
  MapPin,
  Plug,
  RefreshCw,
  Tags,
  Unplug,
  XCircle,
} from 'lucide-react'
import { qboCompanyApi, apiErrorMessage } from '../../lib/api.js'
import { formatRelative } from '../../lib/format.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'

const IGNORE = '__ignore__'
const NOT_SPECIFIED = '__unspecified__'

const selectCls =
  'rounded-lg border-2 border-border bg-white px-2.5 py-1.5 text-[14px] text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

// "location(s)" / "class(es)" — QuickBooks' UI word for the Department entity is
// Location, so the copy says Location everywhere.
function dimNoun(dimension, plural) {
  return dimension === 'class' ? (plural ? 'classes' : 'class') : plural ? 'locations' : 'location'
}

// Compact dollar hint for the per-value CY activity column ($1.2M / $45K / $980).
function fmtActivity(n) {
  if (n == null) return null
  const abs = Math.abs(n)
  const s =
    abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(1)}M`
      : abs >= 10_000
        ? `${Math.round(abs / 1_000)}K`
        : Math.round(abs).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${s}`
}

function fmtWhole(n) {
  return `$${Math.abs(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// One-line human summary of a school's import scope result (same shape family
// as the per-school sync in OrgQuickBooksCard).
function scopeSummary(scope) {
  if (!scope) return null
  const bits = []
  if (scope.currentYear) {
    bits.push(
      scope.currentYear.ok ? `current year (${scope.currentYear.rowCount} rows)` : 'current year failed',
    )
  }
  if (scope.priorYear) bits.push(scope.priorYear.ok ? 'prior year' : 'prior year failed')
  if (scope.monthly) {
    const errored = scope.monthly.errors?.length ?? 0
    bits.push(
      `${scope.monthly.imported} month${scope.monthly.imported === 1 ? '' : 's'}${errored ? ` (${errored} errored)` : ''}`,
    )
  }
  return bits.join(' · ')
}

// Selection value for a mapping row: schoolId | '__ignore__' | '' (no decision).
function toSel(v) {
  return v.schoolId ? v.schoolId : v.ignored ? IGNORE : ''
}

// Build the edit state (both dimension sets, incl. the Not Specified pseudo-row,
// which is Ignored by default per the server contract) from a mapping GET.
function buildSel(m) {
  const out = { department: {}, class: {} }
  for (const d of ['department', 'class']) {
    for (const v of m.values?.[d] ?? []) out[d][v.qboId] = toSel(v)
    const ns = m.notSpecified?.[d]
    out[d][NOT_SPECIFIED] = ns?.schoolId ? ns.schoolId : IGNORE
  }
  return out
}

export default function OrgQboCompanyPanel({ orgId, company, canManage, onChanged, onDisconnected, onMappingData }) {
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [connecting, setConnecting] = useState(false)

  // Mapping (live QBO merge) + the local edit state.
  const [mapping, setMapping] = useState(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [mappingErr, setMappingErr] = useState('')
  const [sel, setSel] = useState(null)
  const [dim, setDim] = useState('department')
  const [saving, setSaving] = useState(false)

  // `?orgqb=map` (the OAuth callback's landing) auto-expands the mapping editor.
  // Read once — the param shouldn't re-open the section after a manual collapse.
  const [params] = useSearchParams()
  const [showMapping, setShowMapping] = useState(() => params.get('orgqb') === 'map')

  // Prior year + monthly default ON: the org import is the "set everything up
  // at once" action (matches the Topology-A batch console's defaults).
  const [importScope, setImportScope] = useState({ priorYear: true, monthly: true })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const [pendingDisconnect, setPendingDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const connected = !!company?.connected

  // `preserveDim` keeps the edit state of that dimension across the refresh —
  // a save writes only the ACTIVE dimension, so rebuilding `sel` wholesale
  // would silently discard unsaved work done on the other pill.
  const loadMapping = useCallback(async (preserveDim = null) => {
    setMappingErr('')
    setMappingLoading(true)
    try {
      const res = await qboCompanyApi.mapping(orgId)
      setMapping(res.data)
      setSel((prev) => {
        const fresh = buildSel(res.data)
        if (preserveDim && prev?.[preserveDim]) fresh[preserveDim] = prev[preserveDim]
        return fresh
      })
      setDim(res.data.dimension === 'class' ? 'class' : 'department')
      onMappingData?.(res.data)
    } catch (e) {
      setMappingErr(apiErrorMessage(e, 'Could not load the QuickBooks location mapping.'))
    } finally {
      setMappingLoading(false)
    }
  }, [orgId, onMappingData])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled && connected) loadMapping()
    })
    return () => {
      cancelled = true
    }
  }, [connected, loadMapping])

  const connect = async () => {
    setErr('')
    setOk('')
    setConnecting(true)
    try {
      const res = await qboCompanyApi.connectUrl(orgId)
      window.location.assign(res.data.url)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not start the QuickBooks connection.'))
      setConnecting(false)
    }
  }

  const saveMapping = async () => {
    if (!mapping || !sel) return
    setErr('')
    setOk('')
    setSaving(true)
    try {
      // One EXPLICIT entry per decided value; undecided rows are simply omitted
      // (server treats "no row" as unmapped / needs attention).
      const entries = []
      for (const v of mapping.values?.[dim] ?? []) {
        const s = sel[dim][v.qboId]
        if (!s) continue
        entries.push({ qboId: v.qboId, qboName: v.name, ...(s === IGNORE ? { ignored: true } : { schoolId: s }) })
      }
      const ns = sel[dim][NOT_SPECIFIED]
      entries.push({
        qboId: NOT_SPECIFIED,
        qboName: 'Not Specified',
        ...(ns === IGNORE ? { ignored: true } : { schoolId: ns }),
      })
      const res = await qboCompanyApi.saveMapping(orgId, { dimension: dim, entries })
      setOk(`Mapping saved — ${res.data?.saved ?? entries.length} ${dimNoun(dim, true)} recorded.`)
      // Refresh from the server but keep the OTHER dimension's unsaved edits.
      await loadMapping(dim === 'department' ? 'class' : 'department')
      onChanged?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not save the mapping.'))
    } finally {
      setSaving(false)
    }
  }

  const runImport = async () => {
    setErr('')
    setOk('')
    setImportResult(null)
    setImporting(true)
    try {
      const res = await qboCompanyApi.import(orgId, {
        priorYear: importScope.priorYear,
        monthly: importScope.monthly,
      })
      setImportResult(res.data)
      onChanged?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not import from QuickBooks.'))
    } finally {
      setImporting(false)
    }
  }

  const doDisconnect = async (removeData) => {
    setPendingDisconnect(false)
    setErr('')
    setOk('')
    setImportResult(null)
    setDisconnecting(true)
    try {
      const res = await qboCompanyApi.disconnect(orgId, removeData)
      const n = res.data?.schoolsAffected ?? 0
      setOk(
        removeData
          ? `Organization QuickBooks disconnected and its imported data removed for ${n} school${n === 1 ? '' : 's'}. Statements rebuild from any uploaded files.`
          : 'Organization QuickBooks disconnected. Everything already imported was kept — statements and dashboards are unchanged.',
      )
      setMapping(null)
      setSel(null)
      onMappingData?.(null)
      // Keep this panel mounted (in its connect state) so the message survives
      // the parent's status refetch.
      onDisconnected?.()
      onChanged?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not disconnect the organization QuickBooks.'))
    } finally {
      setDisconnecting(false)
    }
  }

  // Live counts for the ACTIVE (saved) dimension — the honest status line.
  const mapStats = useMemo(() => {
    if (!mapping) return null
    const d = mapping.dimension === 'class' ? 'class' : 'department'
    let mapped = 0
    let ignored = 0
    let unmapped = 0
    for (const v of mapping.values?.[d] ?? []) {
      if (v.schoolId) mapped += 1
      else if (v.ignored) ignored += 1
      else unmapped += 1
    }
    return { mapped, ignored, unmapped }
  }, [mapping])

  // Distinct schools the SAVED mapping feeds (import uses stored rows, not the
  // unsaved edit state — so the button count must too). Schools with their own
  // direct connection are excluded: the server deterministically skips them
  // (precedence rule), so counting them would over-promise.
  const mappedSchoolIds = useMemo(() => {
    if (!mapping) return []
    const d = mapping.dimension === 'class' ? 'class' : 'department'
    const set = new Set()
    for (const v of mapping.values?.[d] ?? []) if (v.schoolId) set.add(v.schoolId)
    const ns = mapping.notSpecified?.[d]
    if (ns?.schoolId) set.add(ns.schoolId)
    const direct = new Set((mapping.schools ?? []).filter((s) => s.directConnection).map((s) => s.id))
    return [...set].filter((id) => !direct.has(id))
  }, [mapping])

  // When the mapping GET failed we still know the server-side mapped count from
  // the status payload — import runs off STORED rows, so don't dead-end it on a
  // transient mapping-screen failure.
  const importCount = mapping ? mappedSchoolIds.length : (company?.mapping?.mappedCount ?? 0)

  const busy = saving || importing || disconnecting || connecting

  // ── Not connected: the connect state ───────────────────────────────────────
  if (!connected) {
    return (
      <div className="rounded-xl border-2 border-gold/40 bg-gold/[0.05] px-4 py-4 sm:px-5">
        <p className="flex items-center gap-2 text-[15.5px] font-semibold text-navy">
          <Plug size={16} className="shrink-0 text-gold" />
          One QuickBooks for the whole organization
        </p>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
          Connect the organization&apos;s single QuickBooks company once. Its Locations (or Classes)
          then get mapped to schools, and one import pulls every school&apos;s trial balance from the
          same books.
        </p>
        {err && <div className="mt-3"><FormError>{err}</FormError></div>}
        {ok && <div className="mt-3"><FormSuccess>{ok}</FormSuccess></div>}
        {canManage && (
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-5 py-2.5 text-[15px] font-bold text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
            {connecting ? 'Redirecting…' : "Connect the organization's QuickBooks"}
          </button>
        )}
      </div>
    )
  }

  // ── Connected ───────────────────────────────────────────────────────────────
  const activeDim = mapping ? (mapping.dimension === 'class' ? 'class' : 'department') : company.dimension
  const values = mapping?.values?.[dim] ?? []
  const schools = mapping?.schools ?? []
  const nsSel = sel?.[dim]?.[NOT_SPECIFIED] ?? IGNORE
  const anyUndecided = values.some((v) => !(sel?.[dim]?.[v.qboId] ?? ''))
  const anyIgnored = values.some((v) => (sel?.[dim]?.[v.qboId] ?? '') === IGNORE) || nsSel === IGNORE

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/[0.04] px-4 py-4 sm:px-5">
      {/* Status header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-navy">
        <Plug size={15} className="shrink-0 text-gold" />
        <span className="font-semibold">Organization QuickBooks connected</span>
        {company.environment && <span className="text-muted">({company.environment})</span>}
        {company.companyName ? (
          <>
            · <span className="font-semibold">{company.companyName}</span>
            {company.realmId && <span className="font-mono text-[13px] text-muted">#{company.realmId}</span>}
          </>
        ) : (
          company.realmId && (
            <>
              · company <span className="font-mono">{company.realmId}</span>
            </>
          )
        )}
      </div>
      <p className="mt-1 text-[13.5px] text-muted">
        Split by <span className="font-semibold text-navy">{activeDim === 'class' ? 'Classes' : 'Locations'}</span>
        {company.connectedAt && <> · connected {formatRelative(company.connectedAt)}</>}
        {company.lastImportedAt ? <> · last imported {formatRelative(company.lastImportedAt)}</> : ' · never imported'}
      </p>

      {/* Mapping summary — amber when anything still needs a decision. */}
      {mapStats ? (
        <p className={`mt-1 text-[13.5px] ${mapStats.unmapped > 0 ? 'font-semibold text-amber-600' : 'text-muted'}`}>
          {mapStats.mapped} mapped · {mapStats.ignored} ignored
          {mapStats.unmapped > 0 && <> · {mapStats.unmapped} unmapped</>}
        </p>
      ) : (
        company.mapping && (
          <p className="mt-1 text-[13.5px] text-muted">
            {company.mapping.mappedCount} mapped · {company.mapping.ignoredCount} ignored
          </p>
        )
      )}

      {err && <div className="mt-3"><FormError>{err}</FormError></div>}
      {ok && <div className="mt-3"><FormSuccess>{ok}</FormSuccess></div>}

      {/* Actions. Review mapping is open to EVERY org member (the editor is
          already read-only for non-managers); destructive actions stay gated. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowMapping((v) => !v)}
          disabled={disconnecting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-[14px] font-semibold text-navy transition-all hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ListChecks size={14} />
          {showMapping ? 'Hide mapping' : 'Review mapping'}
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => setPendingDisconnect(true)}
            disabled={busy || pendingDisconnect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[14px] font-semibold text-navy transition-all hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Unplug size={14} /> Disconnect
          </button>
        )}
      </div>

      {/* Disconnect confirm — keep-data is the SAFE PRIMARY default. */}
      {pendingDisconnect && (
        <div className="mt-4 rounded-lg border-2 border-gold/40 bg-white px-4 py-3.5">
          <p className="flex items-start gap-2 text-[15px] font-semibold text-navy">
            <Unplug size={16} className="mt-0.5 shrink-0 text-gold" />
            Disconnect the organization&apos;s QuickBooks?
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            By default we <span className="font-medium text-navy">keep everything already imported</span>{' '}
            for every mapped school — statements and dashboards stay exactly as they are; you just stop
            importing. You can also permanently delete the QuickBooks-imported data across those
            schools, which rebuilds their statements from any uploaded files.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => doDisconnect(false)}
              disabled={disconnecting || importing || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-5 py-2.5 text-[15px] font-bold text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disconnecting ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />}
              Disconnect (keep data)
            </button>
            <button
              type="button"
              onClick={() => setPendingDisconnect(false)}
              disabled={disconnecting}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-colors hover:border-navy disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => doDisconnect(true)}
              disabled={disconnecting || importing || saving}
              className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-danger/80 underline-offset-2 transition-colors hover:text-danger hover:underline disabled:opacity-50"
            >
              <AlertTriangle size={14} /> Disconnect &amp; delete QuickBooks data
            </button>
          </div>
        </div>
      )}

      {/* ── Inline mapping editor ─────────────────────────────────────────────── */}
      {showMapping && (
        <div className="mt-4 rounded-lg border border-border bg-white px-4 py-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
            Map QuickBooks {dimNoun(dim, true)} to schools
          </p>

          {mappingLoading && !mapping ? (
            <p className="mt-3 text-[15px] text-muted">Loading the QuickBooks mapping…</p>
          ) : mappingErr && !mapping ? (
            <div className="mt-3">
              <FormError>{mappingErr}</FormError>
              <button
                type="button"
                onClick={loadMapping}
                className="mt-2 text-[14px] font-semibold text-navy underline-offset-2 hover:text-gold hover:underline"
              >
                Try again
              </button>
            </div>
          ) : mapping && sel ? (
            <>
              {/* Dimension pills with live counts. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[
                  ['department', 'Locations', mapping.values?.department?.length ?? 0],
                  ['class', 'Classes', mapping.values?.class?.length ?? 0],
                ].map(([key, label, count]) => {
                  const PillIcon = key === 'class' ? Tags : MapPin
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDim(key)}
                      disabled={saving}
                      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        dim === key
                          ? 'border-gold bg-gold/15 text-navy'
                          : 'border-border bg-white text-muted hover:border-gold/60 hover:text-navy'
                      }`}
                    >
                      <PillIcon size={14} className={dim === key ? 'text-gold' : ''} />
                      {label} ({count})
                    </button>
                  )
                })}
              </div>
              {dim !== activeDim && (
                <p className="mt-2 text-[13.5px] font-medium text-amber-600">
                  Saving switches the split to {dim === 'class' ? 'Classes' : 'Locations'} — imports
                  will use this mapping instead of the {activeDim === 'class' ? 'Classes' : 'Locations'} one.
                </p>
              )}

              {values.length === 0 ? (
                <p className="mt-4 rounded-lg border border-border bg-section px-4 py-3 text-[15px] text-muted">
                  {dim === 'class'
                    ? 'No classes found in this QuickBooks company — add Classes in QuickBooks first.'
                    : 'No locations found in this QuickBooks company — add Locations in QuickBooks first.'}
                </p>
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-border/70 rounded-xl border border-border">
                    {values.map((v) => (
                      <li
                        key={v.qboId}
                        className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-4 ${v.parentId ? 'pl-9' : 'pl-4'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-navy">
                            <span className="truncate">{v.name}</span>
                            {!v.active && (
                              <span className="rounded-full bg-navy/[0.06] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-navy/60">
                                Inactive
                              </span>
                            )}
                          </p>
                          {v.activityCY != null && (
                            <p className="text-[13px] text-muted">
                              {v.activityCY === 0
                                ? 'No activity this year'
                                : `${fmtActivity(v.activityCY)} activity this year`}
                            </p>
                          )}
                        </div>
                        <select
                          value={sel[dim][v.qboId] ?? ''}
                          disabled={!canManage || saving}
                          onChange={(e) =>
                            setSel((prev) => ({
                              ...prev,
                              [dim]: { ...prev[dim], [v.qboId]: e.target.value },
                            }))
                          }
                          className={selectCls}
                        >
                          <option value="">Not mapped</option>
                          <option value={IGNORE}>— Ignore —</option>
                          {schools.map((s) => (
                            <option
                              key={s.id}
                              value={s.id}
                              disabled={!s.canManage && sel[dim][v.qboId] !== s.id}
                            >
                              {s.name}
                              {s.directConnection ? ' (has its own QuickBooks)' : ''}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                    {/* Not Specified pseudo-row — always pinned last, Ignored by default. */}
                    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-section/50 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium italic text-navy">Not Specified</p>
                        <p className="text-[13px] text-muted">
                          Amounts with no {dimNoun(dim)} tag in QuickBooks. Ignored by default — map it
                          to a school only if untagged activity belongs there.
                        </p>
                      </div>
                      <select
                        value={nsSel}
                        disabled={!canManage || saving}
                        onChange={(e) =>
                          setSel((prev) => ({
                            ...prev,
                            [dim]: { ...prev[dim], [NOT_SPECIFIED]: e.target.value },
                          }))
                        }
                        className={selectCls}
                      >
                        <option value={IGNORE}>— Ignore —</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id} disabled={!s.canManage && nsSel !== s.id}>
                            {s.name}
                            {s.directConnection ? ' (has its own QuickBooks)' : ''}
                          </option>
                        ))}
                      </select>
                    </li>
                  </ul>

                  {/* Honesty line — nothing silently vanishes. */}
                  {(anyUndecided || anyIgnored) && (
                    <p className="mt-2.5 flex items-start gap-1.5 text-[13.5px] text-muted">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                      Unmapped and ignored {dimNoun(dim, true)} aren&apos;t imported — their activity
                      stays out of every school&apos;s statements.
                    </p>
                  )}

                  {mappingErr && <div className="mt-3"><FormError>{mappingErr}</FormError></div>}

                  {canManage && (
                    <button
                      type="button"
                      onClick={saveMapping}
                      disabled={busy}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-5 py-2.5 text-[15px] font-bold text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      {saving ? 'Saving…' : 'Save mapping'}
                    </button>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* A mapping-load failure must stay visible even with the editor
          collapsed — otherwise the import count silently reads 0 while the
          status line above still shows the server's mapped count. */}
      {mappingErr && !showMapping && (
        <div className="mt-3"><FormError>{mappingErr}</FormError></div>
      )}

      {/* ── Import all mapped schools ─────────────────────────────────────────── */}
      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-[13.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            Also import (each run):
          </span>
          {[
            ['priorYear', 'Prior year'],
            ['monthly', 'Monthly'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[14.5px] text-navy">
              <input
                type="checkbox"
                checked={importScope[key]}
                disabled={busy}
                onChange={(e) => setImportScope((s) => ({ ...s, [key]: e.target.checked }))}
                className="h-4 w-4 accent-gold"
              />
              {label}
            </label>
          ))}
          <button
            type="button"
            disabled={busy || pendingDisconnect || importCount === 0}
            onClick={runImport}
            title={importCount === 0 ? 'Map at least one location to a school first' : undefined}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-4 py-2 text-[14.5px] font-bold text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Import all mapped schools ({importCount})
          </button>
        </div>
      )}

      {/* Import outcome — one row per school + honest totals. */}
      {importResult && !importing && (
        <div className="mt-3 rounded-lg border border-gold/40 bg-white px-4 py-3">
          <p className="text-[14px] font-semibold text-navy">
            {importResult.synced} synced · {importResult.failed} failed · {importResult.skipped} skipped
          </p>
          <ul className="mt-2 space-y-1.5">
            {(importResult.results ?? []).map((r) => (
              <li
                key={r.schoolId}
                className={`flex items-start gap-2 text-[14px] ${r.status === 'failed' ? 'text-danger' : 'text-muted'}`}
              >
                {r.status === 'synced' ? (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold" />
                ) : (
                  <XCircle size={15} className="mt-0.5 shrink-0" />
                )}
                <span>
                  <span className="font-medium text-navy">{r.name}</span>
                  {r.dimensionNames?.length > 0 && (
                    <span className="text-muted"> ({r.dimensionNames.join(', ')})</span>
                  )}
                  {' · '}
                  {r.status === 'synced'
                    ? `Imported${r.periodLabel ? ` into ${r.periodLabel}` : ''} — ${scopeSummary(r.scope) || 'done'}`
                    : r.reason}
                  {r.balancePlug != null && r.balancePlug !== 0 && (
                    <span className="text-muted">
                      {' '}
                      · includes an interlocation balance plug of {fmtWhole(r.balancePlug)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {(importResult.notSpecified?.revenue !== 0 || importResult.notSpecified?.expense !== 0) &&
            importResult.notSpecified && (
              <p className="mt-2.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[13.5px] text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  QuickBooks has unallocated &quot;Not Specified&quot; amounts this year — revenue{' '}
                  {fmtWhole(importResult.notSpecified.revenue)} · expense{' '}
                  {fmtWhole(importResult.notSpecified.expense)}. Map Not Specified to a school above, or
                  these amounts stay out of every school&apos;s statements.
                </span>
              </p>
            )}
        </div>
      )}
    </div>
  )
}
