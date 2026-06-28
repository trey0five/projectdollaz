import { useState } from 'react'
import { Coins, Info } from 'lucide-react'
import { reconciliationApi } from '../../../lib/api.js'
import { useReconciliation } from '../../../hooks/useReconciliation.js'
import { MetricCardSkeleton } from '../../analytics/skeletons.jsx'
import ReconciliationHeadline from './ReconciliationHeadline.jsx'
import ReconciliationBreakdowns from './ReconciliationBreakdowns.jsx'
import DisbursementsTable from './DisbursementsTable.jsx'
import AnomaliesList from './AnomaliesList.jsx'
import DisbursementIntake from './DisbursementIntake.jsx'
import UseDisbursedTotalButton from './UseDisbursedTotalButton.jsx'

/**
 * Phase 2B — Scholarship Reconciliation section, placed on /readiness after the
 * compliance intake. Intakes the funding org's (Step Up For Students) per-
 * disbursement detail (parsed in-browser, columns mapped) and reconciles the SUM
 * against the school's RECORDED scholarship revenue (the 2A scholarshipFundsReceived,
 * "per the books"). Addresses AUP §IV at the disbursement-vs-recorded-revenue
 * level; per-student bank-deposit tracing stays a §IV CHECKLIST item. A one-click
 * action adopts the disbursed total as the recorded figure so 2A and 2B stay
 * consistent and the $250k trigger uses real data. Viewer is read-only.
 */
export default function ScholarshipReconciliationSection({
  schoolId,
  periodId,
  canEdit,
  onRecordedChanged,
}) {
  const { result, disbursements, loading, error, reload } = useReconciliation(schoolId, periodId)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const save = async (rows) => {
    setSaving(true)
    setSaveError('')
    try {
      await reconciliationApi.saveDisbursements(schoolId, periodId, rows)
      await reload()
    } catch {
      setSaveError('Could not save the disbursements.')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    setSaveError('')
    try {
      await reconciliationApi.clearDisbursements(schoolId, periodId)
      await reload()
    } catch {
      setSaveError('Could not clear the disbursement set.')
    } finally {
      setSaving(false)
    }
  }

  // After adopting the disbursed total as recorded revenue, refresh BOTH this
  // reconciliation and the 2A compliance badges (via the parent callback).
  const onApplied = async () => {
    await reload()
    await onRecordedChanged?.()
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient text-white shadow-glow">
          <Coins size={18} />
        </span>
        <div>
          <h2 className="font-serif text-lg font-semibold text-navy">Scholarship Reconciliation</h2>
          <p className="text-[14px] text-muted">
            Funding-org disbursements vs the recorded scholarship revenue (AUP §IV).
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-[14px] text-[#7a5e00]">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          A readiness pre-flag, not the official AUP or legal/audit advice. Per-student
          bank-deposit tracing remains a CPA checklist item — this reconciles the funding-org
          disbursed total against your recorded scholarship revenue.
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      ) : (
        <>
          {canEdit && (
            <DisbursementIntake
              existing={disbursements}
              saving={saving}
              onSave={save}
              onClear={clear}
            />
          )}
          {saveError && <p className="text-[14px] text-danger">{saveError}</p>}

          {result && (
            <>
              <ReconciliationHeadline result={result} />

              {result.totalDisbursed > 0 && (
                <UseDisbursedTotalButton
                  schoolId={schoolId}
                  periodId={periodId}
                  totalDisbursed={result.totalDisbursed}
                  recorded={result.recordedScholarshipRevenue}
                  canEdit={canEdit}
                  onApplied={onApplied}
                />
              )}

              {result.count > 0 && <ReconciliationBreakdowns result={result} />}

              <div className="card-flashy p-5">
                <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Anomalies
                </p>
                <AnomaliesList anomalies={result.anomalies} />
              </div>

              <div>
                <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Disbursements ({disbursements.length})
                </p>
                <DisbursementsTable disbursements={disbursements} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
