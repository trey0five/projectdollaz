// Phase 2A — the compliance intake (attestation inputs). Modeled on
// OperationalDataPanel: same card-soft container, render-time sync-on-period
// pattern, FormError/FormSuccess, disabled-when-!canEdit, btn-primary save. On
// save it refetches its own row AND calls onSaved() so the parent re-fetches GET
// /compliance, refreshing every section badge + the trigger header live.
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ClipboardCheck } from 'lucide-react'
import { complianceApi } from '../../lib/api.js'
import { sanitizeDecimal, sanitizeInteger } from '../../lib/numericInput.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'
import TierSelector from './TierSelector.jsx'

const labelCls =
  'mb-2 block text-[12px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border border-border bg-white px-4 py-3 text-base text-ink outline-none transition-all focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

const toStr = (v) => (v === null || v === undefined ? '' : String(v))

// Tri-state Yes/No toggle (null = unanswered). On-theme gold-active pills.
function YesNo({ label, value, onChange, disabled, hint }) {
  const reduce = useReducedMotion()
  // Selected = solid fill (the prior 10%-opacity tint read as barely selected).
  // Yes → gold, No → navy, so the chosen answer is unmistakable at a glance.
  const pill = (active, tone) =>
    `flex-1 rounded-lg border-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] transition-all ${
      active
        ? tone === 'yes'
          ? 'border-gold bg-gold text-white shadow-[0_3px_12px_-3px_rgba(184,150,80,0.65)]'
          : 'border-navy bg-navy text-white shadow-[0_3px_12px_-3px_rgba(26,39,68,0.5)]'
        : 'border-border bg-section text-muted'
    } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-gold/40'}`
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <motion.button
          type="button"
          whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
          disabled={disabled}
          onClick={() => onChange(value === true ? null : true)}
          className={pill(value === true, 'yes')}
        >
          Yes
        </motion.button>
        <motion.button
          type="button"
          whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
          disabled={disabled}
          onClick={() => onChange(value === false ? null : false)}
          className={pill(value === false, 'no')}
        >
          No
        </motion.button>
      </div>
      {hint && <p className="mt-1.5 text-[11px] italic text-muted">{hint}</p>}
    </div>
  )
}

export default function ComplianceIntakePanel({
  schoolId,
  periodId,
  periodLabel,
  inputs,
  loading,
  canEdit,
  reloadInputs,
  onSaved,
}) {
  const reduce = useReducedMotion()

  const [scholarship, setScholarship] = useState('')
  const [programs, setPrograms] = useState([])
  const [fdic, setFdic] = useState(null)
  const [over250k, setOver250k] = useState(null)
  const [bankRated, setBankRated] = useState(null)
  const [recon60, setRecon60] = useState(null)
  const [reconReviewed, setReconReviewed] = useState(null)
  const [doe, setDoe] = useState(null)
  const [years, setYears] = useState('')
  const [bond, setBond] = useState(null)
  const [fesuaOver50k, setFesuaOver50k] = useState(null)
  const [notes, setNotes] = useState('')

  // Sync from the loaded row when school/period changes (render-time per React docs).
  const syncKey = `${schoolId}:${periodId}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (inputs && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    setScholarship(toStr(inputs.scholarshipFundsReceived))
    setPrograms(Array.isArray(inputs.programs) ? inputs.programs : [])
    setFdic(inputs.fundsAtInsuredInstitution ?? null)
    setOver250k(inputs.avgDailyBalanceOver250k ?? null)
    setBankRated(inputs.bankRatingReviewedTopTwo ?? null)
    setRecon60(inputs.reconciledWithin60Days ?? null)
    setReconReviewed(inputs.reconciliationIndependentlyReviewed ?? null)
    setDoe(inputs.doeStatusApproved ?? null)
    setYears(toStr(inputs.yearsInOperation))
    setBond(inputs.suretyBondPosted ?? null)
    setFesuaOver50k(inputs.fesuaAnyAccountOver50k ?? null)
    setNotes(toStr(inputs.notes))
  }

  const parseNum = (s, integer) => {
    const t = s.trim()
    if (t === '') return null
    const n = integer ? Number.parseInt(t, 10) : Number(t)
    return Number.isFinite(n) ? n : NaN
  }

  const scholarshipNum = parseNum(scholarship, false)
  const yearsNum = parseNum(years, true)
  const hasNaN = [scholarshipNum, yearsNum].some((v) => Number.isNaN(v))
  const hasNegative = [scholarshipNum, yearsNum].some((v) => typeof v === 'number' && v < 0)
  const invalid = hasNaN || hasNegative

  const isUA = programs.includes('FES_UA')

  const buildPayload = () => ({
    scholarshipFundsReceived: parseNum(scholarship, false),
    programs,
    fundsAtInsuredInstitution: fdic,
    avgDailyBalanceOver250k: over250k,
    bankRatingReviewedTopTwo: bankRated,
    reconciledWithin60Days: recon60,
    reconciliationIndependentlyReviewed: reconReviewed,
    doeStatusApproved: doe,
    yearsInOperation: parseNum(years, true),
    suretyBondPosted: bond,
    fesuaAnyAccountOver50k: fesuaOver50k,
    notes: notes.trim() === '' ? null : notes.trim(),
  })

  // Dirty diff vs the saved row, in persisted form (so a save can't re-trigger
  // itself). Numeric fields come back as strings (Prisma Decimal) — compare
  // numerically. Programs compared order-insensitively; notes normalized to null.
  // Compare at 2-decimal precision: Decimal(_,2) columns round on store, so a
  // higher-precision draft must not read as "still dirty" after it's saved.
  const numEq = (a, b) => {
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    return Math.round(Number(a) * 100) === Math.round(Number(b) * 100)
  }
  const programsEqual = (a, b) => {
    const sa = [...(a ?? [])].sort()
    const sb = [...(b ?? [])].sort()
    return sa.length === sb.length && sa.every((x, i) => x === sb[i])
  }
  const serverNotes =
    inputs?.notes == null || String(inputs.notes).trim() === '' ? null : String(inputs.notes).trim()
  const p = buildPayload()
  const dirty =
    canEdit &&
    !invalid &&
    inputs != null &&
    (!numEq(p.scholarshipFundsReceived, inputs.scholarshipFundsReceived) ||
      !programsEqual(p.programs, inputs.programs) ||
      p.fundsAtInsuredInstitution !== (inputs.fundsAtInsuredInstitution ?? null) ||
      p.avgDailyBalanceOver250k !== (inputs.avgDailyBalanceOver250k ?? null) ||
      p.bankRatingReviewedTopTwo !== (inputs.bankRatingReviewedTopTwo ?? null) ||
      p.reconciledWithin60Days !== (inputs.reconciledWithin60Days ?? null) ||
      p.reconciliationIndependentlyReviewed !== (inputs.reconciliationIndependentlyReviewed ?? null) ||
      p.doeStatusApproved !== (inputs.doeStatusApproved ?? null) ||
      !numEq(p.yearsInOperation, inputs.yearsInOperation) ||
      p.suretyBondPosted !== (inputs.suretyBondPosted ?? null) ||
      p.fesuaAnyAccountOver50k !== (inputs.fesuaAnyAccountOver50k ?? null) ||
      p.notes !== serverNotes)

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: JSON.stringify([
      scholarship, programs, fdic, over250k, bankRated, recon60,
      reconReviewed, doe, years, bond, fesuaOver50k, notes,
    ]),
    delay: 1000,
    save: async () => {
      await complianceApi.saveInputs(schoolId, periodId, buildPayload())
      // Order matters: refresh the input row, THEN re-run the findings.
      await reloadInputs?.()
      await onSaved?.()
    },
  })

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="card-flashy p-5"
    >
      <div className="mb-1 flex items-start gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <ClipboardCheck size={17} />
        </span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Compliance intake</h3>
          <p className="text-[12px] text-muted">
            {periodLabel ? `${periodLabel} · ` : ''}
            {canEdit
              ? 'Attestation inputs that turn most AUP sections into a real verdict.'
              : 'Read-only — only an owner or accountant can edit.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="shimmer-bar h-3 w-28 rounded" />
              <div className="shimmer-bar mt-2 h-11 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Scholarship funds received</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
                  $
                </span>
                <input
                  className={`${inputCls} pl-8`}
                  inputMode="decimal"
                  value={scholarship}
                  disabled={!canEdit}
                  onChange={(e) => setScholarship(sanitizeDecimal(e.target.value))}
                  placeholder="e.g. 300000"
                />
              </div>
              <p className="mt-1.5 text-[11px] italic text-muted">
                Drives the $250k AUP trigger and the §V coverage check.
              </p>
            </div>
            <div>
              <label className={labelCls}>Program tiers</label>
              <TierSelector
                selected={programs}
                onChange={canEdit ? setPrograms : undefined}
                disabled={!canEdit}
              />
              <p className="mt-1.5 text-[11px] italic text-muted">
                Scopes the FES-UA-only checks.
              </p>
            </div>

            <YesNo
              label="Funds at a federally-insured institution (§III.A)"
              value={fdic}
              onChange={setFdic}
              disabled={!canEdit}
            />
            <YesNo
              label="Avg daily balance over $250k (§III.A)"
              value={over250k}
              onChange={setOver250k}
              disabled={!canEdit}
            />
            <YesNo
              label="Bank rating reviewed / top two (§III.A)"
              value={bankRated}
              onChange={setBankRated}
              disabled={!canEdit}
              hint="Only required when the balance exceeds $250k."
            />
            <YesNo
              label="Reconciled within 60 days (§III.B)"
              value={recon60}
              onChange={setRecon60}
              disabled={!canEdit}
            />
            <YesNo
              label="Reconciliations independently reviewed (§III.B)"
              value={reconReviewed}
              onChange={setReconReviewed}
              disabled={!canEdit}
            />
            <YesNo
              label="DOE status approved (§I)"
              value={doe}
              onChange={setDoe}
              disabled={!canEdit}
            />

            <div>
              <label className={labelCls}>Years in operation</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={years}
                disabled={!canEdit}
                onChange={(e) => setYears(sanitizeInteger(e.target.value))}
                placeholder="e.g. 5"
              />
            </div>
            <YesNo
              label="Surety bond posted (eligibility)"
              value={bond}
              onChange={setBond}
              disabled={!canEdit}
              hint="Required when in operation fewer than 3 years."
            />
            <YesNo
              label="Any FES-UA account over $50k"
              value={fesuaOver50k}
              onChange={setFesuaOver50k}
              disabled={!canEdit}
              hint={isUA ? undefined : 'FES-UA only — select the FES-UA tier above.'}
            />

            <div className="sm:col-span-2">
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                value={notes}
                disabled={!canEdit}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional context for your CPA"
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
              className="mt-4"
            />
          )}
        </>
      )}
    </motion.div>
  )
}
