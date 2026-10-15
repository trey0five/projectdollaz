// ─────────────────────────────────────────────────────────────────────────────
// StaffEvaluationsPanel — AIC Phase F. The Evaluations register tab on the HR &
// Staffing command center. Default export = the light register table (person /
// cycle / due / completed / status / actions); named export
// StaffEvaluationFormModal = the shared EntityFormModal add+edit form (the
// VendorsPanel ownership pattern, except the panel owns its own modal state
// because HR has no batch Add-data option for this register yet).
//
// THIS SURFACE IS THE ONLY PLACE IN THE PRODUCT A STAFF NAME MAY APPEAR.
// The register is adult-staff employment PII and the server gates it to
// owner/accountant — a viewer gets 403. This component NEVER renders itself in
// that case: `restricted` (whether we declined to ask, or the server declined to
// answer) prints the ONE frozen sentence from staffEvaluationMeta and nothing
// else. The count above it comes from /summary, which returns integers only.
//
// NOTHING HERE IS COMPUTED. `isOverdue` and `daysOverdue` arrive on each row from
// the server; there is no client-side date arithmetic and no client-side percentage
// anywhere on this path — a "% of staff evaluated" would need a staff denominator
// that GovernancePerson (a partial, opt-in roster) cannot vouch for.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { ClipboardCheck, Pencil, Trash2, Plus, Lock } from 'lucide-react'
import EntityFormModal, {
  Field,
  Select,
  fieldInput,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { governancePeopleApi, isModuleNotLicensed } from '../../lib/api.js'
import { shortDate } from '../../lib/dates.js'
import { DataTable, Pill, Button } from '../ui/surface/index.js'
import { AuroraEmpty, AuroraLightButton } from '../ui/aurora/index.js'
import '../../styles/pending/b1-domain.css'
import {
  STAFF_EVALUATION_STATUSES,
  STATUS_BADGE,
  OVERDUE_BADGE,
  VIEWER_RESTRICTION_NOTE,
  isoDay,
  statusLabel,
} from './staffEvaluationMeta.js'

// ═══════════════════════════ THE ADD / EDIT MODAL ════════════════════════════

const EMPTY_FORM = {
  personId: '',
  cycleLabel: '',
  dueDate: '',
  completedDate: '',
  evaluatorName: '',
  status: 'scheduled',
  notes: '',
}

export function evaluationToForm(ev) {
  return {
    personId: ev.personId ?? '',
    cycleLabel: ev.cycleLabel ?? '',
    dueDate: isoDay(ev.dueDate),
    completedDate: isoDay(ev.completedDate),
    evaluatorName: ev.evaluatorName ?? '',
    status: ev.status ?? 'scheduled',
    notes: ev.notes ?? '',
  }
}

/**
 * Body builders, key by key (the global forbidNonWhitelisted pipe 400s ANY
 * unexpected key). Create carries `personId`; UPDATE DELIBERATELY DOES NOT —
 * re-pointing an evaluation at a different person is a delete plus a create, not
 * an edit, and a stray personId on a PATCH is a 400.
 */
function toCreateBody(form) {
  return {
    personId: form.personId,
    cycleLabel: form.cycleLabel.trim(),
    dueDate: form.dueDate,
    completedDate: form.completedDate ? form.completedDate : null,
    evaluatorName: form.evaluatorName.trim() ? form.evaluatorName.trim() : null,
    status: form.status,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

function toUpdateBody(form) {
  return {
    cycleLabel: form.cycleLabel.trim(),
    dueDate: form.dueDate,
    completedDate: form.completedDate ? form.completedDate : null,
    evaluatorName: form.evaluatorName.trim() ? form.evaluatorName.trim() : null,
    status: form.status,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

/**
 * The staff picker's options. `personId` must be a GovernancePerson OF THIS SCHOOL
 * whose `groups` contains 'staff' — the server refuses anything else with a named
 * reason, so the select offers exactly that set and nothing wider.
 *
 * The people register lives behind the GOVERNANCE module, so an HR-licensed school
 * without Governance gets a 402 here. That is stated plainly rather than shown as
 * an empty dropdown: an empty select and an unavailable register are different
 * facts. Loaded lazily on modal open — the register tab itself never issues a
 * governance request.
 */
function useStaffPeople(schoolId, enabled) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState('')

  // Microtask defer + cancelled flag (the house useFacilities/usePeople idiom) so
  // no setState runs synchronously inside the effect body.
  useEffect(() => {
    if (!schoolId || !enabled) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setUnavailable('')
      governancePeopleApi
        .list(schoolId, { group: 'staff' })
        .then((res) => {
          if (cancelled) return
          const raw = Array.isArray(res.data) ? res.data : (res.data?.people ?? [])
          // Belt and braces: the ?group= filter is the server's, but the panel
          // only ever offers people the server will accept.
          setPeople(raw.filter((p) => (p.groups ?? []).includes('staff')))
        })
        .catch((e) => {
          if (cancelled) return
          setPeople([])
          setUnavailable(
            isModuleNotLicensed(e)
              ? 'Your people register lives in the Governance module, which isn’t on your plan yet. Add Governance to pick a member of staff here.'
              : 'We could not load your people register just now.',
          )
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, enabled])

  return { people, loading, unavailable }
}

export function StaffEvaluationFormModal({
  open,
  schoolId,
  initial,
  editingPersonName,
  onClose,
  onSave,
  reduce,
}) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isEdit = !!initial
  const { people, loading: peopleLoading, unavailable } = useStaffPeople(schoolId, open && !isEdit)

  const submit = async (e) => {
    e.preventDefault()
    if (!isEdit && !form.personId) {
      setErr('Pick the member of staff this evaluation is for.')
      return
    }
    if (!form.cycleLabel.trim()) {
      setErr('Name the evaluation cycle — e.g. “2025-26 annual cycle”.')
      return
    }
    // A due date is REQUIRED, and not as form politeness: an evaluation with no due
    // date can be neither overdue nor current, so it is not a cycle record at all.
    if (!form.dueDate) {
      setErr('A due date is required — it is the date the overdue count reads.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(isEdit ? toUpdateBody(form) : toCreateBody(form))
      onClose()
    } catch (e2) {
      setErr(e2?.response?.data?.message ?? 'Could not save this evaluation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={ClipboardCheck}
      title={isEdit ? 'Edit evaluation' : 'Add staff evaluation'}
      subtitle="A cycle record: who, when it was due, when it was done"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={isEdit ? 'Save evaluation' : 'Add evaluation'}
      reduce={reduce}
    >
      {isEdit ? (
        <Field label="Member of staff" span={2} index={0} reduce={reduce}>
          <input value={editingPersonName ?? '—'} readOnly disabled className={fieldInput} />
          <span className="mt-1 block text-[11.5px] text-ink2">
            An evaluation stays with the person it was recorded for. To move it, delete this record
            and add a new one.
          </span>
        </Field>
      ) : (
        <Field label="Member of staff" span={2} index={0} reduce={reduce}>
          <Select value={form.personId} onChange={set('personId')} disabled={peopleLoading}>
            <option value="">{peopleLoading ? 'Loading your people…' : '— pick a person —'}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` — ${p.title}` : ''}
              </option>
            ))}
          </Select>
          {unavailable ? (
            <span className="mt-1 block text-[11.5px] text-ink2">{unavailable}</span>
          ) : !peopleLoading && people.length === 0 ? (
            <span className="mt-1 block text-[11.5px] text-ink2">
              No one on your people register is in the Staff group yet. Add them in Governance
              first — we never keep a second copy of a person.
            </span>
          ) : null}
        </Field>
      )}
      <Field label="Cycle" span={2} index={1} reduce={reduce}>
        <input
          value={form.cycleLabel}
          onChange={set('cycleLabel')}
          maxLength={80}
          placeholder="e.g. 2025-26 annual cycle"
          className={fieldInput}
        />
      </Field>
      <Field label="Due date" index={2} reduce={reduce}>
        <DatePicker
          value={form.dueDate}
          onChange={(v) => set('dueDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Completed date" index={3} reduce={reduce}>
        <DatePicker
          value={form.completedDate}
          onChange={(v) => set('completedDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Evaluator" index={4} reduce={reduce}>
        <input
          value={form.evaluatorName}
          onChange={set('evaluatorName')}
          maxLength={200}
          placeholder="e.g. Head of School"
          className={fieldInput}
        />
      </Field>
      <Field label="Status" index={5} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {STAFF_EVALUATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" span={2} index={6} reduce={reduce}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          maxLength={4000}
          rows={2}
          className={fieldTextarea}
        />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ THE REGISTER TABLE ══════════════════════════════

function StatusPill({ def, children }) {
  if (!def) return null
  return (
    <Pill variant="status" tone={def.tone}>
      {children ?? def.label}
    </Pill>
  )
}

/** Loading / error / empty — a ruled block on the ground, never a dashed card. */
function StateRow({ title, children, error, action }) {
  return (
    <div className="b1-empty" role={error ? 'alert' : undefined}>
      {title ? <p className="b1-empty-title">{title}</p> : null}
      {children ? <p className={error ? 'b1-empty-err' : undefined}>{children}</p> : null}
      {action}
    </div>
  )
}

/** The restricted surface: the frozen sentence, verbatim, and nothing else. */
function RestrictedPanel() {
  return (
    <div className="b1-empty">
      <Lock size={18} className="text-ink2" aria-hidden="true" />
      <p className="max-w-lg text-[14px] leading-relaxed">{VIEWER_RESTRICTION_NOTE}</p>
    </div>
  )
}

export default function StaffEvaluationsPanel({
  evaluations = [],
  loading,
  error,
  restricted,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}) {
  // The restriction wins over every other state — including loading and error.
  // There is one sentence whether we declined to ask or the server declined to
  // answer, and no partial register ever leaks past it.
  if (restricted) return <RestrictedPanel />

  if (loading) return <StateRow>Loading staff evaluations…</StateRow>
  if (error) return <StateRow error>{error}</StateRow>
  if (evaluations.length === 0)
    return (
      /* The SAME condition the Evidence Index states, because it is the same
         promise: the accreditation row is answered by an evaluation carrying
         the date it was COMPLETED, not by the existence of a scheduled one.
         Saying only "record your cycle here" made the promise unkeepable for
         every school that recorded a cycle and left it open. */
      <AuroraEmpty
        icon={ClipboardCheck}
        text="No staff evaluations yet."
        sub="Once one has a completed date, it counts as accreditation proof."
        action={
          canEdit && onAdd ? (
            <AuroraLightButton variant="ghost" onClick={onAdd} icon={<Plus size={15} aria-hidden="true" />}>
              Add evaluation
            </AuroraLightButton>
          ) : null
        }
      />
    )

  const columns = [
    {
      key: 'personName',
      header: 'Person',
      sortable: true,
      render: (ev) => (
        <div className="py-1.5">
          <span className="font-semibold">{ev.personName ?? '—'}</span>
          {ev.personTitle ? <span className="dt-sub">{ev.personTitle}</span> : null}
        </div>
      ),
    },
    {
      key: 'cycleLabel',
      header: 'Cycle',
      render: (ev) => (
        <div className="py-1.5">
          <span>{ev.cycleLabel ?? '—'}</span>
          {ev.evaluatorName ? <span className="dt-sub">Evaluator: {ev.evaluatorName}</span> : null}
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortable: true,
      render: (ev) => (
        <>
          <span className="whitespace-nowrap font-semibold">{shortDate(ev.dueDate) ?? '—'}</span>
          {/* `isOverdue` / `daysOverdue` are the SERVER's — the client does no
              date math and never guesses at one it was not given. */}
          {ev.isOverdue ? (
            <span className="dt-sub">
              {typeof ev.daysOverdue === 'number' ? `${ev.daysOverdue}d past due` : 'past due'}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'completedDate',
      header: 'Completed',
      sortable: true,
      render: (ev) => <span className="whitespace-nowrap text-ink2">{ev.completedDate ? shortDate(ev.completedDate) : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (ev) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill def={STATUS_BADGE[ev.status]}>{statusLabel(ev.status)}</StatusPill>
          {ev.isOverdue ? <StatusPill def={OVERDUE_BADGE} /> : null}
        </div>
      ),
    },
  ]
  if (canEdit)
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'dt-num',
      className: 'dt-num',
      render: (ev) => (
        <div className="dt-actions inline-flex justify-end gap-1">
          <button
            type="button"
            onClick={() => onEdit(ev)}
            aria-label={`Edit ${ev.cycleLabel ?? 'evaluation'}`}
            title="Edit"
            className="b1-icon-act"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(ev)}
            aria-label={`Delete ${ev.cycleLabel ?? 'evaluation'}`}
            title="Delete"
            className="b1-icon-act b1-icon-act-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    })

  /* No add button here on the populated register: the command center's own
     "+ New" already owns that action for the active tab. The empty state keeps
     its CTA because there is no register there to act on. */
  return (
    <DataTable
      caption="Staff evaluations"
      columns={columns}
      rows={evaluations}
      markOf={(ev) => (ev.isOverdue ? 'risk' : ev.status === 'completed' ? 'good' : null)}
    />
  )
}
