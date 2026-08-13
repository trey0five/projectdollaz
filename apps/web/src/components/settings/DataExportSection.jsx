// ─────────────────────────────────────────────────────────────────────────────
// DataExportSection — "you own your data", as a button.
//
// This screen exists because of a question a prospect asked before signing:
// can we get our data out if we leave? A support-ticket answer does not settle
// it, because what they are really asking is whether they depend on our goodwill,
// our response time, or our continued existence. The honest answer is a button
// they can press without telling anyone.
//
// So the copy here is deliberately plain and slightly generous. Nothing about
// leaving is discouraged, nothing is buried, and the archive's contents are
// listed before it is requested rather than after.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Download, Loader2, Package, ShieldCheck } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'
import { exportApi } from '../../lib/api.js'

const EASE = [0.2, 0.8, 0.2, 1]

const fmtBytes = (n) => {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const fmtWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export default function DataExportSection() {
  const { activeSchool } = useSchools()
  const { orgId, orgName, isMultiSchool } = useScope()
  const schoolId = activeSchool?.id ?? null
  const isOwner = activeSchool?.role === 'owner'
  // 'school' | 'network' — the network archive is foldered per school and only
  // contains the schools this caller actually owns.
  const [scope, setScope] = useState('school')
  const networkAvailable = isMultiSchool && !!orgId

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    try {
      const res = scope === 'network' && orgId ? await exportApi.orgList(orgId) : await exportApi.list(schoolId)
      setRows(res.data ?? res ?? [])
      setError('')
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not load your exports.')
    } finally {
      setLoading(false)
    }
  }, [schoolId, scope, orgId])

  useEffect(() => {
    load()
  }, [load])

  // While one is building, poll — the request returns before the work is done,
  // so without this the row sits on "preparing" until the page is reloaded.
  useEffect(() => {
    const running = rows.some((r) => r.status === 'running')
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      return undefined
    }
    if (!pollRef.current) pollRef.current = setInterval(load, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [rows, load])

  const request = async () => {
    setBusy(true)
    setError('')
    try {
      if (scope === 'network' && orgId) await exportApi.orgRequest(orgId)
      else await exportApi.request(schoolId)
      await load()
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not start that export.')
    } finally {
      setBusy(false)
    }
  }

  const download = async (id) => {
    setError('')
    try {
      const res =
        scope === 'network' && orgId ? await exportApi.orgDownloadUrl(orgId, id) : await exportApi.downloadUrl(schoolId, id)
      const url = (res.data ?? res)?.url
      if (url) window.location.assign(url)
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not open that download.')
    }
  }

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-navy/10 bg-white p-6">
        <h2 className="font-serif text-[22px] font-semibold text-navy">Export your data</h2>
        <p className="mt-2 max-w-prose text-[13.5px] text-muted">
          A full export contains every student, gift, figure and audit entry your school holds here, so it is
          restricted to owners. Ask an owner at your school to run one — or export a single area from the page that
          owns it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-navy/10 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-[22px] font-semibold text-navy">Export your data</h2>
            <p className="mt-1.5 max-w-prose text-[13.5px] text-muted">
              {scope === 'network'
                ? `Every school in ${orgName ?? 'your network'} that you own, in one archive with a folder per school — every module, as spreadsheets you can open in Excel.`
                : 'Your school owns everything it puts into KYRO. This builds a complete copy — every module, as spreadsheets you can open in Excel — with no involvement from us and nothing to ask for.'}
            </p>
            {networkAvailable ? (
              <div className="mt-3 inline-flex rounded-lg border border-navy/15 p-0.5" role="group" aria-label="Export scope">
                {[
                  ['school', activeSchool?.name ?? 'This school'],
                  ['network', 'Whole network'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={scope === key}
                    onClick={() => setScope(key)}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      scope === key ? 'bg-navy text-white' : 'text-muted hover:text-navy'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={request}
            disabled={busy}
            className="shrink-0 rounded-xl bg-navy px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.1em] text-white transition-opacity disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Export everything'}
          </button>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {[
            {
              Icon: Package,
              t: scope === 'network' ? 'Every school you own' : 'Every module',
              d:
                scope === 'network'
                  ? 'One folder per school, each with finance, enrollment, academics, governance and the rest. Schools you do not own are not included.'
                  : 'Finance, enrollment, academics, governance, accreditation, facilities, advancement and your audit log.',
            },
            { Icon: ShieldCheck, t: 'No credentials', d: 'Connection tokens for QuickBooks and your SIS are stripped — they are keys to other systems, not your data.' },
            { Icon: Download, t: 'Yours to keep', d: 'Plain CSV. Nothing in the archive needs KYRO to read it, now or later.' },
          ].map(({ Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-navy/10 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
                <Icon size={14} className="text-navy/60" /> {t}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>

        {error ? <p className="mt-3 text-[12.5px] text-danger">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-navy/10 bg-white p-6">
        <h3 className="font-serif text-[18px] font-semibold text-navy">Your exports</h3>
        <p className="mt-1 text-[12.5px] text-muted">
          A finished archive stays available for seven days, then the file is removed. The record of it stays here.
          Run a new one whenever you like.
          {scope === 'network'
            ? ' Because a network pull takes a complete copy of each school’s records, every owner at those schools is told it happened.'
            : ' Every other owner at your school is told when an export is requested.'}
        </p>

        {loading ? (
          <p className="mt-4 text-[13px] text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted">You have not exported anything yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r, i) => {
              const expired = r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()
              const files = Object.keys(r.rowCounts ?? {}).length
              const totalRows = Object.values(r.rowCounts ?? {}).reduce((a, b) => a + b, 0)
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: i * 0.04 }}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-navy/10 px-4 py-3"
                >
                  <span className="shrink-0">
                    {r.status === 'running' ? (
                      <Loader2 size={16} className="animate-spin text-navy/50" />
                    ) : r.status === 'failed' ? (
                      <AlertTriangle size={16} className="text-danger" />
                    ) : (
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    )}
                  </span>

                  <div className="min-w-[12rem] flex-1">
                    <p className="text-[13px] font-semibold text-navy">
                      {r.status === 'running'
                        ? 'Preparing your archive…'
                        : r.status === 'failed'
                          ? 'This export did not finish'
                          : `${files} files · ${totalRows.toLocaleString()} rows · ${fmtBytes(r.byteSize)}`}
                    </p>
                    <p className="text-[11.5px] text-muted">
                      {fmtWhen(r.createdAt)}
                      {r.status === 'ready' && !expired ? ' · available for 7 days' : ''}
                      {expired ? ' · expired' : ''}
                      {r.status === 'failed' && r.error ? ` · ${r.error}` : ''}
                    </p>
                  </div>

                  {r.status === 'ready' && !expired ? (
                    <button
                      type="button"
                      onClick={() => download(r.id)}
                      className="shrink-0 rounded-lg border border-navy/20 px-3.5 py-1.5 text-[12px] font-semibold text-navy hover:bg-navy/[0.04]"
                    >
                      Download
                    </button>
                  ) : null}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
