// ─────────────────────────────────────────────────────────────────────────────
// AdminAdminsPage — the super-admin-only admin-management screen (Admins tab).
// Lists every effective admin (superadmin → db → env, from GET /admin/admins) with
// its source, and lets the super-admin revoke DB-granted admins or add new ones.
// Only DB-source rows are revocable; the super-admin's own row and env-allowlist
// rows are locked. The route is already super-admin-gated (AdminsRoute + server
// SuperadminGuard); this page also assumes a 403 is impossible for a valid caller.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { UserPlus, Lock } from 'lucide-react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { SectionCard, Table, LoadState, ErrorState, EmptyState, fmtDate } from './_ui.jsx'
import AdminSourceBadge from '../../components/admin/AdminSourceBadge.jsx'
import NewAdminModal from '../../components/admin/NewAdminModal.jsx'
import AdminToast from '../../components/admin/AdminToast.jsx'

function AdminRow({ row, isSelf, onRevoked, onError }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const revoke = async () => {
    setBusy(true)
    try {
      await adminApi.revokeAdmin(row.id)
      onRevoked(row) // optimistic remove + refetch upstream
    } catch (e) {
      onError(apiErrorMessage(e, 'Could not revoke this admin.'))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="align-middle hover:bg-cream/60">
      <td className="px-3 py-2 font-medium text-ink">{row.name || <span className="text-muted">—</span>}</td>
      <td className="px-3 py-2 text-muted">{row.email}</td>
      <td className="px-3 py-2">
        <AdminSourceBadge source={row.source} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted tabular-nums">{fmtDate(row.grantedAt)}</td>
      <td className="px-3 py-2 text-right">
        {isSelf ? (
          <span className="text-[11px] text-muted" title="You can’t revoke your own admin access.">
            You
          </span>
        ) : row.revocable ? (
          confirming ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[12px] text-muted">Revoke?</span>
              <button
                type="button"
                disabled={busy}
                onClick={revoke}
                className="rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? '…' : 'Yes'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted hover:bg-section"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-danger transition-colors hover:border-danger/40 hover:bg-danger/5"
            >
              Revoke
            </button>
          )
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-muted"
            title={
              row.source === 'superadmin'
                ? 'The super-admin can’t be revoked.'
                : 'Env-allowlist admins are managed by ops, not here.'
            }
          >
            <Lock size={11} /> Locked
          </span>
        )}
      </td>
    </tr>
  )
}

export default function AdminAdminsPage() {
  const { user } = useAuth()
  const [admins, setAdmins] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await adminApi.admins()
      setAdmins(res.data.admins || [])
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load admins.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const onRevoked = (row) => {
    // Optimistic remove, then refetch for the authoritative list.
    setAdmins((prev) => (prev || []).filter((a) => a.id !== row.id))
    setToast({ ok: true, message: `Revoked admin access for ${row.email}.` })
    load()
  }

  const onCreated = (data) => {
    const created = data?.created
    const email = data?.admin?.email || 'the user'
    setToast({
      ok: true,
      message: created ? `Created new admin ${email}.` : `Granted admin access to ${email}.`,
    })
    load()
  }

  return (
    <>
      <SectionCard
        title="Admins"
        subtitle={
          loading
            ? 'Loading…'
            : `${(admins || []).length} admin${(admins || []).length === 1 ? '' : 's'} · super-admin, granted, and allowlist`
        }
        right={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-coral px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <UserPlus size={15} /> New admin
          </button>
        }
      >
        {loading && !admins ? (
          <LoadState label="Loading admins…" />
        ) : err ? (
          <ErrorState message={err} onRetry={load} />
        ) : (admins || []).length === 0 ? (
          <EmptyState label="No admins yet." />
        ) : (
          <Table head={['Admin', 'Email', 'Source', 'Added', '']}>
            {admins.map((row) => (
              <AdminRow
                key={row.id ?? `env:${row.email}`}
                row={row}
                isSelf={!!row.id && row.id === user?.id}
                onRevoked={onRevoked}
                onError={(m) => setToast({ ok: false, message: m })}
              />
            ))}
          </Table>
        )}
      </SectionCard>

      <NewAdminModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreated} />
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}
