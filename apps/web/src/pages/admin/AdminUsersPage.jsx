// ─────────────────────────────────────────────────────────────────────────────
// AdminUsersPage — every user across all tenants. Reads GET /admin/users with a
// debounced search + prev/next pagination. Each row expands to its per-school
// memberships. Modules/orgs/role(s) are pre-resolved server-side (contract §1).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronRight, ChevronDown } from 'lucide-react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import { STATE_NAMES } from '../../data/usMapPaths.js'
import {
  SectionCard,
  Table,
  VerifiedBadge,
  RoleBadge,
  StatusBadge,
  MfaBadge,
  ModuleChips,
  LoadState,
  ErrorState,
  EmptyState,
  fmtDateTime,
  relTime,
} from './_ui.jsx'

const PAGE_SIZE = 25

function LastAccess({ user }) {
  if (!user.lastLoginAt && !user.lastLoginRegion) return <span className="text-muted">—</span>
  const place = [user.lastLoginCity, STATE_NAMES[user.lastLoginRegion] || user.lastLoginRegion]
    .filter(Boolean)
    .join(', ')
  return (
    <span title={user.lastLoginAt ? relTime(user.lastLoginAt) || '' : ''}>
      {place || <span className="text-muted">Unknown location</span>}
    </span>
  )
}

function UserRow({ u }) {
  const [open, setOpen] = useState(false)
  const roles = useMemo(
    () => Array.from(new Set((u.memberships || []).map((m) => m.role))),
    [u.memberships],
  )
  const orgNames = (u.organizations || []).map((o) => o.name)

  return (
    <>
      <tr className="align-top hover:bg-cream/60">
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-start gap-1 text-left"
          >
            <span className="mt-0.5 text-muted">
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="font-medium text-ink">{u.name}</span>
          </button>
        </td>
        <td className="px-3 py-2 text-muted">{u.email}</td>
        <td className="px-3 py-2">
          <VerifiedBadge verified={u.emailVerified} at={u.emailVerifiedAt} />
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-muted tabular-nums">
          {fmtDateTime(u.createdAt)}
        </td>
        <td className="px-3 py-2">
          <ModuleChips modules={u.modules} />
        </td>
        <td className="px-3 py-2 text-muted">
          {orgNames.length ? orgNames.join(', ') : '—'}
        </td>
        <td className="px-3 py-2">
          {roles.length ? (
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-muted">
          <LastAccess user={u} />
        </td>
        <td className="px-3 py-2">
          <MfaBadge on={u.totpEnabled} />
        </td>
      </tr>
      {open && (
        <tr className="bg-section/60">
          <td colSpan={9} className="px-3 py-3">
            <div className="pl-5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Memberships
              </div>
              {(u.memberships || []).length === 0 ? (
                <div className="text-xs text-muted">No school memberships.</div>
              ) : (
                <ul className="space-y-1">
                  {u.memberships.map((m) => (
                    <li key={m.schoolId} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-ink">{m.schoolName}</span>
                      <RoleBadge role={m.role} />
                      <StatusBadge status={m.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function AdminUsersPage() {
  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)

  // Debounce the search box → resets to page 1.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(rawSearch.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [rawSearch])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await adminApi.users({ search, page, pageSize: PAGE_SIZE })
      setData(res.data)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load users.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page])

  const total = data?.total ?? 0
  const users = data?.users || []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <SectionCard
      title="Users"
      subtitle={loading ? 'Loading…' : `${total.toLocaleString()} user${total === 1 ? '' : 's'} across all tenants`}
      right={
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-52 rounded-lg border border-border bg-white py-1.5 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-navy sm:w-64"
          />
        </div>
      }
    >
      {loading && !data ? (
        <LoadState label="Loading users…" />
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : users.length === 0 ? (
        <EmptyState label={search ? `No users match “${search}”.` : 'No users yet.'} />
      ) : (
        <>
          <Table
            head={[
              'Name',
              'Email',
              'Verified',
              'Signed up',
              'Modules',
              'Orgs',
              'Role(s)',
              'Last access',
              'MFA',
            ]}
          >
            {users.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">
              Page {data?.page ?? page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-section disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-section disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  )
}
