// ─────────────────────────────────────────────────────────────────────────────
// StudentRegister — the enrollment RECORDS pane: the school's student roster as
// a server-filtered register (DomainCommandCenter register conventions). ALL
// filtering/sorting/paging is SERVER-side via the frozen query contract
// (studentFilters.buildStudentParams + sort/dir/page/pageSize); the chip filter
// bar + debounced search are the shared StudentFilterBar inside a `Toolbar`.
// PREMIUM UI P4: the roster is a `DataTable` directly on the ground — sticky
// caps head, 36px hairline rows, grade as text, status as a 2px mark + word,
// flags as Pills, no avatars, no wrapper card. Row → StudentSlideOver
// (view / delete); Edit opens the EntityFormModal-based StudentFormModal (the
// EDIT path — adding happens on the Add-data tab's RecordFlow / CSV import).
//
// FERPA: names render ONLY here + the slide-over (role-gated register routes).
// React 19 idioms: microtask-deferred fetch effects + a cancelled guard.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Trash2, UsersRound } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { DataTable, Toolbar, Button, Panel } from '../ui/surface/index.js'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import {
  GRADE_KEYS,
  STUDENT_STATUS_KEYS,
  STUDENT_STATUS_LABELS,
  GENDER_KEYS,
  GENDER_LABELS,
  RACE_KEYS,
  RACE_LABELS,
  ETHNICITY_KEYS,
  ETHNICITY_LABELS,
  ageFromBirthDate,
} from '../../lib/demographicVocab.js'
import StudentFilterBar, {
  EMPTY_STUDENT_FILTERS,
  GRADE_LABELS,
  buildStudentParams,
} from './studentFilters.jsx'
import StudentSlideOver, { StatusPill, FlagBadges, STATUS_TONE } from './StudentSlideOver.jsx'

const ENROLL_HUE = '#0EA5E9'

/**
 * CLEAR THE WHOLE ROSTER — the confirm.
 *
 * This action exists because there was no way to get rid of an imported roster
 * except to upload a REPLACEMENT file in replace mode: the delete was reachable
 * only as a side effect of a different import, which is not something anyone
 * thinks to try. So the gap was "I imported the wrong file and now I am stuck".
 *
 * Three things this dialog does deliberately:
 *  • It names the exact count, and sends that count to the server, which refuses
 *    if the register changed while the dialog was open.
 *  • It requires the word DELETE typed out. There is no undo, and a roster is
 *    hundreds of real children's records.
 *  • It says what SURVIVES. Clearing the register does not unlearn the headcount
 *    the school imported — the rollup falls back to the enrollment snapshot, so
 *    "Total enrolled" keeps reading its number over an empty register. Leaving
 *    that unsaid would make the next screen look like a bug.
 */
function ClearRosterDialog({ total, busy, error, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('')
  const armed = typed.trim().toUpperCase() === 'DELETE'
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-roster-title"
        className="w-full max-w-md !shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-risk" aria-hidden="true" />
          <div className="min-w-0">
            <h3 id="clear-roster-title" className="font-serif text-heading font-medium text-ink">
              Delete all {total.toLocaleString('en-US')} student record{total === 1 ? '' : 's'}?
            </h3>
            <p className="mt-1.5 break-words text-small leading-snug text-ink2">
              This removes every student from the register, including any you added by hand. It
              cannot be undone.
            </p>
            <p className="mt-2 break-words text-small leading-snug text-ink2">
              Your enrollment <span className="font-semibold text-ink">headcount stays</span> — it
              comes from the snapshot you imported, not from these records, so the Enrollment page
              will still show its total over an empty register.
            </p>
          </div>
        </div>

        <label className="mt-5 block text-micro font-semibold uppercase text-ink2">
          Type DELETE to confirm
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            className="mt-1.5 h-9 w-full rounded-md border border-hair/30 px-3 text-body font-normal normal-case tracking-normal text-ink outline-none focus:border-ink"
          />
        </label>

        {error ? <p className="mt-3 break-words text-small text-risk">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="primary" disabled={!armed || busy} onClick={onConfirm} icon={<Trash2 size={14} />} className="!bg-risk !shadow-none">
            {busy ? 'Deleting…' : 'Delete the roster'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it
          </Button>
        </div>
      </Panel>
    </div>
  )
}
const PAGE_SIZE = 25

const fmtDay = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime())
    ? String(iso).slice(0, 10)
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── The EDIT modal (EntityFormModal + shared DatePicker — the ONE record modal) ─
const toForm = (s) => ({
  firstName: s?.firstName ?? '',
  lastName: s?.lastName ?? '',
  grade: s?.grade ?? 'K',
  gender: s?.gender ?? '',
  race: s?.race ?? '',
  ethnicity: s?.ethnicity ?? '',
  birthDate: s?.birthDate ? String(s.birthDate).slice(0, 10) : '',
  status: s?.status ?? 'enrolled',
  enrolledOn: s?.enrolledOn ? String(s.enrolledOn).slice(0, 10) : '',
  withdrawnOn: s?.withdrawnOn ? String(s.withdrawnOn).slice(0, 10) : '',
  hasIep: !!s?.hasIep,
  has504: !!s?.has504,
  ell: !!s?.ell,
  notes: s?.notes ?? '',
  externalId: s?.externalId ?? '',
})

// UpdateStudentDto (PartialType(CreateStudentDto)) — key-by-key, never a spread;
// optional empties null-clear (the PATCH semantics).
const toBody = (f) => ({
  firstName: f.firstName.trim(),
  lastName: f.lastName.trim(),
  grade: f.grade,
  gender: f.gender ? f.gender : null,
  race: f.race ? f.race : null,
  ethnicity: f.ethnicity ? f.ethnicity : null,
  birthDate: f.birthDate ? f.birthDate : null,
  status: f.status,
  enrolledOn: f.enrolledOn ? f.enrolledOn : null,
  withdrawnOn: f.withdrawnOn ? f.withdrawnOn : null,
  hasIep: !!f.hasIep,
  has504: !!f.has504,
  ell: !!f.ell,
  notes: f.notes.trim() ? f.notes.trim() : null,
  externalId: f.externalId.trim() ? f.externalId.trim() : null,
})

function StudentFormModal({ student, onClose, onSave }) {
  const [form, setForm] = useState(() => toForm(student))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setV = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setB = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setErr('First and last name are required.')
      return
    }
    // Frozen cross-field rule: a withdrawal date needs a matching status.
    if (form.withdrawnOn && !['withdrawn', 'graduated'].includes(form.status)) {
      setErr('Set status to Withdrawn or Graduated when a withdrawal date is set.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toBody(form))
      onClose()
    } catch (e2) {
      setErr(apiErrorMessage(e2, 'Could not save this student.'))
    } finally {
      setSaving(false)
    }
  }

  const checkboxCls = 'h-[18px] w-[18px] rounded border-white/30 bg-navy-deep/50 accent-gold'

  return (
    <EntityFormModal
      open
      icon={UsersRound}
      title="Edit student"
      subtitle="Roster record — data-minimal by design"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Save student"
      wide
    >
      <Field label="First name" index={0}>
        <input value={form.firstName} onChange={set('firstName')} maxLength={120} className={fieldInput} autoFocus />
      </Field>
      <Field label="Last name" index={1}>
        <input value={form.lastName} onChange={set('lastName')} maxLength={120} className={fieldInput} />
      </Field>
      <Field label="Grade" index={2}>
        <Select value={form.grade} onChange={set('grade')}>
          {GRADE_KEYS.map((g) => (
            <option key={g} value={g}>
              {GRADE_LABELS[g] ?? g}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" index={3}>
        <Select value={form.status} onChange={set('status')}>
          {STUDENT_STATUS_KEYS.map((s) => (
            <option key={s} value={s}>
              {STUDENT_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Birth date" index={4} hint="Age is always derived — never stored.">
        <DatePicker value={form.birthDate} onChange={setV('birthDate')} className={fieldInput} />
      </Field>
      <Field label="Gender" index={5}>
        <Select value={form.gender} onChange={set('gender')}>
          <option value="">Prefer not to record</option>
          {GENDER_KEYS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g] ?? g}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Race" index={6}>
        <Select value={form.race} onChange={set('race')}>
          <option value="">Prefer not to record</option>
          {RACE_KEYS.map((r) => (
            <option key={r} value={r}>
              {RACE_LABELS[r] ?? r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ethnicity" index={7}>
        <Select value={form.ethnicity} onChange={set('ethnicity')}>
          <option value="">Prefer not to record</option>
          {ETHNICITY_KEYS.map((r) => (
            <option key={r} value={r}>
              {ETHNICITY_LABELS[r] ?? r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Enrolled on" index={8}>
        <DatePicker value={form.enrolledOn} onChange={setV('enrolledOn')} className={fieldInput} />
      </Field>
      <Field label="Withdrawn on" index={9} hint="Needs status Withdrawn or Graduated.">
        <DatePicker value={form.withdrawnOn} onChange={setV('withdrawnOn')} className={fieldInput} />
      </Field>
      <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
        {[
          ['hasIep', 'ISP'],
          ['has504', '504 plan'],
          ['ell', 'ELL'],
        ].map(([k, label]) => (
          <label
            key={k}
            className="flex cursor-pointer select-none items-center gap-2.5 text-[14px] font-medium text-white/80"
          >
            <input type="checkbox" checked={!!form[k]} onChange={setB(k)} className={checkboxCls} />
            {label}
          </label>
        ))}
      </div>
      <Field
        label="Notes"
        span={2}
        index={10}
        hint="Operational notes only — do not record medical or diagnostic details."
      >
        <textarea value={form.notes} onChange={set('notes')} maxLength={2000} rows={3} className={fieldTextarea} />
      </Field>
      <Field label="SIS id" index={11} hint="Matches re-imports to this record.">
        <input value={form.externalId} onChange={set('externalId')} maxLength={120} className={fieldInput} />
      </Field>
    </EntityFormModal>
  )
}

export default function StudentRegister({
  schoolId,
  canEdit,
  hue = ENROLL_HUE,
  onChanged,
  // A hero ring segment deep-links here pre-filtered to its grade (?grade=…).
  // Seed-once via lazy init: it is the arrival state, not a controlled filter —
  // the user can clear or change it like any chip they picked themselves.
  initialGrade = null,
}) {
  const [filters, setFilters] = useState(() =>
    initialGrade ? { ...EMPTY_STUDENT_FILTERS, grade: [initialGrade] } : EMPTY_STUDENT_FILTERS,
  )
  const [sort, setSort] = useState('lastName')
  const [dir, setDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null) // { items, total, page, pageSize }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [panelStudent, setPanelStudent] = useState(null)
  const [editStudent, setEditStudent] = useState(null)
  // The UNFILTERED facet counts, so the pickers offer what the roster actually
  // holds. Deliberately not re-read per filter change: options must not vanish as
  // you narrow, or deselecting becomes impossible.
  const [facets, setFacets] = useState(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [clearError, setClearError] = useState('')
  const [panelRefresh, setPanelRefresh] = useState(0)
  const [refresh, setRefresh] = useState(0)

  const params = useMemo(
    () => ({ ...buildStudentParams(filters), sort, dir, page, pageSize: PAGE_SIZE }),
    [filters, sort, dir, page],
  )

  useEffect(() => {
    if (!schoolId) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      enrollmentApi.students
        .list(schoolId, params)
        .then((res) => {
          if (!cancelled) setData(res.data ?? null)
        })
        .catch((e) => {
          if (!cancelled) setError(apiErrorMessage(e, 'Could not load the roster.'))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, params, refresh])

  // Clamp the page when the total shrinks under it (last row on the last page
  // deleted, or an import shrinking the roster) — otherwise a stale out-of-range
  // page shows the misleading "No students match these filters" empty state.
  useEffect(() => {
    if (!data) return
    const maxPage = Math.max(1, Math.ceil((data.total ?? 0) / PAGE_SIZE))
    if (page > maxPage) setPage(maxPage)
  }, [data, page])

  const onFilters = useCallback((next) => {
    setFilters(next)
    setPage(1)
  }, [])

  // DataTable (controlled) hands back { key, dir }; the server does the sorting.
  const onSort = useCallback((next) => {
    setSort(next.key)
    setDir(next.dir)
    setPage(1)
  }, [])

  // The page arrives SERVER-sorted; every column's sortValue is a constant so
  // DataTable's own comparator falls through to the original index and never
  // re-orders the page ('K' before '1' is the server's call, not localeCompare's).
  const columns = useMemo(
    () => [
      {
        key: 'lastName',
        header: 'Name',
        sortable: true,
        sortValue: () => 0,
        render: (s) => (
          <span className="font-semibold text-ink">
            {s.lastName}, {s.firstName}
          </span>
        ),
      },
      { key: 'grade', header: 'Grade', sortable: true, sortValue: () => 0, className: 'dt-nowrap', render: (s) => GRADE_LABELS[s.grade] ?? s.grade ?? '—' },
      {
        key: 'birthDate',
        header: 'Age',
        num: true,
        sortable: true,
        sortValue: () => 0,
        render: (s) => <span className="text-ink2">{s.age ?? ageFromBirthDate(s.birthDate) ?? '—'}</span>,
      },
      { key: 'status', header: 'Status', sortable: true, sortValue: () => 0, render: (s) => <StatusPill status={s.status} /> },
      { key: 'flags', header: 'Flags', render: (s) => <FlagBadges student={s} /> },
      {
        key: 'enrolledOn',
        header: 'Enrolled on',
        sortable: true,
        sortValue: () => 0,
        className: 'dt-nowrap',
        render: (s) => <span className="text-ink2">{fmtDay(s.enrolledOn)}</span>,
      },
    ],
    [],
  )

  useEffect(() => {
    if (!schoolId) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      enrollmentApi.students
        .aggregate(schoolId)
        .then((res) => {
          if (!cancelled) setFacets((res.data ?? res)?.counts ?? null)
        })
        .catch(() => {
          // Unknown ⇒ null ⇒ the bar falls back to the full vocabulary. Not
          // knowing what the roster holds must never be rendered as "it holds
          // nothing", which would disable every picker on a transient error.
          if (!cancelled) setFacets(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, refresh])

  const reload = useCallback(() => {
    setRefresh((n) => n + 1)
    setPanelRefresh((n) => n + 1)
    onChanged?.()
  }, [onChanged])

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)

  const doClear = async () => {
    setClearBusy(true)
    setClearError('')
    try {
      await enrollmentApi.students.clear(schoolId, total)
      setClearOpen(false)
      setPage(1)
      reload()
      onChanged?.()
    } catch (e) {
      // A 409 here is the server refusing because the register changed under the
      // dialog. Its message names both counts, so it is shown verbatim rather than
      // flattened into a generic failure.
      setClearError(apiErrorMessage(e))
    } finally {
      setClearBusy(false)
    }
  }

  const saveEdit = async (body) => {
    await enrollmentApi.students.update(schoolId, editStudent.id, body)
    reload()
  }

  const noFilters = !Object.keys(buildStudentParams(filters)).length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-small text-ink2">
          <UsersRound size={14} className="mr-1.5 inline-block align-[-2px] text-ink2" aria-hidden="true" />
          {loading && !data ? 'Loading…' : (
            <span className="font-semibold tabular-nums text-ink">
              {total.toLocaleString('en-US')} student{total === 1 ? '' : 's'}
            </span>
          )}
          {/* Edit and delete have always existed, one row-click away, and nothing
              said so — "there is no way to change a roster" is what an invisible
              affordance feels like from the outside. */}
          {total > 0 && canEdit ? <span className="ml-2">Click a student to view, edit or delete them.</span> : null}
        </p>
        {canEdit && total > 0 ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setClearError('')
              setClearOpen(true)
            }}
            icon={<Trash2 size={13} />}
          >
            Clear roster
          </Button>
        ) : null}
      </div>

      <Toolbar>
        <div className="min-w-0 flex-1 py-1">
          <StudentFilterBar filters={filters} onChange={onFilters} hue={hue} facets={facets} />
        </div>
      </Toolbar>

      {error ? (
        <div className="py-6 text-center">
          <p className="text-body text-risk">{error}</p>
          <Button variant="secondary" size="sm" onClick={reload} className="mt-2">
            Try again
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="h-48 animate-pulse rounded-lg bg-ink/[.04]" aria-hidden="true" />
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          rowKey="id"
          sort={{ key: sort, dir }}
          onSort={onSort}
          markOf={(s) => STATUS_TONE[s.status] ?? 'neutral'}
          onRowClick={(s) => setPanelStudent(s)}
          caption="Student roster"
          empty={
            total === 0 && noFilters
              ? // Says the thing that was missing: an enrollment HEADCOUNT does not
                // put anyone in this register, and a school looking at "436 enrolled"
                // one tab away has every reason to expect that it does.
                'No students on the roster yet. Uploading a roster file here creates the student records. A headcount on the ' +
                'Enrollment overview does not — if you have a total there but nothing here, ' +
                'upload that file again from the Add data tab.'
              : 'No students match these filters. Loosen a filter or clear the search.'
          }
        />
      )}

      {/* Pagination footer */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-ink2">
            Showing <span className="font-semibold tabular-nums text-ink">{from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}</span> of{' '}
            <span className="font-semibold tabular-nums text-ink">{total.toLocaleString('en-US')}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="quiet" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} aria-label="Previous page" icon={<ChevronLeft size={15} />} />
            <span className="px-1 text-small font-semibold tabular-nums text-ink">
              Page {page} of {pages}
            </span>
            <Button variant="quiet" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading} aria-label="Next page" icon={<ChevronRight size={15} />} />
          </div>
        </div>
      )}

      {/* Slide-over + edit modal */}
      {panelStudent ? (
        <StudentSlideOver
          key={panelStudent.id}
          schoolId={schoolId}
          student={items.find((s) => s.id === panelStudent.id) ?? panelStudent}
          canEdit={canEdit}
          refreshToken={panelRefresh}
          onClose={() => setPanelStudent(null)}
          onEdit={(s) => setEditStudent(s)}
          onDeleted={() => {
            setPanelStudent(null)
            reload()
          }}
        />
      ) : null}
      {clearOpen ? (
        <ClearRosterDialog
          total={total}
          busy={clearBusy}
          error={clearError}
          onCancel={() => setClearOpen(false)}
          onConfirm={doClear}
        />
      ) : null}
      {editStudent ? (
        <StudentFormModal
          key={editStudent.id}
          student={editStudent}
          onClose={() => setEditStudent(null)}
          onSave={saveEdit}
        />
      ) : null}
    </div>
  )
}
