// ─────────────────────────────────────────────────────────────────────────────
// StudentSlideOver — the light drawer for ONE roster student (the
// PersonDetailPanel precedent): name, grade as text, status as a 2px mark + word,
// ISP/504/ELL as Pills, derived age, enrollment dates, demographics as a ruled
// definition list, notes. Edit hands off to the register's EntityFormModal form;
// Delete is a two-step inline confirm (hard delete — school data stewardship).
// FERPA posture: this role-gated register surface is the ONLY place a name
// renders; the record itself is data-minimal by design (no address/phone/
// medical text).
//
// PREMIUM UI P4: the drawer is the ONE raised surface here (a `Panel` sliding in
// from the right: white, hairline, the floating shadow) — no avatar, no gradient
// band, no hued pills. Grade is text; status is a status Pill; flags are Pills.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X, Pencil, Trash2, CalendarRange, Cake, StickyNote, Fingerprint, LifeBuoy } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import {
  STUDENT_STATUS_LABELS,
  STUDENT_FLAG_LABELS,
  AGE_BAND_LABELS,
  ageFromBirthDate,
  ageBandFromBirthDate,
  GENDER_LABELS,
  ETHNICITY_LABELS,
  RACE_LABELS,
} from '../../lib/demographicVocab.js'
import { Pill, Button } from '../ui/surface/index.js'
import { GRADE_LABELS } from './studentFilters.jsx'

// Status → the Pill's 2px mark tone. Colour is semantic only: a waitlisted
// student is a watch item, a withdrawn one is neutral history; enrolled and
// graduated carry the module hue / good mark. The WORD is always printed.
export const STATUS_TONE = {
  enrolled: 'hue',
  waitlist: 'watch',
  withdrawn: 'neutral',
  graduated: 'good',
}

export function StatusPill({ status }) {
  return (
    <Pill variant="status" tone={STATUS_TONE[status] ?? 'neutral'}>
      {STUDENT_STATUS_LABELS[status] ?? status}
    </Pill>
  )
}

export function FlagBadges({ student }) {
  const flags = []
  if (student?.hasIep) flags.push('iep')
  if (student?.has504) flags.push('plan504')
  if (student?.ell) flags.push('ell')
  if (!flags.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {flags.map((f) => (
        <Pill key={f}>{STUDENT_FLAG_LABELS[f]}</Pill>
      ))}
    </span>
  )
}

function fmtDay(iso) {
  if (!iso) return '—'
  const day = String(iso).slice(0, 10)
  const d = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// (props.Icon indirection mirrors PersonDetailPanel — the lint config doesn't
// count a destructured component prop's JSX usage.)
function Row(props) {
  const RowIcon = props.Icon
  const { label, children } = props
  return (
    <p className="flex items-start gap-2 border-b border-hair py-2 text-small text-ink2">
      <RowIcon size={14} className="mt-0.5 shrink-0 text-ink2" aria-hidden="true" />
      <span className="w-20 shrink-0">{label}</span>
      <span className="min-w-0 font-semibold text-ink">{children}</span>
    </p>
  )
}

export default function StudentSlideOver({
  schoolId,
  student, // the register-list row (instant header paint while detail loads)
  canEdit,
  refreshToken = 0,
  onClose,
  onEdit,
  onDeleted,
}) {
  const reduce = useReducedMotion()
  const [detail, setDetail] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  const studentId = student?.id ?? null

  // Freshest copy (microtask defer + cancelled flag — the panel idiom).
  useEffect(() => {
    let cancelled = false
    if (!schoolId || !studentId) return undefined
    Promise.resolve().then(() => {
      if (cancelled) return
      enrollmentApi.students
        .get(schoolId, studentId)
        .then((res) => {
          if (!cancelled) setDetail(res.data ?? null)
        })
        .catch(() => {
          if (!cancelled) setDetail(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, studentId, refreshToken])

  // Esc closes; body scroll locks while open (modal idiom).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const s = detail ?? student
  if (!s) return null
  const fullName = `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim()
  const age = s.age ?? ageFromBirthDate(s.birthDate)
  const ageBand = s.ageBand ?? ageBandFromBirthDate(s.birthDate)

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    setErr('')
    try {
      await enrollmentApi.students.remove(schoolId, s.id)
      onDeleted?.(s)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not delete this student.'))
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[55]">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-ink/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* The drawer — the one raised surface */}
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${fullName} details`}
        initial={reduce ? { opacity: 0 } : { x: '100%' }}
        animate={reduce ? { opacity: 1 } : { x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="panel absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-hidden !rounded-none !shadow-float"
      >
        {/* Header */}
        <div className="panel-head shrink-0 !items-start">
          <div className="min-w-0 flex-1">
            <p className="pg-eyebrow !mb-1">Student · {GRADE_LABELS[s.grade] ?? s.grade}</p>
            <h2 className="break-words font-serif text-title font-medium leading-tight text-ink">{fullName || 'Student'}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill status={s.status} />
              <FlagBadges student={s} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit ? (
              <>
                <Button variant="quiet" size="sm" onClick={() => onEdit?.(s)} aria-label={`Edit ${fullName}`} title="Edit" icon={<Pencil size={14} />} />
                <Button variant="quiet" size="sm" onClick={() => setConfirming(true)} aria-label={`Delete ${fullName}`} title="Delete" icon={<Trash2 size={14} />} />
              </>
            ) : null}
            <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close" icon={<X size={15} />} />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-8 pt-4">
          {confirming && (
            <div className="border-l-2 border-risk pl-3">
              <p className="text-small font-semibold text-ink">Delete {fullName} from the roster?</p>
              <p className="mt-0.5 text-[12px] text-ink2">
                This is a hard delete — the record is removed for good. Roster files imported before
                today still contain this student&apos;s name; remove those under Import history if
                they need to go too.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={doDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                  Keep
                </Button>
              </div>
            </div>
          )}
          {err ? <p className="text-[12px] font-medium text-risk">{err}</p> : null}

          <div className="border-t border-hair">
            <Row Icon={Cake} label="Age">
              {age != null ? `${age} (${AGE_BAND_LABELS[ageBand] ?? ageBand})` : 'Not recorded'}
              {s.birthDate ? ` · born ${fmtDay(s.birthDate)}` : ''}
            </Row>
            <Row Icon={CalendarRange} label="Enrolled">
              {s.enrolledOn ? fmtDay(s.enrolledOn) : '—'}
              {s.withdrawnOn ? ` → withdrawn ${fmtDay(s.withdrawnOn)}` : ''}
            </Row>
            <Row Icon={LifeBuoy} label="Support">
              {s.hasIep || s.has504 || s.ell
                ? [s.hasIep && 'ISP', s.has504 && '504 plan', s.ell && 'ELL'].filter(Boolean).join(' · ')
                : 'None recorded'}
            </Row>
            {s.externalId ? (
              <Row Icon={Fingerprint} label="SIS id">
                {s.externalId}
              </Row>
            ) : null}
          </div>

          {/* Demographics (aggregate vocab; "not recorded" when unset) — a ruled dl */}
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
            {[
              ['Gender', s.gender ? (GENDER_LABELS[s.gender] ?? s.gender) : null],
              ['Race', s.race ? (RACE_LABELS[s.race] ?? s.race) : null],
              ['Ethnicity', s.ethnicity ? (ETHNICITY_LABELS[s.ethnicity] ?? s.ethnicity) : null],
            ].map(([label, value]) => (
              <div key={label} className="border-t border-hair py-2">
                <dt className="text-micro font-semibold uppercase text-ink2">{label}</dt>
                <dd className={`mt-0.5 text-small font-semibold ${value ? 'text-ink' : 'italic text-ink2'}`}>{value ?? 'Not recorded'}</dd>
              </div>
            ))}
          </dl>

          {/* Notes */}
          {s.notes ? (
            <div className="space-y-1.5">
              <h3 className="flex items-center gap-2 text-micro font-semibold uppercase text-ink2">
                <StickyNote size={13} aria-hidden="true" /> Notes
              </h3>
              <p className="whitespace-pre-wrap border-l-2 border-hair pl-3 text-small leading-relaxed text-ink">{s.notes}</p>
              <p className="text-[11px] text-ink2">Operational notes only — no medical or diagnostic details.</p>
            </div>
          ) : null}
        </div>
      </motion.aside>
    </div>
  )
}
