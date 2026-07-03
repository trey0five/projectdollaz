// Members & Roles, scoped to the ACTIVE school. Owner sees role dropdowns,
// Remove, an invite form, and a pending-invites list with Revoke. Accountants
// can view members + pending invites read-only. Viewers see the member table
// read-only. RBAC source of truth = activeSchool.role; the server is still
// authoritative (LAST_OWNER 409 is surfaced inline). Refetches after mutations.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Mail, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSchools } from '../../context/SchoolContext.jsx'
import { schoolsApi, apiErrorMessage, apiErrorCode } from '../../lib/api.js'
import { memberRoleLabel } from '../../lib/roleLabels.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

// The stored enum (owner/accountant/viewer) drives permissions; the labels shown
// are the briefing VIEWS (Leadership/Finance/Board) via memberRoleLabel.
const ROLES = ['owner', 'accountant', 'viewer']

export default function MembersSection() {
  const { user } = useAuth()
  const { activeSchool, activeId, reloadSchools } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  const canView = isOwner || activeSchool?.role === 'accountant'

  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [rowErr, setRowErr] = useState({}) // userId/inviteId -> message

  const load = useCallback(async () => {
    if (!activeId) return
    setLoading(true)
    try {
      const reqs = [schoolsApi.members(activeId)]
      if (canView) reqs.push(schoolsApi.listInvitations(activeId))
      const [m, inv] = await Promise.all(reqs)
      setMembers(m.data || [])
      setInvites(inv?.data || [])
    } catch {
      setMembers([])
      setInvites([])
    } finally {
      setLoading(false)
    }
  }, [activeId, canView])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const ownerCount = members.filter((m) => m.role === 'owner').length

  const setErr = (key, msg) => setRowErr((p) => ({ ...p, [key]: msg }))
  const clearErr = (key) => setRowErr((p) => ({ ...p, [key]: undefined }))

  const onRoleChange = async (m, role) => {
    if (role === m.role) return
    clearErr(m.id)
    try {
      await schoolsApi.updateMemberRole(activeId, m.id, { role })
      await load()
      // If we changed our own role, refresh schools so RBAC UI updates.
      if (m.id === user?.id) await reloadSchools()
    } catch (err) {
      const msg =
        apiErrorCode(err) === 'LAST_OWNER'
          ? 'A school must keep at least one owner.'
          : apiErrorMessage(err, 'Could not change the role.')
      setErr(m.id, msg)
    }
  }

  const onRemove = async (m) => {
    clearErr(m.id)
    try {
      await schoolsApi.removeMember(activeId, m.id)
      await load()
      if (m.id === user?.id) await reloadSchools()
    } catch (err) {
      const msg =
        apiErrorCode(err) === 'LAST_OWNER'
          ? 'A school must keep at least one owner.'
          : apiErrorMessage(err, 'Could not remove the member.')
      setErr(m.id, msg)
    }
  }

  // Invite form
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteErr, setInviteErr] = useState('')
  const [inviteOk, setInviteOk] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)

  const sendInvite = async () => {
    if (!email.trim() || inviteBusy) return
    setInviteErr('')
    setInviteOk('')
    setInviteBusy(true)
    try {
      await schoolsApi.invite(activeId, { email: email.trim(), role: inviteRole })
      setEmail('')
      setInviteOk('Invitation sent.')
      await load()
    } catch (err) {
      setInviteErr(apiErrorMessage(err, 'Could not send the invitation.'))
    } finally {
      setInviteBusy(false)
    }
  }

  const revoke = async (inv) => {
    clearErr(inv.id)
    try {
      await schoolsApi.revokeInvitation(activeId, inv.id)
      await load()
    } catch (err) {
      setErr(inv.id, apiErrorMessage(err, 'Could not revoke the invitation.'))
    }
  }

  if (!activeSchool) {
    return (
      <SettingsCard title="Members & Roles">
        <p className="text-[16px] text-muted">Select a school first.</p>
      </SettingsCard>
    )
  }

  if (!canView) {
    return (
      <SettingsCard title="Members & Roles" description={activeSchool.name}>
        <div className="flex items-center gap-2 text-[16px] text-muted">
          <ShieldAlert size={16} /> You do not have permission to manage members for this
          school.
        </div>
      </SettingsCard>
    )
  }

  const inputCls =
    'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold'

  return (
    <>
      <SettingsCard
        title="Members"
        description={`Active school: ${activeSchool.name}`}
      >
        {loading ? (
          <p className="text-[16px] text-muted">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[16px]">
              <thead>
                <tr className="border-b border-border text-[14px] uppercase tracking-[0.1em] text-muted">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Email</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  {isOwner && <th className="py-2 font-semibold" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const name =
                    [m.first_name, m.last_name].filter(Boolean).join(' ') || '—'
                  const isSoleOwner = m.role === 'owner' && ownerCount <= 1
                  return (
                    <tr key={m.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3 text-ink">
                        {name}
                        {m.id === user?.id && (
                          <span className="ml-1 text-[14px] text-muted">(you)</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-muted">{m.email}</td>
                      <td className="py-3 pr-3">
                        {isOwner ? (
                          <select
                            value={m.role}
                            disabled={isSoleOwner}
                            onChange={(e) => onRoleChange(m, e.target.value)}
                            title={
                              isSoleOwner
                                ? 'A school must keep at least one owner'
                                : undefined
                            }
                            className="min-h-[40px] rounded-lg border-2 border-border bg-white px-3 py-1.5 text-[15px] text-ink outline-none focus:border-gold disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {memberRoleLabel(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-ink">{memberRoleLabel(m.role)}</span>
                        )}
                        {rowErr[m.id] && (
                          <p className="mt-1 text-[14px] text-danger">{rowErr[m.id]}</p>
                        )}
                      </td>
                      {isOwner && (
                        <td className="py-3 text-right">
                          <button
                            onClick={() => onRemove(m)}
                            disabled={isSoleOwner}
                            title={
                              isSoleOwner
                                ? 'A school must keep at least one owner'
                                : 'Remove member'
                            }
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-[15px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {isOwner && (
        <SettingsCard title="Invite a member" description="They receive an email invitation.">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                className={inputCls}
              />
            </div>
            <div className="sm:w-44">
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={inputCls}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {memberRoleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <motion.button
              whileTap={{ scale: email.trim() ? 0.98 : 1 }}
              onClick={sendInvite}
              disabled={!email.trim() || inviteBusy}
              className="btn-primary min-h-[48px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviteBusy ? 'Sending…' : 'Send invite'}
            </motion.button>
          </div>
          {inviteErr && (
            <div className="mt-3">
              <FormError>{inviteErr}</FormError>
            </div>
          )}
          {inviteOk && (
            <div className="mt-3">
              <FormSuccess>{inviteOk}</FormSuccess>
            </div>
          )}
        </SettingsCard>
      )}

      <SettingsCard title="Pending invitations" description="Unaccepted, unexpired invites.">
        {invites.length === 0 ? (
          <p className="text-[16px] text-muted">No pending invitations.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-navy/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-2 text-[16px] text-ink">
                  <Mail size={15} className="text-gold" />
                  <span>{inv.email}</span>
                  <span className="rounded bg-gold/15 px-2 py-0.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-navy">
                    {memberRoleLabel(inv.role)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {rowErr[inv.id] && (
                    <span className="text-[14px] text-danger">{rowErr[inv.id]}</span>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => revoke(inv)}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-[15px] font-semibold text-danger transition-colors hover:bg-danger/10"
                    >
                      <Trash2 size={14} /> Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </>
  )
}
