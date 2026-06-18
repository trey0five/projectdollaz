import { useState } from 'react'
import { Wand2, Check } from 'lucide-react'
import { complianceApi } from '../../../lib/api.js'
import { fmtDollar } from '../../../lib/format.js'

/**
 * One-click: set period_compliance_inputs.scholarshipFundsReceived = the
 * funding-org disbursed total. Keeps Phase 2A and 2B consistent so the $250k AUP
 * trigger / §V test run on the authoritative disbursed figure. Explicit/opt-in,
 * owner/accountant only. After saving it refreshes BOTH the reconciliation and
 * the 2A compliance badges via the passed callbacks.
 */
export default function UseDisbursedTotalButton({
  schoolId,
  periodId,
  totalDisbursed,
  recorded,
  canEdit,
  onApplied,
}) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  if (!canEdit) return null
  // Already consistent — nothing to do.
  const already = recorded != null && Math.abs(recorded - totalDisbursed) < 0.005
  if (totalDisbursed <= 0) return null

  const apply = async () => {
    setSaving(true)
    setErr('')
    try {
      await complianceApi.saveInputs(schoolId, periodId, {
        scholarshipFundsReceived: Math.round(totalDisbursed * 100) / 100,
      })
      setDone(true)
      await onApplied?.()
      setTimeout(() => setDone(false), 2500)
    } catch {
      setErr('Could not update the recorded figure.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={apply}
        disabled={saving || already}
        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors ${
          already
            ? 'cursor-default border-gold/30 bg-gold/5 text-[#7a5e00]'
            : 'border-gold/40 bg-gold-gradient text-white shadow-glow hover:opacity-90 disabled:opacity-60'
        }`}
      >
        {already || done ? <Check size={15} /> : <Wand2 size={15} />}
        {already
          ? 'Recorded figure already matches'
          : done
            ? 'Recorded figure updated'
            : `Use disbursed total (${fmtDollar(totalDisbursed)}) as recorded revenue`}
      </button>
      {err && <p className="text-[11px] text-danger">{err}</p>}
    </div>
  )
}
