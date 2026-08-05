// ─────────────────────────────────────────────────────────────────────────────
// StudentSlideOver — the light slide-over for ONE roster student (the
// PersonDetailPanel precedent): initials avatar, sky grade/status pills, derived
// age, IEP/504/ELL badges, enrollment dates, notes. Edit hands off to the
// register's EntityFormModal form; Delete is a two-step inline confirm (hard
// delete — school data stewardship). FERPA posture: this role-gated register
// surface is the ONLY place a name renders; the record itself is data-minimal
// by design (no address/phone/medical text).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  X,
  Pencil,
  Trash2,
  GraduationCap,
  CalendarRange,
  Cake,
  StickyNote,
  Fingerprint,
  LifeBuoy,
} from 'lucide-react'
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
import { demographicPillStyle } from '../../lib/demographicColor.js'
import { GRADE_LABELS } from './studentFilters.jsx'

const ENROLL_HUE = '#0EA5E9'

// Status pill styling (light theme; enrolled = sky, watchlisty tones for the rest).
export const STATUS_BADGE = {
  enrolled: 'border-sky-300/70 bg-sky-50 text-sky-700',
  waitlist: 'border-amber-300/70 bg-amber-50 text-amber-700',
  withdrawn: 'border-rule/60 bg-section text-muted',
  graduated: 'border-indigo-300/70 bg-indigo-50 text-indigo-700',
}

export function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${
        STATUS_BADGE[status] ?? STATUS_BADGE.withdrawn
      }`}
    >
      {STUDENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function FlagBadges({ student, size = 'sm' }) {
  const flags = []
  if (student?.hasIep) flags.push('iep')
  if (student?.has504) flags.push('plan504')
  if (student?.ell) flags.push('ell')
  if (!flags.length) return null
  const cls =
    size === 'sm'
      ? 'rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold'
      : 'rounded-md border px-2 py-0.5 text-[11.5px] font-bold'
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={cls}
          style={{ borderColor: `${ENROLL_HUE}55`, backgroundColor: `${ENROLL_HUE}12`, color: '#0369A1' }}
        >
          {STUDENT_FLAG_LABELS[f]}
        </span>
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

const initialsOf = (s) =>
  `${String(s?.firstName ?? '').charAt(0)}${String(s?.lastName ?? '').charAt(0)}`.toUpperCase() || '?'

// (props.Icon indirection mirrors PersonDetailPanel — the lint config doesn't
// count a destructured component prop's JSX usage.)
function Row(props) {
  const RowIcon = props.Icon
  const { label, children } = props
  return (
    <p className="flex items-center gap-2 text-[13.5px] text-muted">
      <RowIcon size={14} className="shrink-0" style={{ color: ENROLL_HUE }} />
      <span>
        {label}: <span className="font-semibold text-navy">{children}</span>
      </span>
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
        className="absolute inset-0 bg-navy-deep/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Slide-over pane */}
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${fullName} details`}
        initial={reduce ? { opacity: 0 } : { x: '100%' }}
        animate={reduce ? { opacity: 1 } : { x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-hidden border-l border-rule/60 bg-white shadow-2xl"
      >
        {/* Header — sky accent band */}
        <div
          className="relative shrink-0 px-5 pb-4 pt-5"
          style={{ background: `linear-gradient(135deg, ${ENROLL_HUE}14, transparent 65%)` }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[15px] font-bold text-white shadow-glow"
              style={{ backgroundColor: ENROLL_HUE }}
              aria-hidden="true"
            >
              {initialsOf(s)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-[22px] font-semibold leading-tight text-navy">
                {fullName || 'Student'}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* The grade's own colour, matching its pill in the register —
                    one grade, one colour, wherever it appears. */}
                <span
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold"
                  style={
                    demographicPillStyle('grade', s.grade) ?? {
                      borderColor: `${ENROLL_HUE}55`,
                      backgroundColor: `${ENROLL_HUE}14`,
                      color: '#0369A1',
                    }
                  }
                >
                  <GraduationCap size={12} /> {GRADE_LABELS[s.grade] ?? s.grade}
                </span>
                <StatusPill status={s.status} />
                <FlagBadges student={s} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit?.(s)}
                    aria-label={`Edit ${fullName}`}
                    title="Edit"
                    className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    aria-label={`Delete ${fullName}`}
                    title="Delete"
                    className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-8 pt-4">
          {confirming && (
            <div className="rounded-xl border border-danger/40 bg-danger/[0.06] px-4 py-3">
              <p className="text-[13.5px] font-semibold text-navy">
                Delete {fullName} from the roster?
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                This is a hard delete — the record is removed for good.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={deleting}
                  className="rounded-lg bg-danger px-3 py-1.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="rounded-lg border border-rule/70 px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:text-navy"
                >
                  Keep
                </button>
              </div>
            </div>
          )}
          {err ? <p className="text-[12.5px] font-medium text-danger">{err}</p> : null}

          <div className="space-y-2 text-[13.5px]">
            <Row Icon={Cake} label="Age">
              {age != null
                ? `${age} (${AGE_BAND_LABELS[ageBand] ?? ageBand})`
                : 'Not recorded'}
              {s.birthDate ? ` · born ${fmtDay(s.birthDate)}` : ''}
            </Row>
            <Row Icon={CalendarRange} label="Enrolled">
              {s.enrolledOn ? fmtDay(s.enrolledOn) : '—'}
              {s.withdrawnOn ? ` → withdrawn ${fmtDay(s.withdrawnOn)}` : ''}
            </Row>
            <Row Icon={LifeBuoy} label="Support">
              {s.hasIep || s.has504 || s.ell
                ? [s.hasIep && 'IEP', s.has504 && '504 plan', s.ell && 'ELL']
                    .filter(Boolean)
                    .join(' · ')
                : 'None recorded'}
            </Row>
            {s.externalId ? (
              <Row Icon={Fingerprint} label="SIS id">{s.externalId}</Row>
            ) : null}
          </div>

          {/* Demographics (aggregate vocab; "not recorded" when unset) */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              ['Gender', 'gender', s.gender, s.gender ? (GENDER_LABELS[s.gender] ?? s.gender) : null],
              ['Race', 'race', s.race, s.race ? (RACE_LABELS[s.race] ?? s.race) : null],
              [
                'Ethnicity',
                'ethnicity',
                s.ethnicity,
                s.ethnicity ? (ETHNICITY_LABELS[s.ethnicity] ?? s.ethnicity) : null,
              ],
            ].map(([label, dimension, raw, value]) => {
              const pill = raw ? demographicPillStyle(dimension, raw) : null
              return (
                <div key={label} className="rounded-xl border border-rule/50 bg-cream/40 px-3 py-2">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
                    {label}
                  </p>
                  {value && pill ? (
                    <span
                      className="mt-1 inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold"
                      style={pill}
                    >
                      <span className="min-w-0 truncate">{value}</span>
                    </span>
                  ) : (
                    <p
                      className={`mt-0.5 text-[13.5px] font-semibold ${value ? 'text-navy' : 'italic text-muted'}`}
                    >
                      {value ?? 'Not recorded'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Notes */}
          {s.notes ? (
            <div className="space-y-1.5">
              <h3 className="flex items-center gap-2 font-serif text-[16px] font-semibold text-navy">
                <StickyNote size={16} style={{ color: ENROLL_HUE }} /> Notes
              </h3>
              <p className="whitespace-pre-wrap rounded-xl border border-rule/50 bg-cream/50 p-3 text-[13px] leading-relaxed text-muted">
                {s.notes}
              </p>
              <p className="text-[11px] text-muted/80">
                Operational notes only — no medical or diagnostic details.
              </p>
            </div>
          ) : null}
        </div>
      </motion.aside>
    </div>
  )
}
