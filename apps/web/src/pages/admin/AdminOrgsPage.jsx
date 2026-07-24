// ─────────────────────────────────────────────────────────────────────────────
// AdminOrgsPage — every organization and, expanded, all of its members with the
// role each holds per school. Reads GET /admin/organizations. Client-side org
// name filter; each org card is collapsible (default collapsed).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronRight, ChevronDown, Building2 } from 'lucide-react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import {
  Table,
  RoleBadge,
  StatusBadge,
  LoadState,
  ErrorState,
  EmptyState,
  SECTION_TONE,
  fmtDate,
} from './_ui.jsx'

const TONE = SECTION_TONE.organizations

function OrgCard({ org }) {
  const [open, setOpen] = useState(false)
  const members = org.members || []
  const schoolCount = org.schoolCount ?? org.schools?.length ?? 0
  const memberCount = org.memberCount ?? 0
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-card">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg,${TONE[0]},${TONE[1]})` }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-muted">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg,${TONE[0]},${TONE[1]})`, boxShadow: `0 8px 18px -8px ${TONE[0]}` }}
        >
          <Building2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-base text-ink">{org.name}</div>
          <div className="text-xs text-muted">
            Created {fmtDate(org.createdAt)} · {schoolCount} school{schoolCount === 1 ? '' : 's'} ·{' '}
            {memberCount} member{memberCount === 1 ? '' : 's'}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-rule px-5 py-4">
          {members.length === 0 ? (
            <EmptyState label="No members in this organization." />
          ) : (
            <Table tone={TONE} head={['User', 'Email', 'School', 'Role', 'Status']}>
              {members.map((m, i) => (
                <tr key={`${m.userId}-${m.schoolId}-${i}`} className="transition-colors hover:bg-indigo-500/[0.05]">
                  <td className="px-3 py-2 font-medium text-ink">{m.name}</td>
                  <td className="px-3 py-2 text-muted">{m.email}</td>
                  <td className="px-3 py-2 text-muted">{m.schoolName}</td>
                  <td className="px-3 py-2">
                    <RoleBadge role={m.role} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
    </section>
  )
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await adminApi.organizations()
      setOrgs(res.data?.organizations || [])
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load organizations.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    if (!orgs) return []
    const q = filter.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter((o) => o.name?.toLowerCase().includes(q))
  }, [orgs, filter])

  if (loading) return <LoadState label="Loading organizations…" />
  if (err) return <ErrorState message={err} onRetry={load} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {orgs.length.toLocaleString()} organization{orgs.length === 1 ? '' : 's'} · expand any to
          see all members and their role per school
        </p>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter organizations…"
            className="w-52 rounded-lg border border-border bg-white py-1.5 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-navy sm:w-64"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={filter ? `No organizations match “${filter}”.` : 'No organizations yet.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OrgCard key={o.id} org={o} />
          ))}
        </div>
      )}
    </div>
  )
}
