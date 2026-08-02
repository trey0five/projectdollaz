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
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardCheck, Pencil, Trash2, Plus, UserRound, Lock } from 'lucide-react'
import EntityFormModal, {
  Field,
  Select,
  fieldInput,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { governancePeopleApi, isModuleNotLicensed } from '../../lib/api.js'
import { shortDate } from '../../lib/dates.js'
import {
  HR_HUE,
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
          <span className="mt-1 block text-[11.5px] text-white/50">
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
            <span className="mt-1 block text-[11.5px] text-white/60">{unavailable}</span>
          ) : !peopleLoading && people.length === 0 ? (
            <span className="mt-1 block text-[11.5px] text-white/60">
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

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Pill({ def, children }) {
  if (!def) return null
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      {children ?? def.label}
    </span>
  )
}

function StateRow({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
      {children}
    </div>
  )
}

/** The restricted surface: the frozen sentence, verbatim, and nothing else. */
function RestrictedPanel() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: HR_HUE }}
      >
        <Lock size={20} />
      </span>
      <p className="max-w-lg text-[14px] leading-relaxed text-muted">{VIEWER_RESTRICTION_NOTE}</p>
    </div>
  )
}

export default function StaffEvaluationsPanel({
  evaluations = [],
  loading,
  error,
  restricted,
  canEdit,
  reduce,
  onAdd,
  onEdit,
  onDelete,
}) {
  // The restriction wins over every other state — including loading and error.
  // There is one sentence whether we declined to ask or the server declined to
  // answer, and no partial register ever leaks past it.
  if (restricted) return <RestrictedPanel />

  if (loading)
    return (
      <StateRow>
        <p className="text-[14px] text-muted">Loading staff evaluations…</p>
      </StateRow>
    )
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (evaluations.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No staff evaluations recorded yet.</p>
        {/* The SAME condition the Evidence Index states, because it is the same
            promise: the accreditation row is answered by an evaluation carrying
            the date it was COMPLETED, not by the existence of a scheduled one.
            Saying only "record your cycle here" made the promise unkeepable for
            every school that recorded a cycle and left it open. */}
        <p className="mt-1 text-[13px] text-muted">
          Record your evaluation cycle here, and once an evaluation carries the date it was
          completed, your accreditation evidence for it answers itself — we never ask you to enter
          it twice.
        </p>
        {canEdit && onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: HR_HUE }}
          >
            <Plus size={14} /> Add evaluation
          </button>
        ) : null}
      </StateRow>
    )

  return (
    <div className="space-y-3">
      {/* No add button here on the populated register: the command center's own
          "+ New" already owns that action for the active tab. The empty state
          keeps its CTA because there is no register there to act on. */}
      <div className="overflow-x-auto rounded-xl border border-rule/50">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-cream">
            <tr>
              <Th>Person</Th>
              <Th>Cycle</Th>
              <Th>Due</Th>
              <Th>Completed</Th>
              <Th>Status</Th>
              {canEdit ? <Th right>Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {evaluations.map((ev) => (
                <motion.tr
                  key={ev.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  className="group border-t border-rule/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-navy">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: HR_HUE }}
                      >
                        <UserRound size={14} />
                      </span>
                      {ev.personName ?? '—'}
                    </div>
                    {ev.personTitle ? (
                      <p className="mt-1 text-[12px] text-muted">{ev.personTitle}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div className="text-navy">{ev.cycleLabel ?? '—'}</div>
                    {ev.evaluatorName ? (
                      <p className="mt-0.5 text-[12px]">Evaluator: {ev.evaluatorName}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-navy">{shortDate(ev.dueDate) ?? '—'}</div>
                    {/* `isOverdue` / `daysOverdue` are the SERVER's — the client does
                        no date math and never guesses at one it was not given. */}
                    {ev.isOverdue ? (
                      <div className="mt-0.5 text-[11.5px] font-semibold text-danger">
                        {typeof ev.daysOverdue === 'number' ? `${ev.daysOverdue}d past due` : 'past due'}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {ev.completedDate ? shortDate(ev.completedDate) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill def={STATUS_BADGE[ev.status]}>{statusLabel(ev.status)}</Pill>
                      {ev.isOverdue ? <Pill def={OVERDUE_BADGE} /> : null}
                    </div>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onEdit(ev)}
                          aria-label={`Edit ${ev.cycleLabel ?? 'evaluation'}`}
                          title="Edit"
                          className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(ev)}
                          aria-label={`Delete ${ev.cycleLabel ?? 'evaluation'}`}
                          title="Delete"
                          className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}
