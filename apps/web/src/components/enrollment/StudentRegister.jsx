// ─────────────────────────────────────────────────────────────────────────────
// StudentRegister — the enrollment RECORDS pane: the school's student roster as
// a server-filtered register (DomainCommandCenter register conventions). ALL
// filtering/sorting/paging is SERVER-side via the frozen query contract
// (studentFilters.buildStudentParams + sort/dir/page/pageSize); the chip filter
// bar + debounced search are the shared StudentFilterBar. Row → StudentSlideOver
// (view / delete); Edit opens the EntityFormModal-based StudentFormModal (the
// EDIT path — adding happens on the Add-data tab's RecordFlow / CSV import).
//
// FERPA: names render ONLY here + the slide-over (role-gated register routes).
// React 19 idioms: microtask-deferred fetch effects + a cancelled guard.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
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
import StudentSlideOver, { StatusPill, FlagBadges } from './StudentSlideOver.jsx'

const ENROLL_HUE = '#0EA5E9'
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
          ['hasIep', 'IEP'],
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

// ── Sortable header cell ──────────────────────────────────────────────────────
function Th({ label, sortKey, sort, dir, onSort, className = '' }) {
  const active = sortKey && sort === sortKey
  return (
    <th className={`px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted ${className}`}>
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors hover:text-navy ${active ? 'text-navy' : ''}`}
        >
          {label}
          {active ? (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
        </button>
      ) : (
        label
      )}
    </th>
  )
}

export default function StudentRegister({ schoolId, canEdit, hue = ENROLL_HUE, onChanged }) {
  const [filters, setFilters] = useState(EMPTY_STUDENT_FILTERS)
  const [sort, setSort] = useState('lastName')
  const [dir, setDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null) // { items, total, page, pageSize }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [panelStudent, setPanelStudent] = useState(null)
  const [editStudent, setEditStudent] = useState(null)
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

  const onSort = useCallback(
    (key) => {
      if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      else {
        setSort(key)
        setDir('asc')
      }
      setPage(1)
    },
    [sort],
  )

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

  const saveEdit = async (body) => {
    await enrollmentApi.students.update(schoolId, editStudent.id, body)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: hue }}
          >
            <UsersRound size={18} />
          </span>
          <div>
            <h3 className="font-serif text-lg font-bold text-navy">Student roster</h3>
            <p className="text-[12.5px] text-muted">
              {loading && !data ? 'Loading…' : `${total.toLocaleString('en-US')} student${total === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[12.5px] font-bold"
          style={{ borderColor: `${hue}55`, backgroundColor: `${hue}12`, color: '#0369A1' }}
        >
          {total.toLocaleString('en-US')}
        </span>
      </div>

      <StudentFilterBar filters={filters} onChange={onFilters} hue={hue} />

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-6 text-center">
          <p className="text-[14px] text-danger">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 text-[13.5px] font-semibold text-navy underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : loading && !data ? (
        <div className="h-48 animate-pulse rounded-xl border border-rule/40 bg-section/60" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
          <p className="font-serif text-[16px] italic text-muted">
            {total === 0 && !Object.keys(buildStudentParams(filters)).length
              ? 'No students on the roster yet.'
              : 'No students match these filters.'}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {total === 0 && !Object.keys(buildStudentParams(filters)).length
              ? 'Add students from the Add data tab — one at a time or a whole CSV.'
              : 'Loosen a filter or clear the search.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rule/50">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead className="bg-section/70">
              <tr>
                <Th label="Name" sortKey="lastName" sort={sort} dir={dir} onSort={onSort} />
                <Th label="Grade" sortKey="grade" sort={sort} dir={dir} onSort={onSort} />
                <Th label="Age" sortKey="birthDate" sort={sort} dir={dir} onSort={onSort} />
                <Th label="Status" sortKey="status" sort={sort} dir={dir} onSort={onSort} />
                <Th label="Flags" />
                <Th label="Enrolled on" sortKey="enrolledOn" sort={sort} dir={dir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  onClick={() => setPanelStudent(s)}
                  className="cursor-pointer border-t border-rule/40 transition-colors hover:bg-sky-50/60"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                        style={{ backgroundColor: hue }}
                        aria-hidden="true"
                      >
                        {`${String(s.firstName ?? '').charAt(0)}${String(s.lastName ?? '').charAt(0)}`.toUpperCase()}
                      </span>
                      <span className="font-semibold text-navy">
                        {s.lastName}, {s.firstName}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-navy">{GRADE_LABELS[s.grade] ?? s.grade}</td>
                  <td className="px-3 py-2.5 text-muted">{s.age ?? ageFromBirthDate(s.birthDate) ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <FlagBadges student={s} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{fmtDay(s.enrolledOn)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            Showing <span className="font-semibold text-navy">{from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}</span> of{' '}
            <span className="font-semibold text-navy">{total.toLocaleString('en-US')}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              aria-label="Previous page"
              className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-1 text-[12.5px] font-semibold text-navy">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
              aria-label="Next page"
              className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
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
