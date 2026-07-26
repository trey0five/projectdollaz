// ─────────────────────────────────────────────────────────────────────────────
// CommitteeMembers — the expanded-row panel under a committee in the Committees
// register: the member list (role badges, chair starred) + the add-member picker
// (a Select over the school's governance people + a MEMBER_ROLES role select).
// All persistence goes through the useCommittees membership wiring the parent
// passes down (listMembers / addMember / updateMemberRole / removeMember) so the
// committees list's additive memberCount / chairPersonName stay fresh.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Star, UserPlus, X } from 'lucide-react'
import { GOV_HUE, MEMBER_ROLES, roleLabel } from './peopleMeta.js'

function RoleBadge({ role }) {
  const chair = role === 'chair'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${
        chair ? '' : 'border-rule/60 bg-section text-muted'
      }`}
      style={
        chair
          ? { borderColor: `${GOV_HUE}55`, backgroundColor: `${GOV_HUE}14`, color: '#5B21B6' }
          : undefined
      }
    >
      {chair ? <Star size={11} fill="currentColor" /> : null}
      {roleLabel(role)}
    </span>
  )
}

export default function CommitteeMembers({
  committee,
  people,
  canEdit,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
}) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [pickPersonId, setPickPersonId] = useState('')
  const [pickRole, setPickRole] = useState('member')
  const [busy, setBusy] = useState(false)

  const committeeId = committee.id

  const load = useCallback(async () => {
    setErr('')
    try {
      const rows = await listMembers(committeeId)
      setMembers(rows)
    } catch {
      setErr('Could not load this committee’s members.')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [committeeId, listMembers])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        load()
      }
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const onAdd = async () => {
    if (!pickPersonId || busy) return
    setBusy(true)
    setErr('')
    try {
      await addMember(committeeId, { personId: pickPersonId, role: pickRole })
      setPickPersonId('')
      setPickRole('member')
      await load()
    } catch (e) {
      setErr(
        e?.response?.status === 409
          ? 'They’re already on this committee.'
          : 'Could not add that member.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onRole = async (m, role) => {
    setErr('')
    try {
      await updateMemberRole(committeeId, m.id, role)
      await load()
    } catch {
      setErr('Could not change that role.')
    }
  }

  const onRemove = async (m) => {
    setErr('')
    try {
      await removeMember(committeeId, m.id)
      await load()
    } catch {
      setErr('Could not remove that member.')
    }
  }

  // People not already on the committee, active first, name order (list is
  // already ordered active desc, name asc from the API).
  const onCommittee = new Set(members.map((m) => m.personId))
  const candidates = people.filter((p) => !onCommittee.has(p.id))

  return (
    <div
      className="space-y-2.5 rounded-xl border p-3.5"
      style={{ borderColor: `${GOV_HUE}33`, backgroundColor: `${GOV_HUE}08` }}
    >
      {loading ? (
        <p className="text-[13px] text-muted">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-[13px] italic text-muted">
          No members yet{committee.chair ? ` — the legacy chair note says “${committee.chair}”` : ''}.
          {canEdit ? ' Add people below.' : ''}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-rule/50 bg-white px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-navy">
                {m.person?.name ?? '—'}
                {m.person?.title ? (
                  <span className="ml-1.5 font-normal italic text-muted">{m.person.title}</span>
                ) : null}
              </span>
              <RoleBadge role={m.role} />
              {canEdit ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => onRole(m, e.target.value)}
                    aria-label={`Role for ${m.person?.name ?? 'member'}`}
                    className="rounded-lg border border-rule/70 bg-white px-1.5 py-1 text-[12px] font-semibold text-navy"
                  >
                    {MEMBER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    aria-label={`Remove ${m.person?.name ?? 'member'} from ${committee.name}`}
                    title="Remove from committee"
                    className="rounded-lg border border-rule/60 p-1 text-muted transition hover:border-danger/50 hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule/40 pt-2.5">
          <select
            value={pickPersonId}
            onChange={(e) => setPickPersonId(e.target.value)}
            aria-label="Person to add"
            className="min-w-0 flex-1 rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] font-semibold text-navy"
          >
            <option value="">
              {candidates.length ? 'Add a person…' : 'Everyone’s already on it'}
            </option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` — ${p.title}` : ''}
              </option>
            ))}
          </select>
          <select
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value)}
            aria-label="Role"
            className="rounded-lg border border-rule/70 bg-white px-2 py-1.5 text-[12.5px] font-semibold text-navy"
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAdd}
            disabled={!pickPersonId || busy}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: GOV_HUE }}
          >
            <UserPlus size={13} />
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      ) : null}

      {err ? <p className="text-[12.5px] font-medium text-danger">{err}</p> : null}
    </div>
  )
}
