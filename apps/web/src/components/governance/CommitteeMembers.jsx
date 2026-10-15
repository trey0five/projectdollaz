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
import { MEMBER_ROLES, roleLabel } from './peopleMeta.js'
import { Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'

function RoleBadge({ role }) {
  const chair = role === 'chair'
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink2">
      {chair ? <Star size={11} fill="currentColor" className="tone-hue" aria-hidden="true" /> : null}
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

  // Rendered INSIDE the committee's expanded table row: an indented ruled list
  // on the ground (no tinted card), the add-member controls on a hairline.
  return (
    <div className="space-y-2.5 border-l-2 pl-4" style={{ borderLeftColor: 'rgb(var(--c-module, 68 80 110))' }}>
      {loading ? (
        <p className="text-[13px] text-ink2">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-[13px] text-ink2">
          No members yet{committee.chair ? `. The legacy chair note says “${committee.chair}”` : ''}.
          {canEdit ? ' Add people below.' : ''}
        </p>
      ) : (
        <ul className="b1-list">
          {members.map((m) => (
            <li key={m.id} className="b1-row">
              <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">
                {m.person?.name ?? '—'}
                {m.person?.title ? <span className="ml-1.5 font-normal text-ink2">{m.person.title}</span> : null}
              </span>
              <RoleBadge role={m.role} />
              {canEdit ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => onRole(m, e.target.value)}
                    aria-label={`Role for ${m.person?.name ?? 'member'}`}
                    className="sel"
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
                    className="b1-icon-act b1-icon-act-danger"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            value={pickPersonId}
            onChange={(e) => setPickPersonId(e.target.value)}
            aria-label="Person to add"
            className="sel min-w-0 flex-1"
          >
            <option value="">{candidates.length ? 'Add a person…' : 'Everyone’s already on it'}</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` — ${p.title}` : ''}
              </option>
            ))}
          </select>
          <select value={pickRole} onChange={(e) => setPickRole(e.target.value)} aria-label="Role" className="sel">
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={onAdd} disabled={!pickPersonId || busy} icon={<UserPlus size={13} />}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </div>
      ) : null}

      {err ? <p className="text-[12.5px] font-medium text-risk">{err}</p> : null}
    </div>
  )
}
