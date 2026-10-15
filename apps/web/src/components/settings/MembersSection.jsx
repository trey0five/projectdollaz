// Members & Roles, scoped to the ACTIVE school. Owner sees role dropdowns,
// Remove, an invite form, and a pending-invites list with Revoke. Accountants
// can view members + pending invites read-only. Viewers see the member table
// read-only. RBAC source of truth = activeSchool.role; the server is still
// authoritative (LAST_OWNER 409 is surfaced inline). Refetches after mutations.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import '../../styles/pending/b2-finance.css'
import { Trash2, Mail, ShieldAlert, Building2, Building } from 'lucide-react'
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

  // Position is a free-text field saved on blur (an org chart is not an enum).
  // Optimistic in the local row so typing never fights a refetch; a failure puts
  // the stored value back rather than leaving a title the server never took.
  const onTitleSave = async (m, raw) => {
    const next = raw.trim()
    if (next === (m.title ?? '')) return
    clearErr(m.id)
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, title: next || null } : x)))
    try {
      await schoolsApi.updateMemberTitle(activeId, m.id, next || null)
    } catch (err) {
      setMembers((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, title: m.title ?? null } : x)),
      )
      setErr(m.id, apiErrorMessage(err, 'Could not save the position.'))
    }
  }

  const onAccessChange = async (m, orgWide) => {
    clearErr(m.id)
    try {
      await schoolsApi.updateMemberAccess(activeId, m.id, { orgWide })
      await load()
      // If we changed our own access, refresh schools so the switcher updates.
      if (m.id === user?.id) await reloadSchools()
    } catch (err) {
      setErr(m.id, apiErrorMessage(err, 'Could not change access.'))
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
  const [inviteTitle, setInviteTitle] = useState('')
  const [inviteOrgWide, setInviteOrgWide] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const [inviteOk, setInviteOk] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)

  const sendInvite = async () => {
    if (!email.trim() || inviteBusy) return
    setInviteErr('')
    setInviteOk('')
    setInviteBusy(true)
    try {
      await schoolsApi.invite(activeId, {
        email: email.trim(),
        role: inviteRole,
        orgWide: inviteOrgWide,
        ...(inviteTitle.trim() ? { title: inviteTitle.trim() } : {}),
      })
      setEmail('')
      setInviteTitle('')
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
        <p className="text-[16px] text-ink2">Select a school first.</p>
      </SettingsCard>
    )
  }

  if (!canView) {
    return (
      <SettingsCard title="Members & Roles" description={activeSchool.name}>
        <div className="flex items-center gap-2 text-[16px] text-ink2">
          <ShieldAlert size={16} /> You do not have permission to manage members for this
          school.
        </div>
      </SettingsCard>
    )
  }

  const inputCls =
    'b2-input'

  return (
    <>
      <SettingsCard
        title="Members"
        description={`Active school: ${activeSchool.name}`}
      >
        {loading ? (
          <p className="text-[16px] text-ink2">Loading…</p>
        ) : (
          <div className="dt-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Position</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Access</th>
                  {isOwner && <th scope="col"><span className="sr-only">Remove</span></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const name =
                    [m.first_name, m.last_name].filter(Boolean).join(' ') || '—'
                  const isSoleOwner = m.role === 'owner' && ownerCount <= 1
                  return (
                    <tr key={m.id}>
                      <td className="py-2">
                        {name}
                        {m.id === user?.id && (
                          <span className="ml-1 text-[12px] text-ink2">(you)</span>
                        )}
                      </td>
                      {/* POSITION — what this person does here, as opposed to
                          Role, which is what they may see. It is what every
                          owner picker in the app shows beside their name, and
                          what lets an engine-suggested owner resolve to a
                          colleague instead of opening Unassigned. */}
                      <td className="py-2">
                        {isOwner ? (
                          <input
                            type="text"
                            defaultValue={m.title ?? ''}
                            maxLength={80}
                            placeholder="Add a position"
                            onBlur={(e) => onTitleSave(m, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                            className="b2-input h-8 w-32 placeholder:text-ink2"
                          />
                        ) : (
                          <span className={m.title ? 'text-ink' : 'text-ink2'}>
                            {m.title || '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-ink2">{m.email}</td>
                      <td className="py-2">
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
                            className="sel h-8 disabled:cursor-not-allowed disabled:opacity-60"
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
                          <p className="b2-callout mt-1" data-tone="risk">{rowErr[m.id]}</p>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-col items-start gap-1.5">
                          {m.orgWide ? (
                            <span className="pill">
                              <Building2 size={13} className="text-ink2" /> All schools
                            </span>
                          ) : (
                            <span className="pill text-ink2">
                              <Building size={13} /> This school
                            </span>
                          )}
                          {/* Owner-only toggle. Hidden for the owner's own row and
                              for owner-role members (never restrict/expand an owner). */}
                          {isOwner && m.id !== user?.id && m.role !== 'owner' && (
                            <button
                              onClick={() => onAccessChange(m, !m.orgWide)}
                              className="text-[13px] font-semibold text-ink underline decoration-hair underline-offset-2 transition-colors hover:text-ink2"
                            >
                              {m.orgWide ? 'Restrict to this school' : 'All schools'}
                            </button>
                          )}
                        </div>
                      </td>
                      {isOwner && (
                        <td className="py-2 text-right">
                          <button
                            onClick={() => onRemove(m)}
                            disabled={isSoleOwner}
                            title={
                              isSoleOwner
                                ? 'A school must keep at least one owner'
                                : 'Remove member'
                            }
                            aria-label={`Remove ${name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={15} aria-hidden="true" />
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
          {/* Five controls on one row crushed the email field to a few
              characters once Position joined it. Wrap, and give email a floor. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[16rem] flex-1">
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-ink2">
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
            <div className="min-w-[11rem] flex-1 sm:max-w-[14rem]">
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-ink2">
                Position
              </label>
              <input
                type="text"
                value={inviteTitle}
                onChange={(e) => setInviteTitle(e.target.value)}
                maxLength={80}
                placeholder="Business Manager"
                className={inputCls}
              />
            </div>
            <div className="sm:w-44">
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-ink2">
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
            <div className="sm:w-52">
              <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-ink2">
                Access
              </label>
              <select
                value={inviteOrgWide ? 'org' : 'school'}
                onChange={(e) => setInviteOrgWide(e.target.value === 'org')}
                className={inputCls}
              >
                <option value="school">This school</option>
                <option value="org">Entire organization</option>
              </select>
            </div>
            <motion.button
              whileTap={{ scale: email.trim() ? 0.98 : 1 }}
              onClick={sendInvite}
              disabled={!email.trim() || inviteBusy}
              className="btn btn-primary min-h-[48px] disabled:cursor-not-allowed disabled:opacity-50"
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
          <p className="mt-3 text-[14px] text-ink2">
            Entire organization = sees every school + the consolidated view.
          </p>
        </SettingsCard>
      )}

      <SettingsCard title="Pending invitations" description="Unaccepted, unexpired invites.">
        {invites.length === 0 ? (
          <p className="text-[16px] text-ink2">No pending invitations.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hair/[0.18] bg-ground px-4 py-3"
              >
                <div className="flex items-center gap-2 text-[16px] text-ink">
                  <Mail size={15} className="text-ink2" />
                  <span>{inv.email}</span>
                  <span className="rounded bg-ink/[0.04] px-2 py-0.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">
                    {memberRoleLabel(inv.role)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {rowErr[inv.id] && (
                    <span className="text-[14px] tone-risk">{rowErr[inv.id]}</span>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => revoke(inv)}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-hair/[0.18] px-3 py-1.5 text-[15px] font-semibold tone-risk transition-colors hover:bg-ink/[0.04]"
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
