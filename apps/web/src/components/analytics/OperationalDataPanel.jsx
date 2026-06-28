// Phase 4B — per-period operational data intake (enrollment + financial aid).
// Styled to match the dashboard cards + settings forms (navy/gold, framer-motion,
// reduced-motion-gated). owner/accountant can edit + save; viewer is read-only.
// On save it refetches its own row AND calls onSaved() so the parent refetches
// metrics, lighting up the Tier-2 cards. The server 400 is the authority on the
// students-on-aid <= enrollment cross-field rule; we mirror it inline for UX.
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ClipboardList, Sparkles } from 'lucide-react'
import { analyticsApi } from '../../lib/api.js'
import { useOperational } from '../../hooks/useAnalytics.js'
import { sanitizeDecimal, sanitizeInteger } from '../../lib/numericInput.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'

const labelCls =
  'mb-1 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted sm:mb-1.5 sm:text-[14px] sm:tracking-[0.14em]'
const inputCls =
  'w-full rounded-lg border border-border bg-white px-3 py-2 text-[16px] text-ink outline-none transition-all focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted sm:px-4 sm:py-2.5 sm:text-[16px]'

const toStr = (v) => (v === null || v === undefined ? '' : String(v))

export default function OperationalDataPanel({
  schoolId,
  periodId,
  periodLabel,
  canEdit,
  onSaved,
}) {
  const reduce = useReducedMotion()
  const { operational, loading, reload } = useOperational(schoolId, periodId)

  const [enrollment, setEnrollment] = useState('')
  const [fte, setFte] = useState('')
  const [onAid, setOnAid] = useState('')
  const [aidTotal, setAidTotal] = useState('')
  const [teachingFte, setTeachingFte] = useState('')
  const [totalStaffFte, setTotalStaffFte] = useState('')
  const [notes, setNotes] = useState('')

  // Sync from the loaded row when school/period changes (render-time, per React
  // docs) — preserves in-progress edits within the same period selection.
  const syncKey = `${schoolId}:${periodId}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (operational && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    setEnrollment(toStr(operational.enrollment))
    setFte(toStr(operational.enrollmentFte))
    setOnAid(toStr(operational.studentsOnAid))
    setAidTotal(toStr(operational.financialAidTotal))
    setTeachingFte(toStr(operational.teachingFte))
    setTotalStaffFte(toStr(operational.totalStaffFte))
    setNotes(toStr(operational.notes))
  }

  // Parse a string field -> number|null (blank = null). Returns NaN on bad input.
  const parseNum = (s, integer) => {
    const t = s.trim()
    if (t === '') return null
    const n = integer ? Number.parseInt(t, 10) : Number(t)
    return Number.isFinite(n) ? n : NaN
  }

  const enrollNum = parseNum(enrollment, true)
  const onAidNum = parseNum(onAid, true)

  // Inline cross-field check (mirror of the server rule).
  const crossFieldError =
    typeof enrollNum === 'number' &&
    !Number.isNaN(enrollNum) &&
    typeof onAidNum === 'number' &&
    !Number.isNaN(onAidNum) &&
    onAidNum > enrollNum
      ? `Can't exceed enrollment (${enrollNum}).`
      : ''

  // STAFF FTE cross-field: teaching <= total staff (mirror of the server rule).
  const teachNum = parseNum(teachingFte, false)
  const totalStaffNum = parseNum(totalStaffFte, false)
  const staffCrossFieldError =
    typeof teachNum === 'number' &&
    !Number.isNaN(teachNum) &&
    typeof totalStaffNum === 'number' &&
    !Number.isNaN(totalStaffNum) &&
    teachNum > totalStaffNum
      ? `Can't exceed total staff (${totalStaffNum}).`
      : ''

  const fieldValues = [
    parseNum(enrollment, true),
    parseNum(fte, false),
    parseNum(onAid, true),
    parseNum(aidTotal, false),
    parseNum(teachingFte, false),
    parseNum(totalStaffFte, false),
  ]
  const hasNaN = fieldValues.some((v) => Number.isNaN(v))
  const hasNegative = fieldValues.some((v) => typeof v === 'number' && v < 0)
  const invalid = !!crossFieldError || !!staffCrossFieldError || hasNaN || hasNegative

  // Live preview of how many of the 6 Tier-2 metrics the current inputs unlock —
  // mirrors the pure available/inputsMissing contract (enrollment/studentsOnAid
  // must be > 0 as denominators; aid of 0 is a valid value, not "missing").
  const aidNum = parseNum(aidTotal, false)
  const enrollOk = typeof enrollNum === 'number' && !Number.isNaN(enrollNum) && enrollNum > 0
  const aidOk = aidNum !== null && !Number.isNaN(aidNum) && aidNum >= 0
  const onAidPosOk = typeof onAidNum === 'number' && !Number.isNaN(onAidNum) && onAidNum > 0
  const onAidPresent = onAidNum !== null && !Number.isNaN(onAidNum) // 0 is a valid numerator
  // gross tuition comes from the period snapshot (>0); assumed available here so
  // the preview reflects the operational inputs the user controls on this panel.
  const unlockCount = [
    enrollOk, // cost_per_pupil
    aidOk && enrollOk, // net_tuition_per_student (gross tuition from snapshot)
    aidOk && enrollOk, // financial_aid_per_student
    aidOk && onAidPosOk, // aid_per_aided_student
    aidOk, // tuition_discount_rate (gross tuition from snapshot)
    onAidPresent && enrollOk, // pct_students_on_aid
  ].filter(Boolean).length
  const TIER2_TOTAL = 6

  const buildPayload = () => ({
    enrollment: parseNum(enrollment, true),
    enrollmentFte: parseNum(fte, false),
    studentsOnAid: parseNum(onAid, true),
    financialAidTotal: parseNum(aidTotal, false),
    teachingFte: parseNum(teachingFte, false),
    totalStaffFte: parseNum(totalStaffFte, false),
    notes: notes.trim() === '' ? null : notes.trim(),
  })

  // Dirty diff vs the saved row, in persisted form so a save can't re-trigger
  // itself. Numeric fields come back as strings (Prisma Decimal) — compare
  // numerically; notes normalized to null.
  // Compare at 2-decimal precision: Decimal(_,2) columns round on store, so a
  // higher-precision draft must not read as "still dirty" after it's saved.
  const numEq = (a, b) => {
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    return Math.round(Number(a) * 100) === Math.round(Number(b) * 100)
  }
  const serverNotes =
    operational?.notes == null || String(operational.notes).trim() === ''
      ? null
      : String(operational.notes).trim()
  const p = buildPayload()
  const dirty =
    canEdit &&
    !invalid &&
    operational != null &&
    (!numEq(p.enrollment, operational.enrollment) ||
      !numEq(p.enrollmentFte, operational.enrollmentFte) ||
      !numEq(p.studentsOnAid, operational.studentsOnAid) ||
      !numEq(p.financialAidTotal, operational.financialAidTotal) ||
      !numEq(p.teachingFte, operational.teachingFte) ||
      !numEq(p.totalStaffFte, operational.totalStaffFte) ||
      p.notes !== serverNotes)

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: `${enrollment}|${fte}|${onAid}|${aidTotal}|${teachingFte}|${totalStaffFte}|${notes}`,
    delay: 1000,
    save: async () => {
      await analyticsApi.saveOperational(schoolId, periodId, buildPayload())
      await reload()
      await onSaved?.()
    },
  })

  const empty =
    !operational ||
    (operational.enrollment === null &&
      operational.studentsOnAid === null &&
      operational.financialAidTotal === null)

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="card-vital p-3 sm:p-4"
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold sm:h-9 sm:w-9">
            <ClipboardList size={16} />
          </span>
          <div>
            <h3 className="font-serif text-[16px] font-semibold text-navy sm:text-lg">Operational data</h3>
            <p className="hidden text-[14px] text-muted sm:block">
              {periodLabel ? `${periodLabel} · ` : ''}
              {canEdit
                ? 'Enrollment & aid power the per-student metrics below.'
                : 'Read-only — only an owner or accountant can edit.'}
            </p>
          </div>
        </div>
        {!loading && (
          <motion.span
            key={unlockCount}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold sm:inline-flex ${
              unlockCount === TIER2_TOTAL
                ? 'border-gold/40 bg-gold/10 text-gold'
                : unlockCount > 0
                  ? 'border-gold/25 bg-gold/[0.06] text-navy'
                  : 'border-border bg-section text-muted'
            }`}
            title="Per-student metrics unlocked by the current inputs"
          >
            <Sparkles size={12} className={unlockCount > 0 ? 'text-gold' : 'text-muted'} />
            {unlockCount}/{TIER2_TOTAL} metrics unlocked
          </motion.span>
        )}
      </div>

      {loading ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:mt-3.5 sm:gap-x-4 sm:gap-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="shimmer-bar h-3 w-24 rounded" />
              <div className="shimmer-bar mt-2 h-11 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {!canEdit && empty && (
            <p className="mt-3 text-[15px] italic text-muted">
              No operational data entered yet.
            </p>
          )}

          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:mt-3.5 sm:gap-x-4 sm:gap-y-3">
            <div>
              <label className={labelCls}>Enrollment (headcount)</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={enrollment}
                disabled={!canEdit}
                onChange={(e) => setEnrollment(sanitizeInteger(e.target.value))}
                placeholder="e.g. 850"
              />
              <p className="mt-1.5 hidden text-[13px] italic text-muted sm:block">
                Primary number; powers cost per pupil & per-student metrics.
              </p>
            </div>
            <div>
              <label className={labelCls}>FTE (optional)</label>
              <input
                className={inputCls}
                inputMode="decimal"
                value={fte}
                disabled={!canEdit}
                onChange={(e) => setFte(sanitizeDecimal(e.target.value))}
                placeholder="optional"
              />
            </div>
            <div>
              <label className={labelCls}>Students on aid</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={onAid}
                disabled={!canEdit}
                onChange={(e) => setOnAid(sanitizeInteger(e.target.value))}
                placeholder="e.g. 300"
              />
              {crossFieldError && (
                <p className="mt-1.5 text-[13px] font-semibold text-danger">
                  {crossFieldError}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Financial aid total</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted sm:left-4">
                  $
                </span>
                <input
                  className={`${inputCls} pl-7 sm:pl-8`}
                  inputMode="decimal"
                  value={aidTotal}
                  disabled={!canEdit}
                  onChange={(e) => setAidTotal(sanitizeDecimal(e.target.value))}
                  placeholder="e.g. 1200000"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Teaching FTE</label>
              <input
                className={inputCls}
                inputMode="decimal"
                value={teachingFte}
                disabled={!canEdit}
                onChange={(e) => setTeachingFte(sanitizeDecimal(e.target.value))}
                placeholder="e.g. 42.5"
              />
              <p className="mt-1.5 hidden text-[13px] italic text-muted sm:block">
                Staff FTE (instructional) — distinct from the student FTE above.
              </p>
              {staffCrossFieldError && (
                <p className="mt-1.5 text-[13px] font-semibold text-danger">
                  {staffCrossFieldError}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Total staff FTE</label>
              <input
                className={inputCls}
                inputMode="decimal"
                value={totalStaffFte}
                disabled={!canEdit}
                onChange={(e) => setTotalStaffFte(sanitizeDecimal(e.target.value))}
                placeholder="e.g. 61"
              />
              <p className="mt-1.5 hidden text-[13px] italic text-muted sm:block">
                All staff FTE; drives the Teacher Ratio key indicator.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                className={`${inputCls} min-h-[44px] resize-y sm:min-h-[72px]`}
                value={notes}
                disabled={!canEdit}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional context"
              />
            </div>
          </div>

          {err && <div className="mt-3"><FormError>{err}</FormError></div>}

          {canEdit && (
            <AutosaveBar
              saving={saving}
              dirty={dirty}
              error={!!err}
              onSaveNow={saveNow}
              className="mt-3 sm:mt-3.5"
            />
          )}
        </>
      )}
    </motion.div>
  )
}
